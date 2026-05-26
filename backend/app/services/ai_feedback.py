"""
AI Feedback Generator — rate-limit hardened.

Model routing:
  - generate_recruiter_feedback → llama-3.3-70b (needs reasoning depth)
  - generate_bullet_rewrites   → llama-3.1-8b  (fast, structured, no depth needed)

Token budget:
  - feedback prompt  ≤ 1,800 tokens output  (was 3,000)
  - rewrites prompt  ≤ 1,200 tokens output  (was 2,500)
"""
from __future__ import annotations

import json
import structlog

from app.core.config import settings
from app.services.groq_limiter import groq_call

logger = structlog.get_logger()


# ─── Recruiter Feedback (70b) ─────────────────────────────────────────────────

async def generate_recruiter_feedback(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
    scores: dict,
    missing_keywords: list[dict],
) -> dict:
    """
    Recruiter-grade feedback via 70b model.
    Prompt is kept compact; cache TTL = 2 h (identical input → same output).
    """
    resume_ctx = _compact_resume(parsed_resume)
    job_ctx = _compact_job(parsed_job)
    score_line = (
        f"Overall {scores['overall_score']} | ATS {scores['ats_score']} | "
        f"Tech {scores['technical_fit_score']} | Semantic {scores['semantic_match_score']}"
    )
    missing_str = ", ".join(kw["keyword"] for kw in missing_keywords[:8])

    prompt = f"""Senior tech recruiter review. Be specific, honest, actionable.

RESUME:
{resume_ctx}

JOB: {job_ctx}

SCORES: {score_line}
MISSING KEYWORDS: {missing_str}

Return JSON:
{{
  "recruiter_summary": "2-3 sentence honest take on this application",
  "strengths": [{{"title":"","description":"","impact":"high|medium|low"}}],
  "weaknesses": [{{"title":"","description":"","severity":"critical|major|minor","section":""}}],
  "skill_gaps": [{{"skill":"","importance":"critical|important|nice_to_have","how_to_acquire":"","time_to_learn":"","resources":[]}}],
  "improvement_suggestions": [{{"category":"","title":"","description":"","priority":"high|medium|low","action":""}}]
}}
3-5 items each. No fluff."""

    try:
        raw = await groq_call(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.25,
            max_tokens=1800,
            json_mode=True,
            use_cache=True,
            cache_ttl=7200,  # 2 h
        )
        return json.loads(raw)
    except Exception as e:
        logger.error("Recruiter feedback failed", error=str(e))
        return _fallback_feedback(scores)


# ─── Bullet Rewrites (8b — much cheaper) ─────────────────────────────────────

async def generate_bullet_rewrites(
    parsed_resume: dict,
    parsed_job: dict,
) -> list[dict]:
    """
    Rewrite bullet points using the fast 8b model.
    8b is sufficient for this structured text transformation task.
    """
    bullets_ctx = _collect_bullets(parsed_resume, limit=8)
    if not bullets_ctx:
        return []

    job_title = parsed_job.get("title", "Software Engineer")
    req_skills = ", ".join(parsed_job.get("required_skills", [])[:6])

    bullets_str = "\n".join(
        f"{i+1}. [{bc['section']}] {bc['bullet']}"
        for i, bc in enumerate(bullets_ctx)
    )

    prompt = f"""Rewrite these resume bullets for a "{job_title}" role. Skills needed: {req_skills}.

Rules: strong verb, 1 metric, concise, relevant tech.

{bullets_str}

Return JSON:
{{"rewrites":[{{"section":"","original":"","rewritten":"","improvement_reason":"","metrics_added":true}}]}}"""

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.35,
            max_tokens=1200,
            json_mode=True,
            use_cache=True,
            cache_ttl=7200,
        )
        result = json.loads(raw)
        return result.get("rewrites", [])
    except Exception as e:
        logger.error("Bullet rewrite failed", error=str(e))
        return []


# ─── Compact context builders ─────────────────────────────────────────────────

def _compact_resume(p: dict) -> str:
    parts = []
    c = p.get("contact", {})
    if c.get("name"):
        parts.append(f"Name: {c['name']}")
    if p.get("skills"):
        parts.append(f"Skills: {', '.join(p['skills'][:15])}")
    for exp in p.get("experience", [])[:2]:
        parts.append(
            f"{exp.get('title','')} @ {exp.get('company','')} "
            f"({exp.get('start_date','')}–{exp.get('end_date','Present')})"
        )
        for b in exp.get("bullets", [])[:2]:
            parts.append(f"  • {b[:120]}")
    for edu in p.get("education", [])[:1]:
        parts.append(f"Edu: {edu.get('degree','')} – {edu.get('institution','')}")
    return "\n".join(parts)[:2000]


def _compact_job(p: dict) -> str:
    parts = [
        f"{p.get('title','')} @ {p.get('company','')}",
        f"Level: {p.get('experience_level','')}",
        f"Required: {', '.join(p.get('required_skills',[])[:10])}",
        f"Preferred: {', '.join(p.get('preferred_skills',[])[:5])}",
    ]
    return " | ".join(p for p in parts if p.split(': ', 1)[-1])[:1000]


def _collect_bullets(parsed: dict, limit: int = 8) -> list[dict]:
    items = []
    for exp in parsed.get("experience", [])[:3]:
        for b in exp.get("bullets", [])[:3]:
            items.append({
                "section": f"{exp.get('title','')} @ {exp.get('company','')}",
                "bullet": b[:180],
            })
            if len(items) >= limit:
                return items
    return items


def _fallback_feedback(scores: dict) -> dict:
    overall = scores.get("overall_score", 0)
    if overall >= 75:
        summary = "Strong profile. A few targeted improvements could seal the deal."
    elif overall >= 50:
        summary = "Decent fit but needs work. Focus on metrics and closing skill gaps."
    else:
        summary = "Significant gaps detected. Address the missing keywords and skills before applying."
    return {
        "recruiter_summary": summary,
        "strengths": [{"title": "Profile reviewed", "description": "Basic ATS scoring applied", "impact": "low"}],
        "weaknesses": [{"title": "LLM feedback unavailable", "description": "Rule-based only", "severity": "minor", "section": "overall"}],
        "skill_gaps": [],
        "improvement_suggestions": [{
            "category": "Content",
            "title": "Add quantifiable metrics",
            "description": "Add specific numbers to bullet points",
            "priority": "high",
            "action": "Add %, $, or scale numbers to every bullet",
        }],
    }
