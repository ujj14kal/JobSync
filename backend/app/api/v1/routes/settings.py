"""User Settings endpoints."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    # Notifications
    email_notifications: Optional[bool] = None
    analysis_notifications: Optional[bool] = None
    mentor_notifications: Optional[bool] = None
    weekly_digest: Optional[bool] = None
    marketing_emails: Optional[bool] = None
    # Career prefs
    career_stage: Optional[str] = None
    target_roles: Optional[list[str]] = None
    target_companies: Optional[list[str]] = None
    preferred_job_types: Optional[list[str]] = None
    preferred_work_modes: Optional[list[str]] = None
    preferred_locations: Optional[list[str]] = None
    salary_expectation_min: Optional[int] = None
    salary_expectation_max: Optional[int] = None
    salary_currency: Optional[str] = None
    # Scoring
    scoring_weights: Optional[dict] = None
    # Privacy
    profile_public: Optional[bool] = None
    share_analytics: Optional[bool] = None
    # App prefs
    theme: Optional[str] = None
    language: Optional[str] = None
    timezone: Optional[str] = None


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    career_stage: Optional[str] = None
    target_role: Optional[str] = None
    target_company: Optional[str] = None
    industry: Optional[str] = None


@router.get("")
async def get_settings(user_id: str = Depends(get_current_user_id)):
    """Get user settings, creating defaults if not exist."""
    supabase = get_supabase()

    result = (
        supabase.table("user_settings")
        .select("*")
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        # Auto-create defaults
        defaults = {"user_id": user_id}
        insert_result = supabase.table("user_settings").insert(defaults).execute()
        return insert_result.data[0] if insert_result.data else defaults

    return result.data


@router.patch("")
async def update_settings(
    body: SettingsUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Update user settings."""
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, detail="No fields to update")

    # Validate scoring weights if provided
    if "scoring_weights" in updates:
        w = updates["scoring_weights"]
        total = sum(w.values())
        if abs(total - 1.0) > 0.05:
            raise HTTPException(400, detail=f"Scoring weights must sum to 1.0, got {total:.2f}")

    result = (
        supabase.table("user_settings")
        .upsert({"user_id": user_id, **updates})
        .execute()
    )
    return result.data[0] if result.data else updates


@router.get("/profile")
async def get_profile(user_id: str = Depends(get_current_user_id)):
    """Get user profile."""
    supabase = get_supabase()
    result = (
        supabase.table("user_profiles")
        .select("*")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(404, detail="Profile not found")
    return result.data


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Update user profile."""
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, detail="No fields to update")

    result = (
        supabase.table("user_profiles")
        .update(updates)
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, detail="Profile not found")
    return result.data[0]


@router.delete("/account")
async def delete_account(user_id: str = Depends(get_current_user_id)):
    """Delete user account and all associated data."""
    supabase = get_supabase()
    # Cascade deletes handle related data (resumes, analyses, etc.)
    supabase.table("user_profiles").delete().eq("id", user_id).execute()
    try:
        supabase.auth.admin.delete_user(user_id)
    except Exception:
        pass
    return {"message": "Account deleted successfully"}
