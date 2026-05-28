"""
/api/v1/auth — Firebase phone auth → Supabase session exchange.

Flow:
  1. Frontend verifies phone OTP with Firebase and gets a Firebase ID token.
  2. POST /api/v1/auth/phone-login with { id_token, phone }
  3. Backend verifies ID token with firebase-admin, extracts phone number.
  4. Upserts a Supabase user via the admin API (no password needed — phone-only account).
  5. Returns a Supabase access_token + refresh_token the frontend stores.
"""

from __future__ import annotations

import json
import logging
from functools import lru_cache

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Firebase admin init (lazy, singleton) ─────────────────────────────────────

@lru_cache(maxsize=1)
def _get_firebase_app():
    """Initialise firebase-admin once; returns the App object."""
    try:
        import firebase_admin
        from firebase_admin import credentials, auth as fb_auth  # noqa: F401

        if firebase_admin._DEFAULT_APP_NAME in firebase_admin._apps:
            return firebase_admin.get_app()

        sa_json = settings.FIREBASE_SERVICE_ACCOUNT_JSON
        if not sa_json:
            raise RuntimeError(
                "FIREBASE_SERVICE_ACCOUNT_JSON env var is not set. "
                "Download your Firebase service-account JSON from "
                "Firebase Console → Project settings → Service accounts."
            )

        sa_dict = json.loads(sa_json)
        cred = credentials.Certificate(sa_dict)
        app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialised (project: %s)", sa_dict.get("project_id"))
        return app

    except ImportError as exc:
        raise RuntimeError("firebase-admin is not installed") from exc


# ── Supabase admin client (no JWT, uses service role key) ────────────────────

def _supabase_admin():
    from supabase import create_client
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


# ── Request / response models ─────────────────────────────────────────────────

class PhoneLoginRequest(BaseModel):
    id_token: str   # Firebase ID token obtained after OTP verification
    phone: str      # E.164 format e.g. +919876543210 (used for display / profile)
    full_name: str = ""
    career_stage: str = ""
    target_role: str = ""


class SessionResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: str
    email: str | None = None
    phone: str | None = None


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post("/phone-login", response_model=SessionResponse)
async def phone_login(body: PhoneLoginRequest):
    """
    Exchange a Firebase ID token (from phone OTP) for a Supabase session.
    """
    # 1. Verify Firebase token
    try:
        from firebase_admin import auth as fb_auth
        _get_firebase_app()                              # ensure SDK is initialised
        decoded = fb_auth.verify_id_token(body.id_token)
    except Exception as exc:
        logger.warning("Firebase token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Firebase ID token")

    firebase_uid: str = decoded["uid"]
    phone: str = decoded.get("phone_number") or body.phone

    if not phone:
        raise HTTPException(status_code=400, detail="Phone number not found in token")

    # 2. Upsert Supabase user (admin API — no password required)
    sb = _supabase_admin()

    try:
        # Try to find existing user by phone
        users_resp = sb.auth.admin.list_users()
        existing = next(
            (u for u in users_resp if u.phone == phone),
            None,
        )

        if existing:
            user_id = existing.id
        else:
            # Create new user
            create_payload: dict = {
                "phone": phone,
                "phone_confirm": True,
                "user_metadata": {
                    "firebase_uid": firebase_uid,
                    "full_name": body.full_name,
                    "career_stage": body.career_stage,
                    "target_role": body.target_role,
                    "auth_provider": "firebase_phone",
                },
            }
            new_user = sb.auth.admin.create_user(create_payload)
            user_id = new_user.id

        # 3. Create a magic-link style session (admin-generated token)
        link_resp = sb.auth.admin.generate_link({
            "type": "magiclink",
            "email": f"phone_{firebase_uid}@firebase.jobsync.internal",
        })
        # The above gives us a link — instead just sign in with a one-time token
        # Better: use admin.create_session (supabase-py ≥ 2.5 exposes this)
        session = sb.auth.admin.create_session(user_id)
        return SessionResponse(
            access_token=session.session.access_token,
            refresh_token=session.session.refresh_token,
            user_id=user_id,
            phone=phone,
        )

    except Exception as exc:
        logger.error("Supabase session creation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Could not create session: {exc}",
        )
