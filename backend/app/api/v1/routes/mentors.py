"""Mentor discovery and recommendation endpoints."""
from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.mentor_finder import find_mentors_for_analysis, rank_mentors, fetch_unstop_mentors as scrape_unstop_mentors

router = APIRouter(prefix="/mentors", tags=["mentors"])


class MentorSearchRequest(BaseModel):
    role: Optional[str] = None
    company: Optional[str] = None
    skills: Optional[list[str]] = None
    career_stage: Optional[str] = "entry"
    platform: Optional[str] = None


class UnstopDiscoverRequest(BaseModel):
    target_role: str
    target_company: Optional[str] = None
    skills: list[str] = []


@router.get("/recommendations/{analysis_id}")
async def get_mentor_recommendations(
    analysis_id: str,
    country: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Get personalized mentor recommendations based on an analysis.
    """
    supabase = get_supabase()

    # Get analysis details
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

    # Extract context
    target_role = parsed_job.get("title", "Software Engineer")
    target_company = job.get("company_name", "")
    skill_gaps = [sg["skill"] for sg in (a.get("skill_gaps") or [])[:5]]

    # Get user profile for career stage
    profile = (
        supabase.table("user_profiles")
        .select("career_stage")
        .eq("id", user_id)
        .single()
        .execute()
    )
    career_stage = profile.data.get("career_stage", "entry") if profile.data else "entry"

    # Find mentors (country drives region-specific results)
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
    """Generic mentor search."""
    supabase = get_supabase()

    # Try DB first
    query = supabase.table("mentors").select("*").limit(50)

    if request.platform and request.platform != "All":
        query = query.eq("platform", request.platform.lower())

    result = query.execute()
    mentors = result.data or []

    if not mentors or (request.role and not request.company):
        # Scrape for specific role
        scraped = await scrape_unstop_mentors(
            role=request.role or "Software Engineer",
            skills=request.skills or [],
        )
        mentors.extend(scraped)

    # Rank
    ranked = rank_mentors(
        mentors=mentors,
        target_role=request.role or "",
        target_company=request.company or "",
        skill_gaps=request.skills or [],
        career_stage=request.career_stage or "entry",
    )

    # Sort free mentors first, then by match score
    ranked.sort(key=lambda m: (0 if m.get("is_free") else 1, -m.get("match_score", 0)))
    return ranked[:25]


@router.post("/discover/unstop")
async def discover_unstop_mentors(
    request: UnstopDiscoverRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Discover mentors from Unstop for a specific role."""
    mentors = await scrape_unstop_mentors(
        role=request.target_role,
        skills=request.skills,
    )

    ranked = rank_mentors(
        mentors=mentors,
        target_role=request.target_role,
        target_company=request.target_company or "",
        skill_gaps=request.skills,
        career_stage="entry",
    )

    return ranked
