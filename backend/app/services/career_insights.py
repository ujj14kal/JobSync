"""
Career insights service — generates market data, salary ranges,
trending skills, and career paths using Groq LLM.

Rate-limit notes:
  - Uses 8b fast model (insights are data retrieval, not reasoning)
  - max_tokens trimmed to 1 500 (was 2 500)
  - DB cache TTL = 24 h (was 6 h); identical role+industry never re-queries
  - groq_call() adds in-memory prompt-hash dedup on top of DB cache
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
import structlog

from app.core.config import settings
from app.db.supabase_client import get_supabase
from app.services.groq_limiter import groq_call

logger = structlog.get_logger()


async def get_career_insights(role: str, industry: str = "Technology") -> dict:
    """
    Return career insights for a role.
    Checks Supabase cache first; only calls LLM when cache is stale.
    """
    supabase = get_supabase()

    # ── DB cache ──────────────────────────────────────────────────────────────
    try:
        result = (
            supabase.table("career_insights")
            .select("*")
            .eq("role", role)
            .eq("industry", industry)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        if result.data:
            logger.debug("Career insights cache hit", role=role)
            return result.data[0]["data"]
    except Exception as e:
        logger.warning("Insights cache lookup failed", error=str(e))

    # ── Generate via LLM ──────────────────────────────────────────────────────
    insights = await generate_insights_with_llm(role, industry)

    # ── Persist to DB (24 h TTL) ──────────────────────────────────────────────
    try:
        expires_at = (
            datetime.now(timezone.utc)
            + timedelta(hours=settings.INSIGHTS_CACHE_TTL_HOURS)
        ).isoformat()

        supabase.table("career_insights").upsert({
            "role": role,
            "industry": industry,
            "data": insights,
            "expires_at": expires_at,
        }).execute()
    except Exception as e:
        logger.warning("Failed to cache insights", error=str(e))

    return insights


async def generate_insights_with_llm(role: str, industry: str) -> dict:
    """
    Generate career insights using the 8b fast model.
    Prompt is compact; groq_call() adds an extra in-memory prompt cache on top.
    """
    current_year = datetime.now().year

    prompt = f"""Career data for "{role}" in {industry}, {current_year}. JSON only:
{{
  "role":"{role}","industry":"{industry}",
  "trending_skills":[{{"skill":"","trend":"rising|stable|declining","demand_score":0,"yoy_change":0}}],
  "salary_range":{{"currency":"USD","location":"US","entry":{{"min":0,"max":0}},"mid":{{"min":0,"max":0}},"senior":{{"min":0,"max":0}}}},
  "job_market":{{"openings_count":0,"competition_level":"medium","avg_response_rate":0,"top_ats_systems":[]}},
  "growth_projection":"",
  "top_companies":[],
  "career_paths":[{{"from":"{role}","to":"","avg_transition_time":"","required_skills":[]}}]
}}
6 trending skills, real US salary data, 3 career paths."""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1500,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,  # 24 h in-memory cache on top of DB cache
        )
        return json.loads(raw)
    except Exception as e:
        logger.error("Insights generation failed", error=str(e))
        return _fallback_insights(role, industry)


def _fallback_insights(role: str, industry: str) -> dict:
    return {
        "role": role,
        "industry": industry,
        "trending_skills": [
            {"skill": "Python", "trend": "rising", "demand_score": 90, "yoy_change": 15},
            {"skill": "Machine Learning", "trend": "rising", "demand_score": 85, "yoy_change": 20},
            {"skill": "Cloud Computing", "trend": "rising", "demand_score": 88, "yoy_change": 12},
        ],
        "salary_range": {
            "currency": "USD",
            "location": "United States",
            "entry": {"min": 70000, "max": 100000},
            "mid": {"min": 110000, "max": 160000},
            "senior": {"min": 165000, "max": 250000},
        },
        "job_market": {
            "openings_count": 50000,
            "competition_level": "high",
            "avg_response_rate": 15,
            "top_ats_systems": ["Workday", "Greenhouse", "Lever"],
        },
        "growth_projection": "25% growth over next 5 years",
        "top_companies": [
            "Google", "Meta", "Amazon", "Microsoft", "Apple",
            "Netflix", "Stripe", "Airbnb", "Uber", "Lyft",
        ],
        "career_paths": [
            {
                "from": role,
                "to": "Senior " + role,
                "avg_transition_time": "2-3 years",
                "required_skills": ["System Design", "Leadership", "Architecture"],
            }
        ],
    }
