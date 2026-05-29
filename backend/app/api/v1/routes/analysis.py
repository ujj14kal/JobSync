"""ATS Analysis endpoints."""
from __future__ import annotations

import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.ats_engine import compute_all_scores
from app.services.ai_scorer import score_with_ai_timeout
from app.services.ai_feedback import generate_recruiter_feedback, generate_bullet_rewrites
from app.services.embedding_service import embed_text
from app.services.cache_service import (
    get_cached_analysis,
    get_user_analyses_today,
    increment_user_quota_cache,
)
from app.services import active_tracker

router = APIRouter(prefix="/analysis", tags=["analysis"])


class CreateAnalysisRequest(BaseModel):
    resume_id: str
    job_id: str


# ── Status endpoint (public — no auth required) ───────────────────────────────
# IMPORTANT: must be registered BEFORE /{analysis_id} to avoid "status"
# being captured as a UUID param.

@router.get("/status")
async def get_service_status():
    """
    Public endpoint — returns current analysis capacity.
    Frontend polls this every 10 s to show live availability badge.
    No auth required (read-only, no user data exposed).
    """
    info = active_tracker.capacity_info()
    return {
        **info,
        "daily_limit_per_user": settings.MAX_ANALYSES_PER_DAY,
        "message": (
            "Service is at capacity. Please try again in a moment."
            if info["at_capacity"]
            else f"{info['slots_available']} analysis slot(s) available."
        ),
    }


# ── Create analysis ───────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_analysis(
    request: CreateAnalysisRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a new ATS analysis.

    Guards (in order):
      1. Deduplication   — same (resume_id, job_id) pair → return cached result
      2. Daily quota     — 429 if user exceeded MAX_ANALYSES_PER_DAY
      3. Global capacity — 503 if MAX_CONCURRENT_ANALYSES slots are taken
      4. Ownership       — 404 if resume/job not found for this user

    Returns immediately; the heavy work runs in a background task.
    """
    supabase = get_supabase()

    # ── 1. Deduplication ──────────────────────────────────────────────────────
    existing_id = await get_cached_analysis(request.resume_id, request.job_id)
    if existing_id:
        result = (
            supabase.table("analyses")
            .select("*")
            .eq("id", existing_id)
            .single()
            .execute()
        )
        if result.data:
            return {**result.data, "cached": True}

    # ── 2. Per-user daily quota ────────────────────────────────────────────────
    analyses_today = await get_user_analyses_today(user_id)
    if analyses_today >= settings.MAX_ANALYSES_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Daily analysis limit reached ({settings.MAX_ANALYSES_PER_DAY}/day). "
                "Try again tomorrow."
            ),
        )

    # ── 3. Global concurrency cap ─────────────────────────────────────────────
    # Check before touching the DB to fail fast.
    info = active_tracker.capacity_info()
    if info["at_capacity"]:
        raise HTTPException(
            status_code=503,
            detail={
                "message": (
                    f"Service is at capacity — {info['active_analyses']} "
                    f"analyses are running right now. "
                    "Please wait a moment and try again."
                ),
                "active_analyses": info["active_analyses"],
                "max_concurrent": info["max_concurrent"],
                "at_capacity": True,
            },
        )

    # ── 4. Ownership verification ─────────────────────────────────────────────
    resume = (
        supabase.table("resumes")
        .select("*")
        .eq("id", request.resume_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not resume.data:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = (
        supabase.table("job_descriptions")
        .select("*")
        .eq("id", request.job_id)
        .single()
        .execute()
    )
    if not job.data:
        raise HTTPException(status_code=404, detail="Job description not found")

    # ── 5. Persist pending record ─────────────────────────────────────────────
    analysis_id = str(uuid.uuid4())
    record = {
        "id": analysis_id,
        "user_id": user_id,
        "resume_id": request.resume_id,
        "job_id": request.job_id,
        "status": "pending",
        "overall_score": 0,
        "ats_score": 0,
        "technical_fit_score": 0,
        "semantic_match_score": 0,
        "recruiter_impression_score": 0,
        "project_relevance_score": 0,
    }

    result = supabase.table("analyses").insert(record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create analysis")

    # ── 6. Claim a global slot ────────────────────────────────────────────────
    # try_acquire happens AFTER the DB insert so we have the real analysis_id.
    # If a concurrent request sneaked in between the capacity check (step 3)
    # and here, try_acquire returns False → undo the insert and return 503.
    acquired = active_tracker.try_acquire(user_id, analysis_id)
    if not acquired:
        supabase.table("analyses").delete().eq("id", analysis_id).execute()
        info = active_tracker.capacity_info()
        raise HTTPException(
            status_code=503,
            detail={
                "message": (
                    f"Service just reached capacity — {info['active_analyses']} "
                    "analyses running. Please try again in a moment."
                ),
                "active_analyses": info["active_analyses"],
                "max_concurrent": info["max_concurrent"],
                "at_capacity": True,
            },
        )

    # Optimistically bump the per-user daily counter
    increment_user_quota_cache(user_id)

    # ── 7. Fire background task ───────────────────────────────────────────────
    background_tasks.add_task(
        run_analysis,
        analysis_id=analysis_id,
        resume_data=resume.data,
        job_data=job.data,
        user_id=user_id,
    )

    return result.data[0]


# ── Background analysis task ──────────────────────────────────────────────────

async def run_analysis(
    analysis_id: str,
    resume_data: dict,
    job_data: dict,
    user_id: str,
):
    """
    Background task: run full ATS analysis and write results to DB.
    The active_tracker slot is ALWAYS released in the finally block,
    whether the analysis succeeds, fails, or raises unexpectedly.
    """
    supabase = get_supabase()

    try:
        supabase.table("analyses").update({"status": "processing"}).eq("id", analysis_id).execute()

        resume_text = resume_data.get("raw_text", "")
        job_text = job_data.get("raw_text", "")
        parsed_resume = resume_data.get("parsed_data", {})
        parsed_job = job_data.get("parsed_data", {})

        # ── Parse cached embeddings (pgvector returns strings) ────────────────
        def _parse_embedding(val) -> list[float] | None:
            if not val:
                return None
            if isinstance(val, str):
                import json as _json
                try:
                    return _json.loads(val)
                except Exception:
                    return None
            return val

        resume_embedding = _parse_embedding(resume_data.get("embedding")) or embed_text(resume_text[:3000])
        job_embedding = _parse_embedding(job_data.get("embedding")) or embed_text(job_text[:3000])

        # ── AI-first scoring ───────────────────────────────────────────────────
        # Primary: LLM-as-judge (scores all 5 dimensions with reasoning)
        # Fallback: rule-based engine (if LLM unavailable / timeout)
        ai_result = await score_with_ai_timeout(
            resume_text=resume_text,
            job_text=job_text,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            timeout=50.0,
        )

        # Extract structured scores
        scores = {
            "overall_score":               ai_result.get("overall_score", 0),
            "ats_score":                   ai_result.get("ats_score", 0),
            "technical_fit_score":         ai_result.get("technical_fit_score", 0),
            "semantic_match_score":        ai_result.get("semantic_match_score", 0),
            "recruiter_impression_score":  ai_result.get("recruiter_impression_score", 0),
            "project_relevance_score":     ai_result.get("project_relevance_score", 0),
        }
        missing_keywords = ai_result.get("missing_keywords", [])
        ai_reasoning = ai_result.get("reasoning", {})
        ai_strengths = ai_result.get("key_strengths", [])
        ai_weaknesses = ai_result.get("key_weaknesses", [])
        scored_by = ai_result.get("scored_by", "ai")

        # ── LLM feedback (strengths/weaknesses/suggestions/rewrites) ──────────
        # Run in parallel — feedback uses scores from AI scorer as context
        feedback_task = asyncio.create_task(
            generate_recruiter_feedback(
                resume_text=resume_text,
                job_text=job_text,
                parsed_resume=parsed_resume,
                parsed_job=parsed_job,
                scores=scores,
                missing_keywords=missing_keywords,
            )
        )
        rewrites_task = asyncio.create_task(
            generate_bullet_rewrites(
                parsed_resume=parsed_resume,
                parsed_job=parsed_job,
            )
        )

        feedback, rewrites = await asyncio.gather(feedback_task, rewrites_task)

        # Merge AI key_strengths/weaknesses with LLM-generated feedback
        strengths = feedback.get("strengths") or [
            {"title": s, "description": s, "impact": "medium"}
            for s in ai_strengths[:3]
        ]
        weaknesses = feedback.get("weaknesses") or [
            {"title": w, "description": w, "severity": "major", "section": "general"}
            for w in ai_weaknesses[:3]
        ]

        # Persist results
        update_data = {
            "status": "complete",
            **scores,
            "strengths": strengths,
            "weaknesses": weaknesses,
            "missing_keywords": missing_keywords,
            "skill_gaps": feedback.get("skill_gaps", []),
            "improvement_suggestions": feedback.get("improvement_suggestions", []),
            "rewritten_bullets": rewrites,
            "recruiter_summary": feedback.get("recruiter_summary", ""),
            "ai_reasoning": ai_reasoning,
            "scored_by": scored_by,
            "hire_recommendation": ai_result.get("hire_recommendation", ""),
            "seniority_match": ai_result.get("seniority_match", ""),
        }

        supabase.table("analyses").update(update_data).eq("id", analysis_id).execute()

    except Exception as e:
        supabase.table("analyses").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", analysis_id).execute()

    finally:
        # Always free the slot so the next user can proceed
        active_tracker.release(analysis_id)


# ── List / Get / Retry ────────────────────────────────────────────────────────

@router.get("")
async def list_analyses(user_id: str = Depends(get_current_user_id)):
    """List all analyses for the current user with job/resume details joined."""
    supabase = get_supabase()
    result = (
        supabase.table("analyses")
        .select(
            "*, "
            "job_descriptions(id, company_name, job_title, parsed_data, source_url), "
            "resumes(id, file_name)"
        )
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )

    analyses = []
    for a in (result.data or []):
        job = a.pop("job_descriptions", None)
        resume = a.pop("resumes", None)
        analyses.append({
            **a,
            "job": job,
            "resume": resume,
            "scores": {
                "overall_score": a.get("overall_score", 0),
                "ats_score": a.get("ats_score", 0),
                "technical_fit_score": a.get("technical_fit_score", 0),
                "semantic_match_score": a.get("semantic_match_score", 0),
                "recruiter_impression_score": a.get("recruiter_impression_score", 0),
                "project_relevance_score": a.get("project_relevance_score", 0),
            },
        })

    return analyses


@router.get("/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get a specific analysis with full details."""
    supabase = get_supabase()
    # Use limit(1) instead of single() — single() raises an exception when
    # 0 rows are returned (PostgREST 406), which FastAPI surfaces as a 500.
    result = (
        supabase.table("analyses")
        .select(
            "*, "
            "job_descriptions(id, company_name, job_title, parsed_data, source_url), "
            "resumes(id, file_name)"
        )
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    a = result.data[0]
    job = a.pop("job_descriptions", None)
    resume = a.pop("resumes", None)

    return {
        **a,
        "job": job,
        "resume": resume,
        "scores": {
            "overall_score": a.get("overall_score", 0),
            "ats_score": a.get("ats_score", 0),
            "technical_fit_score": a.get("technical_fit_score", 0),
            "semantic_match_score": a.get("semantic_match_score", 0),
            "recruiter_impression_score": a.get("recruiter_impression_score", 0),
            "project_relevance_score": a.get("project_relevance_score", 0),
        },
    }


@router.post("/{analysis_id}/retry")
async def retry_analysis(
    analysis_id: str,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """Re-run a failed analysis (also subject to global capacity check)."""
    supabase = get_supabase()

    analysis = (
        supabase.table("analyses")
        .select("*, resumes(*), job_descriptions(*)")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )

    if not analysis.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    # Capacity check for retries too
    info = active_tracker.capacity_info()
    if info["at_capacity"]:
        raise HTTPException(
            status_code=503,
            detail={
                "message": (
                    f"Service is at capacity ({info['active_analyses']} running). "
                    "Please wait and try again."
                ),
                "active_analyses": info["active_analyses"],
                "max_concurrent": info["max_concurrent"],
                "at_capacity": True,
            },
        )

    a = analysis.data[0]
    supabase.table("analyses").update({"status": "pending"}).eq("id", analysis_id).execute()

    acquired = active_tracker.try_acquire(user_id, analysis_id)
    if not acquired:
        raise HTTPException(
            status_code=503,
            detail={"message": "Service just reached capacity. Try again shortly.", "at_capacity": True},
        )

    background_tasks.add_task(
        run_analysis,
        analysis_id=analysis_id,
        resume_data=a["resumes"],
        job_data=a["job_descriptions"],
        user_id=user_id,
    )

    return {"status": "retrying", "analysis_id": analysis_id}
