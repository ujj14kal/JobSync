"""ATS Analysis endpoints."""
from __future__ import annotations

import uuid
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.ats_engine import compute_all_scores
from app.services.ai_feedback import generate_recruiter_feedback, generate_bullet_rewrites
from app.services.embedding_service import embed_text

router = APIRouter(prefix="/analysis", tags=["analysis"])


class CreateAnalysisRequest(BaseModel):
    resume_id: str
    job_id: str


@router.post("", status_code=201)
async def create_analysis(
    request: CreateAnalysisRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a new ATS analysis.
    Returns immediately with pending status; analysis runs in background.
    """
    supabase = get_supabase()

    # Verify ownership
    resume = supabase.table("resumes").select("*").eq("id", request.resume_id).eq("user_id", user_id).single().execute()
    if not resume.data:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = supabase.table("job_descriptions").select("*").eq("id", request.job_id).single().execute()
    if not job.data:
        raise HTTPException(status_code=404, detail="Job description not found")

    # Create pending analysis record
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

    # Run analysis in background
    background_tasks.add_task(
        run_analysis,
        analysis_id=analysis_id,
        resume_data=resume.data,
        job_data=job.data,
    )

    return result.data[0]


async def run_analysis(analysis_id: str, resume_data: dict, job_data: dict):
    """Background task: run full ATS analysis and update DB."""
    supabase = get_supabase()

    try:
        # Update status to processing
        supabase.table("analyses").update({"status": "processing"}).eq("id", analysis_id).execute()

        resume_text = resume_data.get("raw_text", "")
        job_text = job_data.get("raw_text", "")
        parsed_resume = resume_data.get("parsed_data", {})
        parsed_job = job_data.get("parsed_data", {})

        # Get/compute embeddings
        resume_embedding = resume_data.get("embedding") or embed_text(resume_text[:3000])
        job_embedding = job_data.get("embedding") or embed_text(job_text[:3000])

        # Compute ATS scores
        score_data = compute_all_scores(
            resume_text=resume_text,
            parsed_resume=parsed_resume,
            job_text=job_text,
            parsed_job=parsed_job,
            resume_embedding=resume_embedding,
            job_embedding=job_embedding,
        )

        scores = score_data["scores"]
        missing_keywords = score_data["missing_keywords"]

        # Generate LLM feedback (run in parallel)
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

        # Build skill gaps from feedback
        skill_gaps = feedback.get("skill_gaps", [])

        # Update analysis record
        update_data = {
            "status": "complete",
            **scores,
            "strengths": feedback.get("strengths", []),
            "weaknesses": feedback.get("weaknesses", []),
            "missing_keywords": missing_keywords,
            "skill_gaps": skill_gaps,
            "improvement_suggestions": feedback.get("improvement_suggestions", []),
            "rewritten_bullets": rewrites,
            "recruiter_summary": feedback.get("recruiter_summary", ""),
        }

        supabase.table("analyses").update(update_data).eq("id", analysis_id).execute()

    except Exception as e:
        supabase.table("analyses").update({
            "status": "failed",
            "error_message": str(e)[:500],
        }).eq("id", analysis_id).execute()


@router.get("")
async def list_analyses(user_id: str = Depends(get_current_user_id)):
    """List all analyses for the user, with job/resume details joined."""
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

    # Reshape for frontend
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
    result = (
        supabase.table("analyses")
        .select(
            "*, "
            "job_descriptions(id, company_name, job_title, parsed_data, source_url), "
            "resumes(id, file_name)"
        )
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    a = result.data
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
    """Re-run a failed analysis."""
    supabase = get_supabase()

    analysis = (
        supabase.table("analyses")
        .select("*, resumes(*), job_descriptions(*)")
        .eq("id", analysis_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )

    if not analysis.data:
        raise HTTPException(status_code=404, detail="Analysis not found")

    a = analysis.data
    supabase.table("analyses").update({"status": "pending"}).eq("id", analysis_id).execute()

    background_tasks.add_task(
        run_analysis,
        analysis_id=analysis_id,
        resume_data=a["resumes"],
        job_data=a["job_descriptions"],
    )

    return {"status": "retrying", "analysis_id": analysis_id}
