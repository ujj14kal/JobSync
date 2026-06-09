"""
/api/v1/auth — Firebase auth → Supabase session exchange.

Supported flows
───────────────
• POST /phone-login   — Firebase phone OTP → Supabase session
• POST /google-login  — Firebase Google Sign-In → Supabase session

In both cases the frontend verifies the user with Firebase, gets a Firebase
ID token, and POSTs it here.  We verify the token with firebase-admin, upsert
the user in Supabase via the admin API, then return a Supabase
access_token + refresh_token the frontend can call setSession() with.
"""

from __future__ import annotations

import hashlib
import hmac
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
    email: str = ""
    full_name: str = ""
    career_stage: str = ""
    target_role: str = ""


class GoogleLoginRequest(BaseModel):
    id_token: str   # Firebase ID token from signInWithPopup / signInWithRedirect


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

    # Use real email if provided; fall back to a derived key so GoTrue doesn't
    # need phone auth enabled. Derived email is never shown or emailed to the user.
    user_email = body.email.strip() if body.email and body.email.strip() else \
        f"{phone.lstrip('+').replace(' ', '')}@phone.jobsynk.in"

    # Derive a stable password from the firebase_uid + secret key.
    # Never shown to the user — only used server-side to issue a session.
    user_password = hmac.new(
        settings.SECRET_KEY.encode(),
        firebase_uid.encode(),
        hashlib.sha256,
    ).hexdigest()

    try:
        metadata = {
            "firebase_uid": firebase_uid,
            "phone": phone,
            "full_name": body.full_name,
            "career_stage": body.career_stage,
            "target_role": body.target_role,
            "auth_provider": "firebase_phone",
        }
        try:
            sb.auth.admin.create_user({
                "email": user_email,
                "password": user_password,
                "email_confirm": True,
                "user_metadata": metadata,
            })
            logger.info("Created new Supabase user for phone %s", phone)
        except Exception as create_exc:
            err_str = str(create_exc).lower()
            if not any(kw in err_str for kw in ("already", "duplicate", "exists", "database error")):
                raise
            # Email already exists — only allow sign-in if it belongs to THIS firebase_uid.
            # If a different user owns this email, reject to prevent account hijacking.
            users_resp = sb.auth.admin.list_users()
            existing = next((u for u in users_resp if u.email == user_email), None)
            if not existing:
                raise HTTPException(status_code=409, detail="Email already in use by another account")
            existing_uid = (existing.user_metadata or {}).get("firebase_uid", "")
            if existing_uid != firebase_uid:
                # Includes the case where existing_uid is "" (no firebase_uid = not a
                # phone-auth account) — never let a phone signup hijack it.
                raise HTTPException(
                    status_code=409,
                    detail="This email is already registered. Please use a different email or sign in.",
                )
            # Same firebase_uid — returning user. Refresh password so sign-in works.
            sb.auth.admin.update_user_by_id(existing.id, {"password": user_password})
            logger.info("Returning phone user %s — refreshed password", existing.id)

        # Sign in with the derived password to get a real session
        from supabase import create_client
        sb_anon = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        session_resp = sb_anon.auth.sign_in_with_password({"email": user_email, "password": user_password})
        session = session_resp.session
        user_id = session_resp.user.id

        return SessionResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            user_id=user_id,
            phone=phone,
        )

    except Exception as exc:
        logger.error("Supabase session creation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Could not create session: {exc}",
        )


# ── Google login ──────────────────────────────────────────────────────────────

@router.post("/google-login", response_model=SessionResponse)
async def google_login(body: GoogleLoginRequest):
    """
    Exchange a Firebase ID token (from Google Sign-In) for a Supabase session.

    The frontend calls Firebase signInWithPopup(auth, new GoogleAuthProvider()),
    gets the user's ID token, and sends it here.  We verify it, upsert the
    Supabase user by email, and return a Supabase session.
    """
    # 1. Verify Firebase token
    try:
        from firebase_admin import auth as fb_auth
        _get_firebase_app()
        decoded = fb_auth.verify_id_token(body.id_token)
    except Exception as exc:
        logger.warning("Firebase Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Firebase ID token")

    firebase_uid: str = decoded["uid"]
    email: str | None = decoded.get("email")
    name: str = decoded.get("name", "")
    picture: str = decoded.get("picture", "")

    if not email:
        raise HTTPException(
            status_code=400,
            detail="Email not found in Google token — ensure email scope was requested",
        )

    # 2. Upsert Supabase user by email
    sb = _supabase_admin()

    # Derive a stable password from firebase_uid so we can issue a session via
    # sign_in_with_password (supabase-py 2.x has no admin.create_session).
    user_password = hmac.new(
        settings.SECRET_KEY.encode(),
        firebase_uid.encode(),
        hashlib.sha256,
    ).hexdigest()

    try:
        try:
            new_user = sb.auth.admin.create_user({
                "email": email,
                "password": user_password,
                "email_confirm": True,
                "user_metadata": {
                    "firebase_uid": firebase_uid,
                    "full_name": name,
                    "avatar_url": picture,
                    "auth_provider": "firebase_google",
                },
            })
            user_id = new_user.user.id
            logger.info("Created new Supabase user %s for email %s", user_id, email)
        except Exception as create_exc:
            err_str = str(create_exc).lower()
            if not any(kw in err_str for kw in ("already", "duplicate", "exists")):
                raise
            users_resp = sb.auth.admin.list_users()
            existing = next((u for u in users_resp if u.email == email), None)
            if not existing:
                raise RuntimeError(f"User with email {email} not found after duplicate error") from create_exc
            user_id = existing.id
            sb.auth.admin.update_user_by_id(
                user_id,
                {
                    "password": user_password,
                    "user_metadata": {
                        "full_name": existing.user_metadata.get("full_name") or name,
                        "avatar_url": existing.user_metadata.get("avatar_url") or picture,
                        "firebase_uid": firebase_uid,
                        "auth_provider": "firebase_google",
                    },
                },
            )
            logger.info("Found existing Supabase user %s for email %s", user_id, email)

        # Sign in with derived password to get a real session token
        from supabase import create_client
        sb_anon = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
        session_resp = sb_anon.auth.sign_in_with_password({"email": email, "password": user_password})
        session = session_resp.session

        return SessionResponse(
            access_token=session.access_token,
            refresh_token=session.refresh_token,
            user_id=user_id,
            email=email,
        )

    except Exception as exc:
        logger.error("Supabase Google session creation failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Could not create session: {exc}",
        )
