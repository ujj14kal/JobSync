"""
FEEDBACK LEARNING LOOP — JobSync Intelligence Layer
====================================================
This is the DATA MOAT engine. Every interaction, edit, and application outcome
is a signal that makes JobSync smarter over time.

Data collection philosophy:
  "Every application outcome is a FREE labeled training example."
  Competitors cannot buy this data — it accumulates with usage.

What we collect:
  1. Application events (applied, interviewed, rejected, accepted)
  2. Keyword adoption (which suggestions did users actually add?)
  3. Edit deltas (what changed between score and next upload?)
  4. Score feedback (thumbs up/down on our suggestions)
  5. Cohort benchmarks (how does this user compare to similar profiles?)

What we learn from it:
  1. Which keywords actually lead to interviews (not just which look good)
  2. Which ATS score factors matter most at each company
  3. How accurate our recruiter-fit predictions are
  4. Which of our suggestions users find most actionable

Timeline:
  Week 1:   Collection infrastructure live, all events captured
  Month 1:  First keyword_performance insights populated
  Month 3:  100+ labeled outcomes → first trained recruiter_fit model
  Month 6:  1000+ outcomes → XGBoost, company-specific models
  Year 1:   10K+ outcomes → network effects fully activated
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal
from dataclasses import dataclass, asdict
import structlog

from app.db.supabase_client import get_supabase

logger = structlog.get_logger()

# ─── Event types ──────────────────────────────────────────────────────────────

ApplicationEventType = Literal[
    "APPLIED",        # user submitted application
    "VIEWED",         # application was viewed by recruiter (if trackable)
    "PHONE_SCREEN",   # first round
    "INTERVIEWED",    # full interview loop
    "OFFER",          # received offer
    "ACCEPTED",       # accepted offer
    "REJECTED",       # rejected at any stage
    "GHOSTED",        # no response after 2+ weeks
    "WITHDRAWN",      # user withdrew application
]

FeedbackType = Literal[
    "SUGGESTION_HELPFUL",
    "SUGGESTION_NOT_HELPFUL",
    "SCORE_TOO_HIGH",
    "SCORE_TOO_LOW",
    "KEYWORD_ADDED",       # user added a suggested keyword
    "KEYWORD_IGNORED",     # user ignored a suggested keyword
    "BULLET_REWRITE_USED", # user used our rewrite
    "BULLET_REWRITE_IGNORED",
]


# ─── Data structures ──────────────────────────────────────────────────────────

@dataclass
class ApplicationEvent:
    user_id: str
    resume_id: str
    job_id: str
    analysis_id: str | None
    event_type: ApplicationEventType
    company_name: str = ""
    job_title: str = ""
    # Scores at time of application (for training data)
    ats_score: int = 0
    semantic_score: int = 0
    technical_score: int = 0
    overall_score: int = 0
    interview_probability: float = 0.0
    # Optional metadata
    metadata: dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


@dataclass
class KeywordFeedback:
    user_id: str
    analysis_id: str
    keyword: str
    action: Literal["ADDED", "IGNORED"]
    job_title: str = ""
    job_id: str = ""


@dataclass
class EditDelta:
    user_id: str
    analysis_id: str
    resume_version_before: str    # hash of text before editing
    resume_version_after: str     # hash of text after editing
    keywords_added: list[str]
    keywords_removed: list[str]
    bullets_added: list[str]
    bullets_removed: list[str]
    score_before: dict            # {overall, ats, semantic, technical}
    score_after: dict             # filled when user re-analyzes


# ─── Event ingestion ──────────────────────────────────────────────────────────

async def record_application_event(event: ApplicationEvent) -> bool:
    """
    Store an application lifecycle event.
    These events become the training labels for recruiter_fit model.
    """
    supabase = get_supabase()
    try:
        supabase.table("application_events").insert({
            "user_id": event.user_id,
            "resume_id": event.resume_id,
            "job_id": event.job_id,
            "analysis_id": event.analysis_id,
            "event_type": event.event_type,
            "company_name": event.company_name,
            "job_title": event.job_title,
            "ats_score": event.ats_score,
            "semantic_score": event.semantic_score,
            "technical_score": event.technical_score,
            "overall_score": event.overall_score,
            "interview_probability": event.interview_probability,
            "metadata": json.dumps(event.metadata),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        logger.info(
            "Application event recorded",
            event_type=event.event_type,
            company=event.company_name,
        )
        return True
    except Exception as e:
        logger.error("Failed to record application event", error=str(e))
        return False


async def record_keyword_feedback(feedback: KeywordFeedback) -> bool:
    """Track which keywords users actually adopt vs. ignore."""
    supabase = get_supabase()
    try:
        supabase.table("keyword_feedback").insert({
            "user_id": feedback.user_id,
            "analysis_id": feedback.analysis_id,
            "keyword": feedback.keyword.lower(),
            "action": feedback.action,
            "job_title": feedback.job_title,
            "job_id": feedback.job_id,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return True
    except Exception as e:
        logger.error("Failed to record keyword feedback", error=str(e))
        return False


async def record_edit_delta(delta: EditDelta) -> bool:
    """Track what users change after getting suggestions."""
    supabase = get_supabase()
    try:
        supabase.table("edit_deltas").insert({
            "user_id": delta.user_id,
            "analysis_id": delta.analysis_id,
            "version_before_hash": delta.resume_version_before,
            "version_after_hash": delta.resume_version_after,
            "keywords_added": json.dumps(delta.keywords_added),
            "keywords_removed": json.dumps(delta.keywords_removed),
            "bullets_added": json.dumps(delta.bullets_added[:5]),
            "bullets_removed": json.dumps(delta.bullets_removed[:5]),
            "score_before": json.dumps(delta.score_before),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return True
    except Exception as e:
        logger.error("Failed to record edit delta", error=str(e))
        return False


# ─── Keyword performance tracking ─────────────────────────────────────────────

async def update_keyword_performance(
    keyword: str,
    role_category: str,
    was_interviewed: bool,
) -> None:
    """
    Update keyword performance stats.
    Called when we know the outcome of an application that had this keyword.

    This builds the table that tells us: "adding 'LangChain' to SWE resumes
    improved interview rate from 12% → 28%"
    """
    supabase = get_supabase()
    keyword_lower = keyword.lower()

    try:
        # Upsert: increment views, optionally increment interviews
        existing = (
            supabase.table("keyword_performance")
            .select("*")
            .eq("keyword", keyword_lower)
            .eq("role_category", role_category)
            .limit(1)
            .execute()
        )

        if existing.data:
            row = existing.data[0]
            new_views = row["total_applications"] + 1
            new_interviews = row["total_interviews"] + (1 if was_interviewed else 0)
            new_rate = new_interviews / new_views if new_views > 0 else 0

            supabase.table("keyword_performance").update({
                "total_applications": new_views,
                "total_interviews": new_interviews,
                "interview_rate": round(new_rate, 4),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"]).execute()
        else:
            supabase.table("keyword_performance").insert({
                "keyword": keyword_lower,
                "role_category": role_category,
                "total_applications": 1,
                "total_interviews": 1 if was_interviewed else 0,
                "interview_rate": 1.0 if was_interviewed else 0.0,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).execute()

    except Exception as e:
        logger.error("Failed to update keyword performance", error=str(e))


async def get_keyword_success_rates(
    keywords: list[str],
    role_category: str,
) -> dict[str, float]:
    """
    Fetch historical interview success rates for given keywords.
    Returns {keyword: interview_rate} with defaults for unknown keywords.
    """
    supabase = get_supabase()
    if not keywords:
        return {}

    keywords_lower = [k.lower() for k in keywords]
    try:
        result = (
            supabase.table("keyword_performance")
            .select("keyword, interview_rate, total_applications")
            .eq("role_category", role_category)
            .in_("keyword", keywords_lower)
            .execute()
        )

        rates = {}
        for row in (result.data or []):
            # Only use rates with statistical significance (≥10 applications)
            if row["total_applications"] >= 10:
                rates[row["keyword"]] = row["interview_rate"]

        # Default for unknown keywords
        for kw in keywords_lower:
            if kw not in rates:
                rates[kw] = 0.5  # neutral prior

        return rates
    except Exception as e:
        logger.error("Failed to fetch keyword rates", error=str(e))
        return {k.lower(): 0.5 for k in keywords}


# ─── Cohort benchmarking ───────────────────────────────────────────────────────

async def get_cohort_percentile(
    overall_score: int,
    role: str,
    career_stage: str,
) -> float:
    """
    Returns this candidate's percentile rank vs. similar profiles.
    "You're in the top 15% of Python engineers who applied to similar roles."

    Returns 0.5 (median) when insufficient data.
    """
    supabase = get_supabase()

    try:
        result = (
            supabase.table("cohort_benchmarks")
            .select("*")
            .eq("role_category", _categorize_role(role))
            .eq("career_stage", career_stage)
            .limit(1)
            .execute()
        )

        if result.data:
            benchmark = result.data[0]
            percentiles = benchmark.get("score_percentiles", {})
            # percentiles = {"p10": 35, "p25": 48, "p50": 58, "p75": 70, "p90": 82}
            return _score_to_percentile(overall_score, percentiles)
    except Exception as e:
        logger.warning("Cohort lookup failed", error=str(e))

    return 0.50  # default: median


def _score_to_percentile(score: int, percentiles: dict) -> float:
    """Convert a raw score to percentile using pre-computed distribution."""
    p10 = percentiles.get("p10", 30)
    p25 = percentiles.get("p25", 45)
    p50 = percentiles.get("p50", 58)
    p75 = percentiles.get("p75", 70)
    p90 = percentiles.get("p90", 82)

    if score >= p90:
        return 0.90 + (score - p90) / (100 - p90) * 0.10
    elif score >= p75:
        return 0.75 + (score - p75) / (p90 - p75) * 0.15
    elif score >= p50:
        return 0.50 + (score - p50) / (p75 - p50) * 0.25
    elif score >= p25:
        return 0.25 + (score - p25) / (p50 - p25) * 0.25
    elif score >= p10:
        return 0.10 + (score - p10) / (p25 - p10) * 0.15
    else:
        return max(0.01, score / p10 * 0.10)


async def update_cohort_benchmarks(role_category: str, career_stage: str) -> None:
    """
    Recompute percentile distribution for a cohort.
    Called weekly by a background job.
    """
    supabase = get_supabase()
    try:
        # Pull all analyses for this cohort
        result = (
            supabase.table("analyses")
            .select("overall_score, user_profiles!inner(career_stage, target_role)")
            .eq("user_profiles.career_stage", career_stage)
            .gte("overall_score", 0)
            .execute()
        )

        scores = [r["overall_score"] for r in (result.data or []) if r.get("overall_score")]
        if len(scores) < 20:
            return  # Not enough data for meaningful percentiles

        scores.sort()
        n = len(scores)

        def percentile(p: float) -> int:
            idx = int(p * n)
            return scores[min(idx, n - 1)]

        supabase.table("cohort_benchmarks").upsert({
            "role_category": role_category,
            "career_stage": career_stage,
            "sample_size": n,
            "score_percentiles": {
                "p10": percentile(0.10),
                "p25": percentile(0.25),
                "p50": percentile(0.50),
                "p75": percentile(0.75),
                "p90": percentile(0.90),
                "mean": int(sum(scores) / n),
            },
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        logger.info("Updated cohort benchmarks", role=role_category, n=n)
    except Exception as e:
        logger.error("Failed to update cohort benchmarks", error=str(e))


# ─── Resume diff computation ───────────────────────────────────────────────────

def compute_resume_diff(
    text_before: str,
    text_after: str,
    suggested_keywords: list[str],
) -> EditDelta:
    """
    Compute what changed between two resume versions.
    Identifies adopted/ignored keywords from our suggestions.
    """
    before_lower = text_before.lower()
    after_lower = text_after.lower()

    # Which suggested keywords did they add?
    keywords_added = [
        kw for kw in suggested_keywords
        if kw.lower() not in before_lower and kw.lower() in after_lower
    ]

    # Which did they ignore?
    keywords_removed = [
        kw for kw in suggested_keywords
        if kw.lower() in before_lower and kw.lower() not in after_lower
    ]

    # Simple line diff for bullets
    before_lines = set(
        line.strip() for line in text_before.split("\n")
        if len(line.strip()) > 20
    )
    after_lines = set(
        line.strip() for line in text_after.split("\n")
        if len(line.strip()) > 20
    )

    return EditDelta(
        user_id="",  # filled by caller
        analysis_id="",
        resume_version_before=hashlib.md5(text_before.encode()).hexdigest(),
        resume_version_after=hashlib.md5(text_after.encode()).hexdigest(),
        keywords_added=keywords_added,
        keywords_removed=keywords_removed,
        bullets_added=list(after_lines - before_lines)[:5],
        bullets_removed=list(before_lines - after_lines)[:5],
        score_before={},
        score_after={},
    )


# ─── Outcome-based model update signal ────────────────────────────────────────

async def process_outcome(
    user_id: str,
    analysis_id: str,
    outcome: Literal["INTERVIEWED", "REJECTED"],
) -> None:
    """
    When a user reports an outcome, use it to update keyword performance
    and trigger relevant model updates.

    This is the CORE learning signal — called when user says "I got an interview!"
    or "I got rejected."
    """
    supabase = get_supabase()
    was_interviewed = outcome == "INTERVIEWED"

    try:
        # Fetch the analysis to get context
        result = (
            supabase.table("analyses")
            .select("*, job_descriptions(parsed_data), resumes(parsed_data)")
            .eq("id", analysis_id)
            .limit(1)
            .execute()
        )

        if not result.data:
            return

        analysis = result.data[0]
        job_data = analysis.get("job_descriptions", {}) or {}
        parsed_job = job_data.get("parsed_data", {})
        resume_data = analysis.get("resumes", {}) or {}
        parsed_resume = resume_data.get("parsed_data", {})

        job_title = parsed_job.get("title", "Software Engineer")
        role_category = _categorize_role(job_title)

        # Update keyword performance for all job keywords
        job_keywords = (
            parsed_job.get("required_skills", []) +
            parsed_job.get("keywords", []) +
            parsed_job.get("tech_stack", [])
        )

        # Check which keywords the resume actually had
        resume_text = " ".join([
            " ".join(parsed_resume.get("skills", [])),
            analysis.get("recruiter_summary", ""),
        ]).lower()

        for keyword in job_keywords[:20]:
            if keyword.lower() in resume_text:
                await update_keyword_performance(
                    keyword=keyword,
                    role_category=role_category,
                    was_interviewed=was_interviewed,
                )

        logger.info(
            "Processed application outcome",
            outcome=outcome,
            role=job_title,
            keywords_updated=min(len(job_keywords), 20),
        )

    except Exception as e:
        logger.error("Failed to process outcome", error=str(e))


def _categorize_role(title: str) -> str:
    """Map job title to broad category for benchmarking."""
    title_lower = title.lower()
    if any(k in title_lower for k in ["data scientist", "ml engineer", "ai engineer", "machine learning"]):
        return "ml_engineer"
    if any(k in title_lower for k in ["data engineer", "data platform", "etl"]):
        return "data_engineer"
    if any(k in title_lower for k in ["frontend", "react", "ui engineer", "web developer"]):
        return "frontend_engineer"
    if any(k in title_lower for k in ["backend", "server", "api engineer"]):
        return "backend_engineer"
    if any(k in title_lower for k in ["devops", "platform", "sre", "reliability", "infrastructure"]):
        return "devops_engineer"
    if any(k in title_lower for k in ["full stack", "fullstack", "full-stack"]):
        return "fullstack_engineer"
    if any(k in title_lower for k in ["mobile", "ios", "android", "flutter"]):
        return "mobile_engineer"
    if any(k in title_lower for k in ["product manager", "pm ", "product lead"]):
        return "product_manager"
    if any(k in title_lower for k in ["software", "engineer", "developer", "swe"]):
        return "software_engineer"
    return "general"
