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
import re
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

def _extract_body_text(payload: dict) -> str:
    """Recursively extract plaintext body from Gmail API full-format payload."""
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            try:
                return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
            except Exception:
                pass
    for part in payload.get("parts", []):
        result = _extract_body_text(part)
        if result:
            return result
    return ""


async def _fetch_job_emails(access_token: str, since_days: int = 14) -> list[dict]:
    """Fetch job-related emails using Gmail search operators, including Spam folder."""
    after_ts = int((datetime.now(timezone.utc) - timedelta(days=since_days)).timestamp())
    # in:anywhere — includes Inbox, Spam, Sent, All Mail so test/unknown-sender
    # emails that land in Spam are still found.
    query = (
        f"after:{after_ts} in:anywhere "
        "("
        "subject:application OR subject:interview OR subject:offer OR "
        "subject:rejected OR subject:unfortunately OR subject:\"next steps\" OR "
        "subject:assessment OR subject:screening OR subject:congratulations OR "
        "subject:\"thank you for applying\" OR subject:\"we have reviewed\" OR "
        "subject:\"offer letter\" OR subject:appointed OR subject:selected OR "
        "subject:joining OR subject:onboarding OR subject:\"we are pleased\" OR "
        "subject:\"happy to inform\" OR subject:\"pleased to offer\" OR "
        "subject:\"you have been selected\" OR subject:\"welcome to\" OR "
        "subject:\"your application\" OR subject:\"job offer\" OR "
        "subject:\"appointment letter\" OR subject:shortlisted OR "
        "subject:\"next round\" OR subject:\"move forward\" OR "
        "subject:\"documents required\" OR subject:\"document verification\" OR "
        "subject:intern OR subject:internship OR subject:\"quick interaction\" OR "
        "subject:\"final round\" OR subject:hired OR subject:recruited OR "
        "subject:invitation OR subject:\"pleased to invite\" OR subject:regret"
        ")"
    )
    headers = {"Authorization": f"Bearer {access_token}"}

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{GMAIL_API}/users/me/messages",
            headers=headers,
            params={"q": query, "maxResults": 50},
        )
        if r.status_code != 200:
            print(f"[gmail_sync] Gmail search failed: {r.status_code} {r.text[:200]}", flush=True)
            return []

        message_ids = [m["id"] for m in r.json().get("messages", [])]
        print(f"[gmail_sync] Gmail search returned {len(message_ids)} message IDs", flush=True)

        emails: list[dict] = []
        for msg_id in message_ids[:40]:
            try:
                # Fetch full message to get body text (not just snippet)
                r2 = await client.get(
                    f"{GMAIL_API}/users/me/messages/{msg_id}",
                    headers=headers,
                    params={"format": "full"},
                )
                if r2.status_code == 200:
                    msg = r2.json()
                    hmap = {h["name"]: h["value"]
                            for h in msg.get("payload", {}).get("headers", [])}
                    body = _extract_body_text(msg.get("payload", {}))
                    emails.append({
                        "id":      msg_id,
                        "subject": hmap.get("Subject", ""),
                        "from":    hmap.get("From", ""),
                        "date":    hmap.get("Date", ""),
                        "snippet": msg.get("snippet", "")[:300],
                        "body":    body[:1500],  # first 1500 chars of body
                    })
            except Exception:
                continue

    return emails


# ─── Groq classification ──────────────────────────────────────────────────────

GROQ_STATUS_MAP = {
    "applied_confirmed":   "applied",
    "screening":           "screening",
    "interview_scheduled": "interviewing",
    "offer":               "offer",
    "rejected":            "rejected",
    "withdrawn":           "withdrawn",
    # aliases Groq sometimes produces
    "interview":           "interviewing",
    "offer_extended":      "offer",
    "not_selected":        "rejected",
}

async def _classify_emails(emails: list[dict]) -> list[dict]:
    """
    Call Groq to classify each email into a job status update.
    Extracts company directly from the email — no pre-defined company list needed.
    Returns list of {email_index, company, job_title, status, confidence, subject}.
    """
    if not emails or not settings.GROQ_API_KEY:
        return []

    # Keep prompt under ~6k chars — use subject+snippet only; add body only when
    # snippet is very short (< 80 chars). Cap at 20 emails.
    def _email_block(i: int, e: dict) -> str:
        snippet = e.get("snippet", "")
        body = e.get("body", "")
        context = snippet if len(snippet) >= 80 else (snippet + " " + body[:300]).strip()
        return f"[{i+1}] From: {e['from']}\nSubject: {e['subject']}\nContext: {context[:400]}"

    emails_block = "\n\n".join(
        _email_block(i, e) for i, e in enumerate(emails[:20])
    )

    prompt = f"""You are an AI that detects job application status updates in emails.

Emails to analyse:
{emails_block}

Return a JSON array. Each element:
{{
  "email_index": <1-based int>,
  "company": "<company/organisation name — extract from sender domain, body, or subject>",
  "job_title": "<job role if mentioned, or null>",
  "status": "<one of: applied_confirmed | screening | interview_scheduled | offer | rejected | withdrawn | other>",
  "confidence": <0.0-1.0>,
  "subject": "<email subject>"
}}

INCLUDE an item if the email is from a recruiter/company/HR system to a job candidate with a clear status signal:

Status signals:
- interview_scheduled: subject/body contains "interview", "interview invitation", "invited for an interview", "schedule an interview", "next round", "technical round", "HR round", "quick call", "quick interaction", calendar invite from HR.
- offer: "offer letter", "appointment letter", "CTC", "joining date", "welcome aboard", "documents required" (onboarding context), "congratulations on your selection", "pleased to offer", "we are pleased to extend".
- rejected: "unfortunately", "not moving forward", "not selected", "regret to inform", "we have decided not", "other candidates", "not shortlisted".
- screening: "shortlisted", "initial screening", "online assessment", "coding challenge", "HackerRank", "Mettl", "aptitude test", selected for next stage.
- applied_confirmed: "received your application", "thank you for applying", "application confirmed", "application received".
- withdrawn: "withdrawn", "no longer being considered", "position filled", "role closed".

For confidence: use 0.9 if the signal is unambiguous (e.g. "Interview Invitation" in subject). Use 0.7 if context is present in the body. Use 0.5 if only weakly implied.

EXCLUDE (set status to "other"):
- Marketing emails, newsletters, or promotional content — even if they use words like "selected", "application", "congratulations", or "shortlisted" in a generic/marketing context (e.g. "selected courses for you", "your application is amazing, enrol now", "congratulations on joining our newsletter").
- Job listing digests or job recommendations (e.g. LinkedIn "Jobs you may like", Naukri daily digest).
- Course/education platform emails (e.g. Coding Ninjas, Coursera, Udemy, Internshala course emails).
- Hotel, travel, food delivery, or e-commerce promotional emails.
- GitHub/Supabase/tool notifications.
- Any email where the "company" is just guessed from a marketing brand and there is no actual job status update.

Extract the company name from the sender domain or body (e.g. @imaginemarketingindia.com + "boAt" in subject → company is "boAt").
Only include items with confidence >= 0.65, a non-null company, and status != "other".
If nothing qualifies, return [].
"""

    print(f"[gmail_sync] sending {len(emails[:20])} emails to Groq, prompt chars={len(prompt)}", flush=True)
    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1200,
            json_mode=True,
            use_cache=False,
        )
        print(f"[gmail_sync] Groq raw response: {raw[:500]}", flush=True)
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict):
            for key in ("results", "emails", "items", "data", "classifications"):
                if isinstance(parsed.get(key), list):
                    return parsed[key]
        print(f"[gmail_sync] Groq returned unexpected shape: {type(parsed)}", flush=True)
    except Exception as e:
        print(f"[gmail_sync] Groq error: {e}", flush=True)
    return []


# ─── Company matching ─────────────────────────────────────────────────────────

def _normalize(s: str) -> str:
    """Lowercase, strip legal suffixes and punctuation for fuzzy matching."""
    s = s.lower().strip()
    # Remove common legal suffixes
    s = re.sub(r"\b(pvt|ltd|inc|llc|llp|corp|private|limited|technologies|tech|solutions|services)\b", "", s)
    # Remove non-alphanumeric (hyphens, dots, etc.)
    s = re.sub(r"[^a-z0-9\s]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _match_company(detected: str, applications: list[dict]) -> Optional[dict]:
    """Fuzzy substring match with normalization — returns best match or None."""
    d = _normalize(detected)
    if not d:
        return None
    best: Optional[dict] = None
    best_len = 0
    for app in applications:
        company = _normalize(app.get("company") or "")
        if not company:
            continue
        # Substring match in either direction; prefer longer (more specific) match
        if d in company or company in d:
            match_len = min(len(d), len(company))
            if match_len > best_len:
                best = app
                best_len = match_len
    return best


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

    # Determine look-back window.
    # Always scan at least 7 days so an email that arrived between two
    # same-day syncs is never missed (delta.days would be 0 → window was 1 day).
    last_synced = conn_res.data.get("last_synced_at")
    since_days = 30  # default: 30 days on first sync to catch recent history
    if last_synced:
        delta = datetime.now(timezone.utc) - datetime.fromisoformat(
            last_synced.replace("Z", "+00:00")
        )
        since_days = max(7, min(30, delta.days + 1))  # 7–30 days on subsequent syncs

    print(f"[gmail_sync] since_days={since_days} last_synced={last_synced} apps={len(applications)}", flush=True)

    emails = await _fetch_job_emails(access_token, since_days=since_days)
    print(f"[gmail_sync] fetched {len(emails)} emails: {[e['subject'][:60] for e in emails]}", flush=True)
    if not emails:
        supabase.table("gmail_connections").update({
            "last_synced_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", user_id).execute()
        return {"updates": [], "suggestions": [], "emails_checked": 0, "message": "No job-related emails found"}

    classifications = await _classify_emails(emails)
    print(f"[gmail_sync] classifications: {classifications}", flush=True)

    STATUS_ORDER = ["saved", "applied", "screening", "interviewing", "offer", "rejected", "withdrawn"]

    updates_made: list[dict] = []
    new_applications: list[dict] = []
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

        if matched_app:
            # ── Update existing application ───────────────────────────────
            current_idx = STATUS_ORDER.index(matched_app["status"]) if matched_app["status"] in STATUS_ORDER else 0
            new_idx     = STATUS_ORDER.index(new_status) if new_status in STATUS_ORDER else 0

            # Only upgrade, except rejected/withdrawn can come at any point
            if new_status not in ("rejected", "withdrawn") and new_idx <= current_idx:
                continue

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

            matched_app["status"] = new_status

        else:
            # ── Suggest new application — do NOT auto-create ──────────────
            # Only surface high-confidence detections as suggestions the user
            # can review and accept in the UI. Never insert without user action.
            confidence = item.get("confidence", 0)
            if confidence < 0.55:
                continue

            # Deduplicate within the same sync run
            already_suggested = any(
                _normalize(s["company"]) == _normalize(detected_company)
                for s in new_applications
            )
            if already_suggested:
                continue

            new_applications.append({
                "company":   detected_company,
                "job_title": item.get("job_title") or "Position",
                "status":    new_status,
                "subject":   item.get("subject", ""),
                "confidence": confidence,
            })

    # Mark sync time
    supabase.table("gmail_connections").update({
        "last_synced_at": now_iso,
    }).eq("user_id", user_id).execute()

    return {
        "updates":      updates_made,
        "suggestions":  new_applications,   # user must accept these to add them
        "emails_checked": len(emails),
        "message": f"{len(updates_made)} status update(s), {len(new_applications)} suggestion(s) to review",
    }


@router.delete("/disconnect", status_code=204)
async def disconnect_gmail(user_id: str = Depends(get_current_user_id)):
    """Remove the Gmail connection for this user."""
    get_supabase().table("gmail_connections").delete().eq("user_id", user_id).execute()
