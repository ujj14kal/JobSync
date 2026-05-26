"""Resume improvement endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.ai_feedback import generate_bullet_rewrites

router = APIRouter(prefix="/improve", tags=["improve"])


class BulletRewriteRequest(BaseModel):
    resume_id: str
    job_id: str


@router.post("/bullets")
async def rewrite_bullets(
    request: BulletRewriteRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate AI-rewritten bullet points for a resume/job pair."""
    supabase = get_supabase()

    resume = (
        supabase.table("resumes")
        .select("parsed_data")
        .eq("id", request.resume_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not resume.data:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = (
        supabase.table("job_descriptions")
        .select("parsed_data")
        .eq("id", request.job_id)
        .single()
        .execute()
    )
    if not job.data:
        raise HTTPException(status_code=404, detail="Job not found")

    rewrites = await generate_bullet_rewrites(
        parsed_resume=resume.data["parsed_data"],
        parsed_job=job.data["parsed_data"],
    )

    return rewrites
