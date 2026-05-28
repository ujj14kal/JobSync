"""Job description search and scraping endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.job_scraper import search_and_scrape_job
from app.services.embedding_service import embed_text
from app.core.config import settings

router = APIRouter(prefix="/jobs", tags=["jobs"])


class JobSearchRequest(BaseModel):
    company_name: str = ""
    job_title: Optional[str] = None
    job_id: Optional[str] = None
    job_url: Optional[str] = None  # direct link to the job listing page


@router.post("/search")
async def search_job(
    request: JobSearchRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Search for a job description by company + title/ID, or by direct URL.
    Returns cached result if available (< 24h old).
    """
    # When a direct URL is supplied we don't need company/title
    has_direct = bool(request.job_url)

    if not has_direct and not request.company_name:
        raise HTTPException(status_code=400, detail="company_name is required")

    if not has_direct and not request.job_title and not request.job_id:
        raise HTTPException(
            status_code=400,
            detail="Provide a job title, job ID, or a direct job URL",
        )

    supabase = get_supabase()

    # Check cache (24h TTL)
    cache_cutoff = (
        datetime.now(timezone.utc) - timedelta(hours=settings.JOB_CACHE_TTL_HOURS)
    ).isoformat()

    if request.job_url:
        # Cache by source URL for direct-URL searches
        cached = (
            supabase.table("job_descriptions")
            .select("*")
            .eq("source_url", request.job_url)
            .gt("scraped_at", cache_cutoff)
            .limit(1)
            .execute()
        )
        if cached.data:
            return cached.data[0]
    elif request.job_title:
        cached = (
            supabase.table("job_descriptions")
            .select("*")
            .ilike("company_name", f"%{request.company_name}%")
            .ilike("job_title", f"%{request.job_title}%")
            .gt("scraped_at", cache_cutoff)
            .limit(1)
            .execute()
        )
        if cached.data:
            return cached.data[0]

    # Scrape
    result = await search_and_scrape_job(
        company_name=request.company_name,
        job_title=request.job_title,
        job_id=request.job_id,
        direct_url=request.job_url,
    )

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"Could not find job listing for {request.company_name}. Try providing the job ID.",
        )

    parsed = result["parsed_data"]
    raw_text = result["raw_text"]

    # Generate embedding
    embed_text_input = f"{parsed.get('title', '')} {' '.join(parsed.get('required_skills', []))[:500]}"
    embedding = embed_text(embed_text_input)

    # Save to DB
    record = {
        "id": str(uuid.uuid4()),
        "company_name": request.company_name,
        "job_title": parsed.get("title", request.job_title or ""),
        "job_id_external": request.job_id,
        "source_url": result.get("source_url"),
        "raw_text": raw_text[:50000],
        "parsed_data": parsed,
        "embedding": embedding,
    }

    db_result = supabase.table("job_descriptions").insert(record).execute()

    if not db_result.data:
        raise HTTPException(status_code=500, detail="Failed to save job description")

    return db_result.data[0]
