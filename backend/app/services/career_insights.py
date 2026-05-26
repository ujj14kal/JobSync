"""
Career insights service — generates market data, salary ranges,
trending skills, and career paths using Groq LLM.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
import structlog
from groq import AsyncGroq

from app.core.config import settings
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()


async def get_career_insights(role: str, industry: str = "Technology") -> dict:
    """
    Get career insights for a role. Checks cache first, generates with LLM if stale.
    """
    supabase = get_supabase()

    # Check cache
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
            return result.data[0]["data"]
    except Exception as e:
        logger.warning("Cache lookup failed", error=str(e))

    # Generate with LLM
    insights = await generate_insights_with_llm(role, industry)

    # Cache for 6 hours
    try:
        expires_at = (
            datetime.now(timezone.utc) + timedelta(hours=settings.INSIGHTS_CACHE_TTL_HOURS)
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
    """Generate career insights using Groq LLM."""
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)

    current_year = datetime.now().year

    prompt = f"""You are a career data analyst with access to current job market data.
Generate accurate, data-driven career insights for "{role}" in the {industry} industry for {current_year}.

Return ONLY valid JSON with this exact structure:
{{
  "role": "{role}",
  "industry": "{industry}",
  "trending_skills": [
    {{
      "skill": "skill name",
      "trend": "rising|stable|declining",
      "demand_score": 0-100,
      "yoy_change": percentage change e.g. 15 or -5
    }}
  ],
  "salary_range": {{
    "currency": "USD",
    "location": "United States",
    "entry": {{ "min": 70000, "max": 100000 }},
    "mid": {{ "min": 110000, "max": 160000 }},
    "senior": {{ "min": 170000, "max": 250000 }}
  }},
  "job_market": {{
    "openings_count": approximate number,
    "competition_level": "low|medium|high",
    "avg_response_rate": percentage,
    "top_ats_systems": ["Workday", "Greenhouse", "Lever", "etc"]
  }},
  "growth_projection": "X% growth over next 5 years",
  "top_companies": ["company1", "company2", ...10 companies],
  "career_paths": [
    {{
      "from": "{role}",
      "to": "next role",
      "avg_transition_time": "e.g. 2-3 years",
      "required_skills": ["skill1", "skill2"]
    }}
  ]
}}

Include 8-10 trending skills, accurate salary data for US market, and 3-4 career paths.
Be data-accurate — use real market figures."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
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
        "top_companies": ["Google", "Meta", "Amazon", "Microsoft", "Apple", "Netflix", "Stripe", "Airbnb", "Uber", "Lyft"],
        "career_paths": [
            {
                "from": role,
                "to": "Senior " + role,
                "avg_transition_time": "2-3 years",
                "required_skills": ["System Design", "Leadership", "Architecture"],
            }
        ],
    }
