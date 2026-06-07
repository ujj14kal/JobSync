"""
Gmail OAuth + email-based automatic job status tracking.

Flow:
  1. User clicks "Connect Gmail" → frontend calls GET /gmail/auth-url
  2. Frontend redirects browser to Google OAuth consent screen
  3. Google redirects back to GET /gmail/callback with ?code=...&state=...
  4. Backend exchanges code → stores access/refresh tokens in Supabase
  5. Backend redirects browser to frontend /jobs?gmail=connected
  6. Frontend calls POST /gmail/sync → we fetch emails, classify with Groq,
     match to user's job_applications, and auto-update statuses
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.groq_limiter import groq_call

router = APIRouter(prefix="/gmail", tags=["gmail-sync"])

# ─── Config (add to .env) ────────────────────────────────────────────────────
GOOGLE_CLIENT_ID     = getattr(settings, "GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = getattr(settings, "GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = getattr(settings, "GOOGLE_REDIRECT_URI",
                               "http://localhost:8000/api/v1/gmail/callback")
FRONTEND_URL         = getattr(settings, "FRONTEND_URL", "http://localhost:3000")

GMAIL_SCOPE       = "https://www.googleapis.com/auth/gmail.readonly"
GOOGLE_AUTH_BASE  = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL  = "https://oauth2.googleapis.com/token"
GMAIL_API         = "https://gmail.googleapis.com/gmail/v1"


# ─── State signing — carries user_id through the OAuth round-trip ─────────────
# We can't pass Authorization headers via a browser redirect, so we HMAC-sign
# the user_id into the `state` param and verify it in the callback.

def _sign_state(user_id: str) -> str:
    payload = json.dumps({"uid": user_id, "exp": int(time.time()) + 600})
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}|||{sig}".encode()).decode()


def _verify_state(state: str) -> str:
    """Returns user_id or raises HTTPException."""
    try:
        decoded = base64.urlsafe_b64decode(state.encode()).decode()
        payload, sig = decoded.rsplit("|||", 1)
        expected = hmac.new(
            settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        data = json.loads(payload)
        if data["exp"] < time.time():
            raise ValueError("expired")
        return data["uid"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Invalid OAuth state: {e}")


# ─── Token refresh ────────────────────────────────────────────────────────────

async def _get_valid_access_token(conn: dict) -> str:
    """Return a valid access token, auto-refreshing if it's about to expire."""
    expiry = datetime.fromisoformat(conn["token_expiry"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) < expiry - timedelta(minutes=5):
        return conn["access_token"]

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": conn["refresh_token"],
            "grant_type":    "refresh_token",
        })

    if r.status_code != 200:
        raise HTTPException(401, "Gmail token expired — please reconnect")

    tok = r.json()
    new_expiry = (
        datetime.now(timezone.utc) + timedelta(seconds=tok["expires_in"])
    ).isoformat()

    get_supabase().table("gmail_connections").update({
        "access_token": tok["access_token"],
        "token_expiry": new_expiry,
    }).eq("user_id", conn["user_id"]).execute()

    return tok["access_token"]


# ─── Gmail API helpers ────────────────────────────────────────────────────────

async def _fetch_job_emails(access_token: str, since_days: int = 14) -> list[dict]:
    """Fetch job-related emails using Gmail search operators."""
    after_ts = int((datetime.now(timezone.utc) - timedelta(days=since_days)).timestamp())
    query = (
        f"after:{after_ts} "
        "(subject:application OR subject:interview OR subject:offer OR "
        "subject:rejected OR subject:unfortunately OR subject:\"next steps\" OR "
        "subject:assessment OR subject:screening OR subject:congratulations OR "
        "subject:\"thank you for applying\" OR subject:\"we have reviewed\")"
    )
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{GMAIL_API}/users/me/messages",
            headers=headers,
            params={"q": query, "maxResults": 50},
        )
        if r.status_code != 200:
            return []

        message_ids = [m["id"] for m in r.json().get("messages", [])]

        emails: list[dict] = []
        for msg_id in message_ids[:25]:   # cap — 25 × 5 units = 125 quota units
            try:
                r2 = await client.get(
                    f"{GMAIL_API}/users/me/messages/{msg_id}",
                    headers=headers,
                    params={
                        "format": "metadata",
                        "metadataHeaders": ["Subject", "From", "Date"],
                    },
                )
                if r2.status_code == 200:
                    msg = r2.json()
                    hmap = {h["name"]: h["value"]
                            for h in msg.get("payload", {}).get("headers", [])}
                    emails.append({
                        "id":      msg_id,
                        "subject": hmap.get("Subject", ""),
                        "from":    hmap.get("From", ""),
                        "date":    hmap.get("Date", ""),
                        "snippet": msg.get("snippet", "")[:300],
                    })
            except Exception:
                continue

    return emails


# ─── Groq classification ──────────────────────────────────────────────────────

GROQ_STATUS_MAP = {
    "applied_confirmed": "applied",
    "screening":         "screening",
    "interview_scheduled": "interviewing",
    "offer":             "offer",
    "rejected":          "rejected",
    "withdrawn":         "withdrawn",
}

async def _classify_emails(
    emails: list[dict],
    job_companies: list[str],
) -> list[dict]:
    """
    Call Groq to classify each email into a job status update.
    Returns list of { email_index, company, status, confidence, subject }.
    """
    if not emails or not job_companies or not settings.GROQ_API_KEY:
        return []

    companies_csv = ", ".join(job_companies[:30])
    emails_block = "\n\n".join(
        f"[{i+1}] From: {e['from']}\nSubject: {e['subject']}\nSnippet: {e['snippet']}"
        for i, e in enumerate(emails[:15])
    )

    prompt = f"""You parse job application emails to extract status updates.

The user has applied to: {companies_csv}

Emails to analyse:
{emails_block}

Return a JSON array. Each element:
{{
  "email_index": <1-based int>,
  "company": "<company from user's list, exact match, or null>",
  "status": "<one of: applied_confirmed | screening | interview_scheduled | offer | rejected | other>",
  "confidence": <0.0-1.0>,
  "subject": "<email subject>"
}}

Rules:
- Only include emails that are clearly about a job application (recruiter/company → candidate).
- company must match one of the user's companies (case-insensitive substring OK).
- Only include items where confidence >= 0.7 and company is not null.
- If nothing qualifies, return [].
"""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=600,
            json_mode=True,
            use_cache=False,
        )
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            # Groq sometimes wraps in { "results": [...] }
            for key in ("results", "emails", "items", "data"):
                if isinstance(parsed.get(key), list):
                    return parsed[key]
    except Exception:
        pass
    return []


# ─── Company matching ─────────────────────────────────────────────────────────

def _match_company(detected: str, applications: list[dict]) -> Optional[dict]:
    """Fuzzy substring match — returns the best matching application or None."""
    d = detected.lower().strip()
    for app in applications:
        company = (app.get("company") or "").lower().strip()
        if d in company or company in d:
            return app
    return None


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/status")
async def gmail_status(user_id: str = Depends(get_current_user_id)):
    """Check whether the user has a connected Gmail account."""
    conn = (
        get_supabase()
        .table("gmail_connections")
        .select("gmail_email, last_synced_at, created_at")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if conn is None or not conn.data:
        return {"connected": False}
    return {
        "connected":      True,
        "gmail_email":    conn.data["gmail_email"],
        "last_synced_at": conn.data["last_synced_at"],
    }


@router.get("/auth-url")
async def get_auth_url(user_id: str = Depends(get_current_user_id)):
    """Return the Google OAuth consent-screen URL for this user."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(503, "Gmail integration not configured (missing GOOGLE_CLIENT_ID)")

    state = _sign_state(user_id)
    params = urlencode({
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope":         GMAIL_SCOPE,
        "access_type":   "offline",   # get refresh_token
        "prompt":        "consent",   # always show consent to ensure refresh_token
        "state":         state,
    })
    return {"url": f"{GOOGLE_AUTH_BASE}?{params}"}


@router.get("/callback")
async def gmail_callback(
    code:  str = Query(...),
    state: str = Query(...),
    error: Optional[str] = Query(None),
):
    """
    Google redirects the user's browser here after they approve access.
    No Authorization header — identity comes from the signed state param.
    """
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/jobs?gmail=error&reason={error}")

    user_id = _verify_state(state)

    # Exchange code for tokens
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })

    if r.status_code != 200:
        return RedirectResponse(f"{FRONTEND_URL}/jobs?gmail=error&reason=token_exchange")

    tok = r.json()
    refresh_token = tok.get("refresh_token")
    if not refresh_token:
        return RedirectResponse(f"{FRONTEND_URL}/jobs?gmail=error&reason=no_refresh_token")

    expiry = (
        datetime.now(timezone.utc) + timedelta(seconds=tok.get("expires_in", 3600))
    ).isoformat()

    # Get the user's Gmail address
    async with httpx.AsyncClient(timeout=10) as client:
        me = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tok['access_token']}"},
        )
    gmail_email = me.json().get("email", "") if me.status_code == 200 else ""

    # Upsert connection record
    get_supabase().table("gmail_connections").upsert({
        "user_id":       user_id,
        "gmail_email":   gmail_email,
        "access_token":  tok["access_token"],
        "refresh_token": refresh_token,
        "token_expiry":  expiry,
    }, on_conflict="user_id").execute()

    return RedirectResponse(f"{FRONTEND_URL}/jobs?gmail=connected")


@router.post("/sync")
async def sync_gmail(user_id: str = Depends(get_current_user_id)):
    """
    Fetch recent job emails, classify them with Groq, and auto-update
    matching job_applications statuses. Returns a summary of changes made.
    """
    supabase = get_supabase()

    # Load connection
    conn_res = (
        supabase.table("gmail_connections")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not conn_res.data:
        raise HTTPException(400, "Gmail not connected")

    conn = {**conn_res.data, "user_id": user_id}
    access_token = await _get_valid_access_token(conn)

    # Load user's job applications
    apps_res = (
        supabase.table("job_applications")
        .select("id, company, status, status_history")
        .eq("user_id", user_id)
        .execute()
    )
    applications = apps_res.data or []
    if not applications:
        return {"updates": [], "message": "No job applications to match against"}

    # Determine look-back window (since last sync, or 14 days if first time)
    last_synced = conn_res.data.get("last_synced_at")
    since_days = 14
    if last_synced:
        delta = datetime.now(timezone.utc) - datetime.fromisoformat(
            last_synced.replace("Z", "+00:00")
        )
        since_days = max(1, min(30, delta.days + 1))

    emails = await _fetch_job_emails(access_token, since_days=since_days)
    if not emails:
        supabase.table("gmail_connections").update({
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).execute()
        return {"updates": [], "message": "No job-related emails found"}

    job_companies = [a["company"] for a in applications if a.get("company")]
    classifications = await _classify_emails(emails, job_companies)

    # Apply updates
    updates_made: list[dict] = []
    now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    for item in classifications:
        detected_company = item.get("company")
        raw_status = item.get("status", "other")
        if not detected_company or raw_status == "other":
            continue

        new_status = GROQ_STATUS_MAP.get(raw_status)
        if not new_status:
            continue

        matched_app = _match_company(detected_company, applications)
        if not matched_app:
            continue

        # Don't downgrade status (e.g., don't go offer → screening)
        STATUS_ORDER = ["saved", "applied", "screening", "interviewing", "offer", "rejected", "withdrawn"]
        current_idx = STATUS_ORDER.index(matched_app["status"]) if matched_app["status"] in STATUS_ORDER else 0
        new_idx     = STATUS_ORDER.index(new_status) if new_status in STATUS_ORDER else 0

        # Allow rejected/withdrawn at any point, otherwise only upgrade
        if new_status not in ("rejected", "withdrawn") and new_idx <= current_idx:
            continue

        # Append to status_history
        history = matched_app.get("status_history") or []
        history.append({
            "status":    new_status,
            "timestamp": now_iso,
            "note":      f"Auto-detected via Gmail: {item.get('subject', '')[:60]}",
        })

        supabase.table("job_applications").update({
            "status":         new_status,
            "status_history": history,
        }).eq("id", matched_app["id"]).eq("user_id", user_id).execute()

        updates_made.append({
            "company":    matched_app["company"],
            "old_status": matched_app["status"],
            "new_status": new_status,
            "subject":    item.get("subject", ""),
        })

        # Update local list so we don't double-process the same app
        matched_app["status"] = new_status

    # Mark sync time
    supabase.table("gmail_connections").update({
        "last_synced_at": now_iso,
    }).eq("user_id", user_id).execute()

    return {
        "updates": updates_made,
        "emails_checked": len(emails),
        "message": f"{len(updates_made)} job(s) updated automatically",
    }


@router.delete("/disconnect", status_code=204)
async def disconnect_gmail(user_id: str = Depends(get_current_user_id)):
    """Remove the Gmail connection for this user."""
    get_supabase().table("gmail_connections").delete().eq("user_id", user_id).execute()
