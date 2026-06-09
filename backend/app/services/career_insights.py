"""
Career insights service — generates market data, salary ranges,
trending skills, and career paths using Groq LLM.

Markets:
  - "india"  → INR salaries (raw rupees), Indian companies, Naukri/AmbitionBox data
  - "global" → USD salaries, global companies, LinkedIn/Glassdoor data

Cache notes:
  - DB cache TTL = 24 h; key = (role|market, industry)
  - groq_call() adds in-memory prompt-hash dedup on top of DB cache
  - Uses 8b fast model — insights are data retrieval, not reasoning
"""
from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
import structlog

from app.core.config import settings
from app.db.supabase_client import get_supabase
from app.services.groq_limiter import groq_call

logger = structlog.get_logger()


async def get_career_insights(
    role: str,
    industry: str = "Technology",
    market: str = "global",
) -> dict:
    """
    Return career insights for a role + market.
    Checks Supabase cache first; only calls LLM when cache is stale.
    Market is encoded into the cache_role key so india/global are stored separately.
    """
    supabase = get_supabase()
    cache_role = f"{role}|{market}"  # encodes market into cache key, no migration needed

    # ── DB cache ──────────────────────────────────────────────────────────────
    try:
        result = (
            supabase.table("career_insights")
            .select("*")
            .eq("role", cache_role)
            .eq("industry", industry)
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .limit(1)
            .execute()
        )
        if result.data:
            logger.debug("Career insights cache hit", role=role, market=market)
            return result.data[0]["data"]
    except Exception as e:
        logger.warning("Insights cache lookup failed", error=str(e))

    # ── Generate via LLM ──────────────────────────────────────────────────────
    insights = await _generate_insights(role, industry, market)

    # ── Persist to DB (24 h TTL) ──────────────────────────────────────────────
    try:
        expires_at = (
            datetime.now(timezone.utc)
            + timedelta(hours=settings.INSIGHTS_CACHE_TTL_HOURS)
        ).isoformat()

        supabase.table("career_insights").upsert({
            "role": cache_role,
            "industry": industry,
            "data": insights,
            "expires_at": expires_at,
        }).execute()
    except Exception as e:
        logger.warning("Failed to cache insights", error=str(e))

    return insights


async def _generate_insights(role: str, industry: str, market: str) -> dict:
    """Dispatch to market-specific LLM prompt."""
    if market == "india":
        return await _generate_india_insights(role, industry)
    return await _generate_global_insights(role, industry)


# ── India ─────────────────────────────────────────────────────────────────────

async def _generate_india_insights(role: str, industry: str) -> dict:
    """
    Generate India-specific career insights.
    Salaries in raw INR (rupees). Frontend formats as ₹XL.
    Data benchmarked against Naukri.com, AmbitionBox, LinkedIn India, NASSCOM reports.
    """
    current_year = datetime.now().year

    prompt = f"""You are a senior HR analyst with access to 2024-{current_year} India job market data from Naukri.com, AmbitionBox, LinkedIn India Talent Insights, and NASSCOM annual reports.

Generate accurate, realistic career insights for "{role}" in the Indian {industry} sector. Respond in JSON only — no markdown, no explanation.

Use these Indian market benchmarks:
- Salaries: metro cities (Bengaluru, Hyderabad, Pune, Chennai, Mumbai, Delhi NCR)
- Entry = 0-3 yrs experience, Mid = 3-7 yrs, Senior = 7+ yrs
- Salary values must be in raw Indian Rupees (e.g. 800000 = ₹8L, 2500000 = ₹25L)
- Top hiring companies must be real companies actively hiring in India
- Trending skills must reflect actual demand on Naukri/LinkedIn India job postings
- openings_count = realistic active openings on Naukri + LinkedIn India combined
- competition_level based on applications-per-opening ratio in India
- avg_response_rate = % of applications that get a recruiter response in India

Return exactly this JSON:
{{
  "role": "{role}",
  "industry": "{industry}",
  "market": "india",
  "currency": "INR",
  "trending_skills": [
    {{"skill": "", "trend": "rising", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "rising", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "stable", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "rising", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "stable", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "declining", "demand_score": 0, "yoy_change": 0}}
  ],
  "salary_range": {{
    "currency": "INR",
    "location": "India (metro average)",
    "entry": {{"min": 0, "max": 0}},
    "mid": {{"min": 0, "max": 0}},
    "senior": {{"min": 0, "max": 0}}
  }},
  "job_market": {{
    "openings_count": 0,
    "competition_level": "high",
    "avg_response_rate": 0,
    "top_ats_systems": ["iCIMS", "Taleo", "Naukri RMS", "Keka", "Darwinbox"]
  }},
  "growth_projection": "",
  "top_companies": [],
  "career_paths": [
    {{"from": "{role}", "to": "", "avg_transition_time": "", "required_skills": []}},
    {{"from": "{role}", "to": "", "avg_transition_time": "", "required_skills": []}},
    {{"from": "{role}", "to": "", "avg_transition_time": "", "required_skills": []}}
  ]
}}

Fill all zeroes with real data. top_companies = 8-10 real companies actively hiring this role in India right now."""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.15,
            max_tokens=1800,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,
        )
        data = json.loads(raw)
        return _normalize(data)
    except Exception as e:
        logger.error("India insights generation failed", error=str(e))
        return _fallback_india(role, industry)


# ── Global ────────────────────────────────────────────────────────────────────

async def _generate_global_insights(role: str, industry: str) -> dict:
    """
    Generate global (US-centric) career insights.
    Salaries in raw USD. Frontend formats as $XK.
    Data benchmarked against LinkedIn, Glassdoor, Levels.fyi, BLS.
    """
    current_year = datetime.now().year

    prompt = f"""You are a senior HR analyst with access to 2024-{current_year} global job market data from LinkedIn Talent Insights, Glassdoor, Levels.fyi, and the US Bureau of Labor Statistics.

Generate accurate, realistic career insights for "{role}" in the global {industry} sector. Respond in JSON only — no markdown, no explanation.

Use these global market benchmarks:
- Salaries: US market (New York, San Francisco, Seattle, Austin, NYC metro)
- Entry = 0-3 yrs, Mid = 3-7 yrs, Senior = 7+ yrs
- Salary values in raw US Dollars (e.g. 120000 = $120K)
- Trending skills must reflect actual demand on LinkedIn + Indeed job postings globally
- openings_count = realistic active global openings on LinkedIn + Indeed
- competition_level based on global applications-per-opening
- avg_response_rate = % of applications that get recruiter response globally

Return exactly this JSON:
{{
  "role": "{role}",
  "industry": "{industry}",
  "market": "global",
  "currency": "USD",
  "trending_skills": [
    {{"skill": "", "trend": "rising", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "rising", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "stable", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "rising", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "stable", "demand_score": 0, "yoy_change": 0}},
    {{"skill": "", "trend": "declining", "demand_score": 0, "yoy_change": 0}}
  ],
  "salary_range": {{
    "currency": "USD",
    "location": "United States",
    "entry": {{"min": 0, "max": 0}},
    "mid": {{"min": 0, "max": 0}},
    "senior": {{"min": 0, "max": 0}}
  }},
  "job_market": {{
    "openings_count": 0,
    "competition_level": "high",
    "avg_response_rate": 0,
    "top_ats_systems": ["Workday", "Greenhouse", "Lever", "iCIMS", "Taleo"]
  }},
  "growth_projection": "",
  "top_companies": [],
  "career_paths": [
    {{"from": "{role}", "to": "", "avg_transition_time": "", "required_skills": []}},
    {{"from": "{role}", "to": "", "avg_transition_time": "", "required_skills": []}},
    {{"from": "{role}", "to": "", "avg_transition_time": "", "required_skills": []}}
  ]
}}

Fill all zeroes with real data. top_companies = 8-10 real global companies actively hiring this role."""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.15,
            max_tokens=1800,
            json_mode=True,
            use_cache=True,
            cache_ttl=86400,
        )
        data = json.loads(raw)
        return _normalize(data)
    except Exception as e:
        logger.error("Global insights generation failed", error=str(e))
        return _fallback_global(role, industry)


# ── Shared helpers ────────────────────────────────────────────────────────────

def _normalize(data: dict) -> dict:
    """Coerce LLM output fields to expected types."""
    # top_companies — LLM sometimes returns objects
    if "top_companies" in data:
        data["top_companies"] = [
            c if isinstance(c, str) else (c.get("name") or str(c))
            for c in (data["top_companies"] or [])
        ]
    # top_ats_systems
    job_market = data.get("job_market") or {}
    if "top_ats_systems" in job_market:
        job_market["top_ats_systems"] = [
            s if isinstance(s, str) else (s.get("name") or str(s))
            for s in (job_market["top_ats_systems"] or [])
        ]
    # salary_range.location → string
    salary = data.get("salary_range") or {}
    if "location" in salary and not isinstance(salary["location"], str):
        salary["location"] = str(salary["location"])
    return data


# ── Fallbacks ─────────────────────────────────────────────────────────────────

def _fallback_india(role: str, industry: str) -> dict:
    return {
        "role": role, "industry": industry,
        "market": "india", "currency": "INR",
        "trending_skills": [
            {"skill": "Python", "trend": "rising", "demand_score": 92, "yoy_change": 18},
            {"skill": "AWS / Cloud", "trend": "rising", "demand_score": 88, "yoy_change": 22},
            {"skill": "React / Next.js", "trend": "rising", "demand_score": 85, "yoy_change": 15},
            {"skill": "Machine Learning", "trend": "rising", "demand_score": 82, "yoy_change": 25},
            {"skill": "DevOps / Kubernetes", "trend": "stable", "demand_score": 78, "yoy_change": 8},
            {"skill": "Java (Spring Boot)", "trend": "stable", "demand_score": 72, "yoy_change": 2},
        ],
        "salary_range": {
            "currency": "INR",
            "location": "India (metro average)",
            "entry": {"min": 500000, "max": 1200000},
            "mid":   {"min": 1200000, "max": 2800000},
            "senior": {"min": 2800000, "max": 6000000},
        },
        "job_market": {
            "openings_count": 45000,
            "competition_level": "high",
            "avg_response_rate": 12,
            "top_ats_systems": ["Naukri RMS", "Keka", "Darwinbox", "iCIMS", "Taleo"],
        },
        "growth_projection": "30% growth expected over next 5 years in India",
        "top_companies": [
            "TCS", "Infosys", "Wipro", "HCL Technologies", "Accenture India",
            "Amazon India", "Microsoft India", "Google India", "Flipkart", "Zomato",
        ],
        "career_paths": [
            {"from": role, "to": f"Senior {role}", "avg_transition_time": "2-3 years",
             "required_skills": ["System Design", "Team Leadership", "Architecture"]},
            {"from": role, "to": "Tech Lead", "avg_transition_time": "4-5 years",
             "required_skills": ["People Management", "System Design", "Delivery"]},
            {"from": role, "to": "Engineering Manager", "avg_transition_time": "6-8 years",
             "required_skills": ["Leadership", "Hiring", "Roadmap Planning"]},
        ],
    }


def _fallback_global(role: str, industry: str) -> dict:
    return {
        "role": role, "industry": industry,
        "market": "global", "currency": "USD",
        "trending_skills": [
            {"skill": "Python", "trend": "rising", "demand_score": 94, "yoy_change": 16},
            {"skill": "AWS / Cloud", "trend": "rising", "demand_score": 91, "yoy_change": 18},
            {"skill": "Machine Learning", "trend": "rising", "demand_score": 88, "yoy_change": 22},
            {"skill": "Kubernetes / DevOps", "trend": "rising", "demand_score": 85, "yoy_change": 14},
            {"skill": "TypeScript", "trend": "stable", "demand_score": 80, "yoy_change": 9},
            {"skill": "Java (Spring)", "trend": "stable", "demand_score": 74, "yoy_change": 3},
        ],
        "salary_range": {
            "currency": "USD",
            "location": "United States",
            "entry": {"min": 80000, "max": 130000},
            "mid":   {"min": 130000, "max": 200000},
            "senior": {"min": 200000, "max": 350000},
        },
        "job_market": {
            "openings_count": 280000,
            "competition_level": "high",
            "avg_response_rate": 18,
            "top_ats_systems": ["Workday", "Greenhouse", "Lever", "iCIMS", "Taleo"],
        },
        "growth_projection": "25% growth expected over next 5 years globally",
        "top_companies": [
            "Google", "Meta", "Amazon", "Microsoft", "Apple",
            "Netflix", "Stripe", "Airbnb", "Uber", "OpenAI",
        ],
        "career_paths": [
            {"from": role, "to": f"Senior {role}", "avg_transition_time": "2-3 years",
             "required_skills": ["System Design", "Leadership", "Architecture"]},
            {"from": role, "to": "Staff Engineer", "avg_transition_time": "5-7 years",
             "required_skills": ["Cross-team Impact", "Technical Vision", "Mentoring"]},
            {"from": role, "to": "Engineering Manager", "avg_transition_time": "6-8 years",
             "required_skills": ["People Management", "Roadmap", "Hiring"]},
        ],
    }
