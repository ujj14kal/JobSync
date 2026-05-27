"""
AI Feedback Generator — multi-tier inference with Groq as last resort.

Priority chain (for each request):
  1. Template feedback (rule-based, zero LLM)  — always fast, no rate limits
     → Used when: extreme scores (very high/low), high server load, force_template=True
  2. Ollama (local LLM, unlimited)             — used when Ollama is running
     → Ideal for self-hosted deployments
  3. Groq API (cloud fallback, rate-limited)   — only when scores are borderline
     AND local inference is unavailable AND LLM slot is free

This ensures:
  - 100 simultaneous users: all get instant template feedback
  - Medium load: borderline cases get enriched Ollama/Groq feedback
  - Groq rate limit is practically never hit under normal usage

Model routing (for Groq/Ollama):
  - generate_recruiter_feedback → quality tier (llama3.3-70b / llama3.2:3b)
  - generate_bullet_rewrites   → fast tier    (llama3.1-8b  / llama3.2:1b)
"""
from __future__ import annotations

import json
import structlog

from app.services.template_feedback import generate_template_feedback, should_use_llm
from app.services.local_inference import llm_call
from app.services.concurrency_manager import (
    LLMSlot,
    LLMOverloadError,
    should_use_llm_for_feedback,
)

logger = structlog.get_logger()


# ─── Recruiter Feedback ───────────────────────────────────────────────────────

async def generate_recruiter_feedback(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
    scores: dict,
    missing_keywords: list[dict],
    skill_gap_analysis: dict | None = None,
    force_template: bool = False,
) -> dict:
    """
    Recruiter-grade feedback with automatic tier selection.

    Returns dict with keys:
      recruiter_summary, strengths, weaknesses, skill_gaps,
      improvement_suggestions, _source ("template"|"ollama"|"groq")
    """
    # Tier 1: Template feedback — try first
    use_llm = (
        not force_template
        and should_use_llm(scores)
        and should_use_llm_for_feedback()
    )

    if not use_llm:
        result = generate_template_feedback(
            scores=scores,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            missing_keywords=missing_keywords,
            skill_gap_analysis=skill_gap_analysis,
        )
        logger.debug("Using template feedback", overall=scores.get("overall_score"))
        return result

    # Tier 2/3: LLM feedback (Ollama or Groq)
    resume_ctx = _compact_resume(parsed_resume)
    job_ctx = _compact_job(parsed_job)
    score_line = (
        f"Overall {scores.get('overall_score', 0)} | "
        f"ATS {scores.get('ats_score', 0)} | "
        f"Tech {scores.get('technical_fit_score', 0)} | "
        f"Semantic {scores.get('semantic_match_score', 0)}"
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
        async with LLMSlot():
            raw = await llm_call(
                prompt=prompt,
                temperature=0.25,
                max_tokens=1800,
                json_mode=True,
                tier="quality",
                use_cache=True,
                cache_ttl=7200,
            )
        result = json.loads(raw)
        result.setdefault("_source", "llm")
        return result

    except LLMOverloadError:
        logger.info("LLM slots full — falling back to template feedback")
        return generate_template_feedback(
            scores=scores,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            missing_keywords=missing_keywords,
            skill_gap_analysis=skill_gap_analysis,
        )

    except json.JSONDecodeError as e:
        logger.warning("LLM returned invalid JSON — using template", error=str(e))
        return generate_template_feedback(
            scores=scores,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            missing_keywords=missing_keywords,
            skill_gap_analysis=skill_gap_analysis,
        )

    except Exception as e:
        logger.error("LLM feedback failed completely", error=str(e))
        return generate_template_feedback(
            scores=scores,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            missing_keywords=missing_keywords,
            skill_gap_analysis=skill_gap_analysis,
        )


# ─── Bullet Rewrites ──────────────────────────────────────────────────────────

async def generate_bullet_rewrites(
    parsed_resume: dict,
    parsed_job: dict,
) -> list[dict]:
    """
    Rewrite bullet points using the fast model tier.
    Falls back to template rewrites on any failure.
    """
    bullets_ctx = _collect_bullets(parsed_resume, limit=8)
    if not bullets_ctx:
        return []

    # Template mode: if no LLM available or load is high
    if not should_use_llm_for_feedback():
        return _template_bullet_rewrites(bullets_ctx, parsed_job)

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
        async with LLMSlot(timeout=45.0):
            raw = await llm_call(
                prompt=prompt,
                temperature=0.35,
                max_tokens=1200,
                json_mode=True,
                tier="fast",
                use_cache=True,
                cache_ttl=7200,
            )
        result = json.loads(raw)
        return result.get("rewrites", [])

    except (LLMOverloadError, json.JSONDecodeError, Exception) as e:
        logger.warning("Bullet rewrite LLM failed — using template", error=str(e))
        return _template_bullet_rewrites(bullets_ctx, parsed_job)


# ─── Template bullet rewrites (zero LLM) ─────────────────────────────────────

_STRONG_VERBS = [
    "Architected", "Reduced", "Delivered", "Scaled", "Shipped", "Led",
    "Optimised", "Automated", "Migrated", "Refactored", "Built", "Launched",
    "Improved", "Implemented", "Designed", "Deployed", "Enabled", "Accelerated",
]

_WEAK_VERB_PREFIXES = [
    "worked on", "helped", "involved in", "assisted", "participated",
    "contributed to", "was responsible", "responsible for", "did", "made",
]


def _template_bullet_rewrites(
    bullets_ctx: list[dict],
    parsed_job: dict,
) -> list[dict]:
    """
    Rule-based bullet improvements without any LLM.
    Detects weak verbs, missing metrics, passive voice.
    """
    import re
    rewrites = []

    for bc in bullets_ctx:
        original = bc["bullet"]
        rewritten = original
        reasons = []
        metrics_added = False

        lower = original.lower()

        # 1. Replace weak openers
        for weak in _WEAK_VERB_PREFIXES:
            if lower.startswith(weak):
                # Replace with a strong verb + rest of sentence
                strong = _STRONG_VERBS[len(original) % len(_STRONG_VERBS)]
                rest = original[len(weak):].lstrip()
                rewritten = f"{strong} {rest[0].lower()}{rest[1:]}" if rest else f"{strong} this component"
                reasons.append(f"replaced weak opener '{weak}' with '{strong}'")
                break

        # 2. Suggest metric if none present
        has_metric = bool(re.search(r'\d+%|\$\d+|\d+[xX]\b|\d{3,}', original))
        if not has_metric:
            rewritten = rewritten.rstrip(".") + " (add: achieved X% improvement or reached Y users)"
            reasons.append("added placeholder for quantifiable metric")
            metrics_added = True

        # 3. Cap at 120 chars
        if len(rewritten) > 150:
            rewritten = rewritten[:147] + "..."
            reasons.append("trimmed to 150 chars")

        rewrites.append({
            "section": bc["section"],
            "original": original,
            "rewritten": rewritten,
            "improvement_reason": "; ".join(reasons) if reasons else "minor phrasing improvements applied",
            "metrics_added": metrics_added,
            "_source": "template",
        })

    return rewrites


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
    return " | ".join(part for part in parts if part.split(': ', 1)[-1])[:1000]


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
