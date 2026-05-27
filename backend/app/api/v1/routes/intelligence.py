"""
Intelligence API Routes — JobSync Advanced AI Endpoints
========================================================
New endpoints powered by the intelligence layer.

POST /intelligence/analyze        Full intelligence analysis
POST /intelligence/skill-gaps     Skill gap + learning roadmap
POST /intelligence/fit-predict    Recruiter-fit prediction only
POST /intelligence/hybrid-search  Hybrid job search (vector + keyword)
POST /intelligence/outcome        Record application outcome (feedback loop)
POST /intelligence/keyword-fb     Record keyword adoption feedback
GET  /intelligence/keywords       Top performing keywords for a role
GET  /intelligence/cohort         Cohort benchmark for career stage
"""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
import structlog

from app.core.security import get_current_user
from app.services.intelligence_pipeline import (
    run_intelligence_pipeline,
    serialize_intelligence_result,
)
from app.services.skill_graph import analyze_skill_gaps, serialize_gap_analysis
from app.services.recruiter_fit import predict_recruiter_fit, serialize_fit_result
from app.services.feedback_loop import (
    record_application_event,
    record_keyword_feedback,
    get_cohort_percentile,
    process_outcome,
    ApplicationEvent,
    KeywordFeedback,
)
from app.services.concurrency_manager import (
    AnalysisSlot,
    UserAnalysisLock,
    ServiceOverloadError,
    AnalysisTimeoutError,
    DuplicateAnalysisError,
    current_load,
)
from app.services.local_inference import inference_status
from app.services.model_trainer import training_status
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()
router = APIRouter(prefix="/intelligence", tags=["intelligence"])


# ─── Request / Response models ────────────────────────────────────────────────

class FullAnalysisRequest(BaseModel):
    resume_text: str = Field(..., min_length=100, description="Full resume text")
    job_text: str = Field(..., min_length=50, description="Job description text")
    parsed_resume: dict = Field(default_factory=dict)
    parsed_job: dict = Field(default_factory=dict)
    resume_id: str = ""
    job_id: str = ""
    career_stage: str = "mid"


class SkillGapRequest(BaseModel):
    parsed_resume: dict
    parsed_job: dict
    top_n: int = Field(default=8, ge=1, le=20)


class FitPredictRequest(BaseModel):
    parsed_resume: dict
    parsed_job: dict
    ats_scores: dict
    semantic_match_score: float = 50.0
    experience_role_fit: float = 50.0


class OutcomeRequest(BaseModel):
    analysis_id: str
    resume_id: str
    job_id: str
    event_type: str = Field(..., description="APPLIED|INTERVIEWED|REJECTED|OFFER|ACCEPTED")
    company_name: str = ""
    job_title: str = ""
    scores: dict = Field(default_factory=dict)


class KeywordFeedbackRequest(BaseModel):
    analysis_id: str
    keyword: str
    action: str = Field(..., description="ADDED|IGNORED")
    job_title: str = ""
    job_id: str = ""


class HybridSearchRequest(BaseModel):
    resume_id: str
    keywords: str = ""
    limit: int = Field(default=20, ge=1, le=50)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/analyze")
async def full_intelligence_analysis(
    request: FullAnalysisRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Full intelligence analysis — runs all AI systems in parallel.
    Returns enriched analysis with interview probability, skill gaps, fit prediction.

    Rate limiting: one concurrent analysis per user, global slot cap for the server.
    Queue position is returned in the response header X-Queue-Position.
    """
    user_id = user.get("sub", "anonymous")

    try:
        async with UserAnalysisLock(user_id):
            async with AnalysisSlot(user_id=user_id) as slot:
                if slot.position > 0:
                    logger.info(
                        "User queued for analysis",
                        user=user_id,
                        position=slot.position,
                        waited_ms=round(slot.wait_time * 1000),
                    )

                result = await run_intelligence_pipeline(
                    resume_text=request.resume_text,
                    parsed_resume=request.parsed_resume,
                    job_text=request.job_text,
                    parsed_job=request.parsed_job,
                    user_id=user_id,
                    career_stage=request.career_stage,
                )

        return {
            "success": True,
            "data": serialize_intelligence_result(result),
            "meta": {
                "queued": slot.position > 0,
                "wait_ms": round(slot.wait_time * 1000),
            },
        }

    except DuplicateAnalysisError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except (ServiceOverloadError, AnalysisTimeoutError) as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error("Intelligence analysis failed", error=str(e), user=user_id)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/skill-gaps")
async def get_skill_gaps(
    request: SkillGapRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Detailed skill gap analysis with learning roadmap.
    Identifies missing skills, transferable skills, and ordered learning plan.
    """
    try:
        import asyncio
        gap_analysis = await asyncio.to_thread(
            analyze_skill_gaps,
            request.parsed_resume,
            request.parsed_job,
            request.top_n,
        )
        return {"success": True, "data": serialize_gap_analysis(gap_analysis)}
    except Exception as e:
        logger.error("Skill gap analysis failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fit-predict")
async def predict_fit(
    request: FitPredictRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Recruiter-fit prediction. Returns interview probability and signal breakdown.
    """
    try:
        result = predict_recruiter_fit(
            parsed_resume=request.parsed_resume,
            parsed_job=request.parsed_job,
            ats_scores=request.ats_scores,
            semantic_match_score=request.semantic_match_score,
            experience_role_fit=request.experience_role_fit,
        )
        return {"success": True, "data": serialize_fit_result(result)}
    except Exception as e:
        logger.error("Fit prediction failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hybrid-search")
async def hybrid_job_search(
    request: HybridSearchRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Find matching jobs using hybrid vector + keyword search.
    Returns ranked list of job descriptions.
    """
    supabase = get_supabase()
    user_id = user.get("sub", "")

    try:
        # Fetch resume embedding
        resume_result = (
            supabase.table("resumes")
            .select("embedding, parsed_data")
            .eq("id", request.resume_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not resume_result.data:
            raise HTTPException(status_code=404, detail="Resume not found")

        resume_embedding = resume_result.data[0].get("embedding")
        parsed_resume = resume_result.data[0].get("parsed_data", {})

        # Build keyword query from resume skills if not provided
        keywords = request.keywords
        if not keywords and parsed_resume:
            skills = parsed_resume.get("skills", [])
            keywords = " ".join(skills[:10])

        if not keywords:
            keywords = "software engineer"

        # Run hybrid search via SQL function
        result = supabase.rpc(
            "find_matching_jobs",
            {
                "resume_embedding": resume_embedding,
                "keyword_query": keywords,
                "limit_n": request.limit,
                "vector_weight": 0.65,
                "keyword_weight": 0.35,
            }
        ).execute()

        return {
            "success": True,
            "data": {
                "jobs": result.data or [],
                "count": len(result.data or []),
                "search_type": "hybrid_vector_keyword",
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Hybrid search failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/outcome")
async def record_outcome(
    request: OutcomeRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Record application outcome (interviewed/rejected/etc.).
    This is the CORE feedback signal that trains the intelligence system.

    Users report their outcomes; we learn from them.
    """
    user_id = user.get("sub", "")

    # Validate event type
    valid_events = {"APPLIED", "VIEWED", "PHONE_SCREEN", "INTERVIEWED", "OFFER", "ACCEPTED", "REJECTED", "GHOSTED", "WITHDRAWN"}
    if request.event_type not in valid_events:
        raise HTTPException(
            status_code=400,
            detail=f"event_type must be one of {valid_events}"
        )

    event = ApplicationEvent(
        user_id=user_id,
        resume_id=request.resume_id,
        job_id=request.job_id,
        analysis_id=request.analysis_id,
        event_type=request.event_type,
        company_name=request.company_name,
        job_title=request.job_title,
        ats_score=request.scores.get("ats_score", 0),
        semantic_score=request.scores.get("semantic_match_score", 0),
        technical_score=request.scores.get("technical_fit_score", 0),
        overall_score=request.scores.get("overall_score", 0),
        interview_probability=request.scores.get("interview_probability", 0.0),
    )

    success = await record_application_event(event)

    # Trigger outcome processing for learning loop
    if request.event_type in {"INTERVIEWED", "REJECTED"} and request.analysis_id:
        import asyncio
        asyncio.create_task(
            process_outcome(
                user_id=user_id,
                analysis_id=request.analysis_id,
                outcome=request.event_type,
            )
        )

    return {
        "success": success,
        "message": "Outcome recorded. This helps improve recommendations for everyone."
    }


@router.post("/keyword-feedback")
async def submit_keyword_feedback(
    request: KeywordFeedbackRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Record whether user added or ignored a suggested keyword.
    Used to track suggestion quality and keyword effectiveness.
    """
    user_id = user.get("sub", "")

    if request.action not in {"ADDED", "IGNORED"}:
        raise HTTPException(status_code=400, detail="action must be ADDED or IGNORED")

    feedback = KeywordFeedback(
        user_id=user_id,
        analysis_id=request.analysis_id,
        keyword=request.keyword,
        action=request.action,
        job_title=request.job_title,
        job_id=request.job_id,
    )

    success = await record_keyword_feedback(feedback)
    return {"success": success}


@router.get("/keywords")
async def get_top_keywords(
    role: str = "software_engineer",
    limit: int = 20,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Get the highest-performing keywords for a role.
    Returns keywords with the highest interview conversion rates.
    Only shows statistically significant results (≥10 applications).
    """
    supabase = get_supabase()

    try:
        result = (
            supabase.table("keyword_performance")
            .select("keyword, interview_rate, total_applications, adoption_rate")
            .eq("role_category", role)
            .gte("total_applications", 10)
            .order("interview_rate", desc=True)
            .limit(limit)
            .execute()
        )

        return {
            "success": True,
            "data": {
                "role_category": role,
                "keywords": result.data or [],
                "count": len(result.data or []),
                "note": "Only keywords with ≥10 applications shown for statistical validity",
            }
        }
    except Exception as e:
        logger.error("Keyword fetch failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/train")
async def trigger_training(
    force: bool = False,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Trigger a training cycle for the proprietary recruiter-fit model.
    Safe to call anytime — skips if not enough new data since last run.
    Use force=true to retrain even with minor data changes.

    Training phases:
      - Phase 1 (< 200 outcomes): cold-start rules, no ML
      - Phase 2 (200-2000):       LogisticRegression
      - Phase 3 (2000+):          XGBoost
    """
    import asyncio
    from app.services.model_trainer import run_training_cycle

    try:
        result = await run_training_cycle(force=force)
        return {"success": True, "data": result}
    except Exception as e:
        logger.error("Training cycle failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_intelligence_status(
    user: dict = Depends(get_current_user),
) -> dict:
    """
    System status for the intelligence layer:
      - Concurrency load (active analyses / slots)
      - Inference provider (Ollama / Groq / template-only)
      - Training phase and model metrics
    """
    load = current_load()
    inference = await inference_status()
    training = training_status()

    return {
        "success": True,
        "data": {
            "concurrency": load,
            "inference": inference,
            "training": training,
            "health": _compute_health_score(load, inference),
        }
    }


def _compute_health_score(load: dict, inference: dict) -> str:
    util = load.get("utilization_pct", 0)
    if util > 90:
        return "degraded"
    if util > 70:
        return "high_load"
    provider = inference.get("active_provider", "template_only")
    if provider == "template_only":
        return "template_mode"
    if provider == "ollama":
        return "optimal"
    return "good"


@router.get("/cohort")
async def get_cohort_data(
    role: str = "software_engineer",
    career_stage: str = "mid",
    score: int = 0,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Get cohort benchmark data and user's percentile rank.
    "You're in the top 23% of engineers applying to similar roles."
    """
    supabase = get_supabase()

    try:
        # Fetch benchmark
        result = (
            supabase.table("cohort_benchmarks")
            .select("*")
            .eq("role_category", role)
            .eq("career_stage", career_stage)
            .limit(1)
            .execute()
        )

        benchmark = result.data[0] if result.data else None
        percentile = None

        if benchmark and score > 0:
            from app.services.feedback_loop import _score_to_percentile
            percentile = _score_to_percentile(score, benchmark.get("score_percentiles", {}))

        return {
            "success": True,
            "data": {
                "role_category": role,
                "career_stage": career_stage,
                "benchmark": benchmark,
                "your_percentile": round(percentile * 100, 1) if percentile else None,
                "sample_size": benchmark.get("sample_size", 0) if benchmark else 0,
            }
        }
    except Exception as e:
        logger.error("Cohort fetch failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
