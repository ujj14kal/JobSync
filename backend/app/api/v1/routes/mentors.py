"""Mentor discovery endpoints."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.mentor_finder import find_mentors_for_analysis, _platform_card

router = APIRouter(prefix="/mentors", tags=["mentors"])


class MentorSearchRequest(BaseModel):
    role: Optional[str] = None
    company: Optional[str] = None
    skills: Optional[list[str]] = None
    career_stage: Optional[str] = "entry"
    platform: Optional[str] = None


@router.get("/recommendations/{analysis_id}")
async def get_mentor_recommendations(
    analysis_id: str,
    country: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    supabase = get_supabase()

    analysis = (
        supabase.table("analyses")
        .select("*, job_descriptions(*)")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not analysis.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    a = analysis.data
    job = a.get("job_descriptions") or {}
    parsed_job = job.get("parsed_data", {})

    target_role = parsed_job.get("title", "Software Engineer")
    target_company = job.get("company_name", "")
    skill_gaps = [sg["skill"] for sg in (a.get("skill_gaps") or [])[:5]]

    profile = (
        supabase.table("user_profiles")
        .select("career_stage")
        .eq("id", user_id)
        .single()
        .execute()
    )
    career_stage = profile.data.get("career_stage", "entry") if profile.data else "entry"

    mentors = await find_mentors_for_analysis(
        target_role=target_role,
        target_company=target_company,
        skill_gaps=skill_gaps,
        career_stage=career_stage,
        analysis_embedding=a.get("embedding") or [],
        country=country or "",
    )
    return mentors


@router.post("/search")
async def search_mentors(
    request: MentorSearchRequest,
    user_id: str = Depends(get_current_user_id),
):
    role = request.role or "Software Engineer"
    skills = request.skills or []

    mentors = await find_mentors_for_analysis(
        target_role=role,
        target_company=request.company or "",
        skill_gaps=skills,
        career_stage=request.career_stage or "entry",
        analysis_embedding=[],
    )
    return mentors
