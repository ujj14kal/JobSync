"""
Public endpoints — no auth required.

/public/stats  → anonymized platform counts for landing page
/public/demo   → IP-rate-limited free trial (score only, no LLM feedback stored)
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])

# ── In-memory IP rate limit (1 demo per IP per 24 h) ─────────────────────────
_demo_seen: dict[str, float] = {}
_DEMO_TTL = 86400.0  # 24 hours


def _ip_key(request: Request) -> str:
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _check_demo_limit(request: Request) -> None:
    key = _ip_key(request)
    now = time.time()
    # Evict stale entries
    expired = [k for k, t in _demo_seen.items() if now - t > _DEMO_TTL]
    for k in expired:
        del _demo_seen[k]
    if key in _demo_seen:
        raise HTTPException(
            status_code=429,
            detail="You've already used your free demo today. Sign up for full access — it's free.",
        )
    _demo_seen[key] = now


# ── Public stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
async def public_stats():
    """Returns anonymized platform stats for the landing page."""
    from app.db.supabase_client import get_supabase
    supabase = get_supabase()
    try:
        analyses = supabase.table("analyses").select("id", count="exact").eq("status", "complete").execute()
        users    = supabase.table("user_profiles").select("id", count="exact").execute()
        return {
            "analyses_run": analyses.count or 0,
            "users": users.count or 0,
        }
    except Exception as e:
        logger.warning("public stats failed: %s", e)
        return {"analyses_run": 0, "users": 0}


# ── Demo analysis ─────────────────────────────────────────────────────────────

@router.post("/demo")
async def demo_analysis(
    request: Request,
    job_url: Annotated[str, Form()],
    resume: Annotated[UploadFile, File()],
):
    """
    Free-trial analysis — no account required.
    Returns: overall score, match tier, top 5 missing keywords.
    Full report requires signup.
    Rate-limited to 1 per IP per 24 hours.
    """
    _check_demo_limit(request)

    # --- Parse uploaded resume in memory, no DB storage ---
    from app.services.resume_parser import parse_resume_from_bytes
    resume_bytes = await resume.read()
    if len(resume_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resume file too large (max 5 MB)")

    try:
        parsed = await asyncio.to_thread(parse_resume_from_bytes, resume_bytes, resume.filename or "resume.pdf")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse resume: {e}")

    resume_text = parsed.get("raw_text", "")
    if len(resume_text.strip()) < 100:
        raise HTTPException(status_code=422, detail="Resume appears empty or unreadable.")

    # --- Scrape job ---
    from app.services.job_scraper import scrape_job_description
    from app.services.resume_parser import detect_document_type

    if detect_document_type(resume_text) == "cover_letter":
        raise HTTPException(status_code=422, detail="This looks like a cover letter. Please upload your resume.")

    try:
        job_data = await asyncio.wait_for(scrape_job_description(job_url), timeout=25.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail="Job page took too long to load. Try a different URL.")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not fetch job: {e}")

    job_text = job_data.get("raw_text", "")
    parsed_job = job_data.get("parsed_data", {})

    # --- AI scoring (neural model, no LLM) ---
    from app.services.ai_scorer import score_with_ai_timeout

    ai_result = await score_with_ai_timeout(
        resume_text=resume_text,
        job_text=job_text,
        parsed_resume=parsed.get("parsed_data", {}),
        parsed_job=parsed_job,
        timeout=30.0,
        user_id="demo",
    )

    score = int(round(ai_result.get("overall_score", 0)))
    tier = (
        "Strong Match"  if score >= 75 else
        "Good Match"    if score >= 55 else
        "Fair Match"    if score >= 35 else
        "Weak Match"    if score >= 20 else
        "Poor Match"
    )

    missing = ai_result.get("missing_keywords", [])[:5]

    return {
        "overall_score": score,
        "match_tier": tier,
        "scores": {
            "ats_score":                  int(round(ai_result.get("ats_score", 0))),
            "technical_fit_score":        int(round(ai_result.get("technical_fit_score", 0))),
            "semantic_match_score":       int(round(ai_result.get("semantic_match_score", 0))),
            "recruiter_impression_score": int(round(ai_result.get("recruiter_impression_score", 0))),
        },
        "missing_keywords": missing,
        "job_title":  parsed_job.get("title", ""),
        "company":    job_data.get("company_name", ""),
    }
