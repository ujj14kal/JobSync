"""
Scoring Feedback — collects user-reported outcomes to train calibration model.

Every time a user records an actual job outcome (got interview, rejected),
we store it alongside the AI scores. This is the training signal for
ScoreCalibrator and future model versions.
"""
from __future__ import annotations

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/feedback", tags=["feedback"])

VALID_OUTCOMES = {
    "got_interview",   # positive signal
    "screening_call",  # weak positive
    "offer",           # strong positive
    "rejected",        # negative signal
    "no_response",     # weak negative
    "withdrew",        # neutral
}


class ScoreFeedback(BaseModel):
    analysis_id: str
    outcome: str  # one of VALID_OUTCOMES
    accuracy_rating: Optional[int] = None  # 1-5: how accurate was the AI score?
    notes: Optional[str] = None


class ScoreAccuracyRating(BaseModel):
    analysis_id: str
    overall_accuracy: int       # 1-5
    ats_accuracy: Optional[int] = None
    technical_accuracy: Optional[int] = None
    recruiter_accuracy: Optional[int] = None
    notes: Optional[str] = None


@router.post("/outcome")
async def submit_outcome(
    body: ScoreFeedback,
    user_id: str = Depends(get_current_user_id),
):
    """
    Record what actually happened with this job application.
    This is the ground truth signal used to calibrate AI scores.
    """
    if body.outcome not in VALID_OUTCOMES:
        raise HTTPException(400, detail=f"Invalid outcome. Valid: {sorted(VALID_OUTCOMES)}")

    supabase = get_supabase()

    # Get analysis to verify ownership + grab the scores
    analysis = (
        supabase.table("analyses")
        .select("id, user_id, ats_score, technical_fit_score, semantic_match_score, recruiter_impression_score, project_relevance_score, overall_score")
        .eq("id", body.analysis_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not analysis.data:
        raise HTTPException(404, detail="Analysis not found")

    a = analysis.data
    dimension_scores = {
        "ats_score":                  a.get("ats_score"),
        "technical_fit_score":        a.get("technical_fit_score"),
        "semantic_match_score":       a.get("semantic_match_score"),
        "recruiter_impression_score": a.get("recruiter_impression_score"),
        "project_relevance_score":    a.get("project_relevance_score"),
        "overall_score":              a.get("overall_score"),
    }

    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "analysis_id": body.analysis_id,
        "outcome": body.outcome,
        "dimension_scores": dimension_scores,
        "accuracy_rating": body.accuracy_rating,
        "notes": body.notes,
    }

    result = supabase.table("scoring_feedback").insert(record).execute()
    if not result.data:
        raise HTTPException(500, detail="Failed to save feedback")

    # Also update the job_application if one exists for this analysis
    supabase.table("job_applications").update({
        "status": _map_outcome_to_status(body.outcome),
    }).eq("analysis_id", body.analysis_id).eq("user_id", user_id).execute()

    return {"message": "Feedback recorded. Thank you for helping improve JobSync AI!", "id": record["id"]}


@router.post("/accuracy")
async def submit_accuracy_rating(
    body: ScoreAccuracyRating,
    user_id: str = Depends(get_current_user_id),
):
    """Record how accurate the user thinks the AI scores were (1-5 stars)."""
    if not 1 <= body.overall_accuracy <= 5:
        raise HTTPException(400, detail="accuracy must be 1-5")

    supabase = get_supabase()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "analysis_id": body.analysis_id,
        "outcome": "accuracy_rating",
        "accuracy_rating": body.overall_accuracy,
        "notes": body.notes,
        "dimension_scores": {
            "ats_accuracy":       body.ats_accuracy,
            "technical_accuracy": body.technical_accuracy,
            "recruiter_accuracy": body.recruiter_accuracy,
        },
    }
    result = supabase.table("scoring_feedback").insert(record).execute()
    if not result.data:
        raise HTTPException(500, detail="Failed to save rating")
    return {"message": "Rating saved", "id": record["id"]}


@router.get("/stats")
async def get_feedback_stats(user_id: str = Depends(get_current_user_id)):
    """Get aggregate feedback stats (admin-style, per-user for now)."""
    supabase = get_supabase()
    result = supabase.table("scoring_feedback").select("outcome, accuracy_rating").execute()
    rows = result.data or []

    outcome_counts: dict[str, int] = {}
    ratings = []
    for r in rows:
        o = r.get("outcome")
        if o:
            outcome_counts[o] = outcome_counts.get(o, 0) + 1
        if r.get("accuracy_rating"):
            ratings.append(r["accuracy_rating"])

    return {
        "total_feedback": len(rows),
        "outcome_distribution": outcome_counts,
        "avg_accuracy_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "calibration_ready": len(rows) >= 80,
    }


def _map_outcome_to_status(outcome: str) -> str:
    mapping = {
        "got_interview": "interviewing",
        "screening_call": "screening",
        "offer": "offer",
        "rejected": "rejected",
        "withdrew": "withdrawn",
        "no_response": "applied",
    }
    return mapping.get(outcome, "applied")
