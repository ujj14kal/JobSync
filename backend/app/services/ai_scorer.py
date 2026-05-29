"""
AI Scorer — LLM-as-Judge for all 5 ATS dimensions.

Architecture:
  Primary  → Groq llama-3.3-70b  (most accurate, used for real analyses)
  Fallback → Groq llama-3.1-8b   (if primary hits rate limit)
  Last resort → rule-based engine (if all LLM calls fail)

Why this beats rules:
  - Understands context: "Led ML platform serving 10M users" >> "wrote python scripts"
  - Judges writing quality like a real recruiter, not a keyword counter
  - Knows domain-specific expectations per role (SWE vs PM vs DS vs Design)
  - Calibrated rubric prevents grade inflation / deflation
  - Reasons explicitly — every score comes with an explanation

Calibration:
  Raw LLM scores are passed through the ScoreCalibrator (if trained) to
  correct for systematic bias (LLMs tend to cluster scores at 60-70).
"""
from __future__ import annotations

import json
import re
import time
import asyncio
from typing import Any
import structlog

from app.core.config import settings
from app.services.groq_limiter import groq_call
from app.services.score_calibrator import get_calibrator

logger = structlog.get_logger()

# ─── Rubric Prompt ────────────────────────────────────────────────────────────
# Designed with calibration guidelines to prevent score clustering.

_SCORING_PROMPT = """You are a senior technical recruiter and ATS expert with 20+ years screening candidates at top-tier tech companies (FAANG, unicorns, leading startups).

Evaluate the RESUME against the JOB DESCRIPTION on 5 dimensions. Be a tough grader — realistic, not generous.

CALIBRATION SCALE (use this, don't deviate):
  90-100 → Top 3% match. Hire immediately. Near-perfect alignment.
  75-89  → Strong candidate. Clear fit. Worth interviewing.
  55-74  → Decent match. Has gaps but could work with coaching.
  35-54  → Weak match. Significant gaps in core requirements.
  0-34   → Poor match. Wrong role, wrong level, or wrong domain.

IMPORTANT: The average real-world applicant scores 48-62. Score accordingly.

DIMENSION RUBRICS:

1. ATS_COMPATIBILITY (0-100)
   • Has all critical sections: Experience, Education, Skills, Contact? (+50 max)
   • Contact info: email, phone, LinkedIn present? (+20 max)
   • Quantified bullets with numbers/metrics? (+15 max)
   • Clean, ATS-parseable format (no tables, columns, graphics)? (+15 max)

2. TECHNICAL_FIT (0-100)
   • Required skills explicitly present? (not just adjacent — exact match) (+60 max)
   • Tech stack overlap with job requirements? (+25 max)
   • Years of experience with key technologies appropriate for seniority? (+15 max)
   Penalty: -10 for each critical required skill completely missing

3. SEMANTIC_MATCH (0-100)
   • Does candidate's day-to-day work actually overlap with this role's responsibilities?
   • Industry/domain context alignment?
   • Does narrative suggest they've DONE this work, not just studied it?
   Score low (< 40) if experience is tangentially related but not directly applicable.

4. RECRUITER_IMPRESSION (0-100)
   • Strong action verbs (built/shipped/scaled/reduced vs worked on/helped/assisted)? (+30 max)
   • Quantified impact: $, %, users, time saved, teams led? (+35 max)
   • Resume length appropriate (1-2 pages worth of content)? (+15 max)
   • Summary/objective present and specific? (+10 max)
   • No red flags (gaps, job hopping every 3 months, vague bullets)? (+10 max)
   Penalty: -5 for each weak phrase ("responsible for", "helped with", "exposure to")

5. PROJECT_RELEVANCE (0-100)
   • Do projects directly demonstrate the required skills hands-on?
   • Are projects recent and production-quality (shipped, real users)?
   • Do they cover the job's core technical domain?
   Score 40 (neutral) if no projects section — only penalize if projects exist but are irrelevant.

RESUME (first 3000 chars):
{resume_text}

JOB DESCRIPTION (first 2000 chars):
{job_text}

Respond with valid JSON only — no text before or after:
{{
  "ats_score": <int 0-100>,
  "technical_fit_score": <int 0-100>,
  "semantic_match_score": <int 0-100>,
  "recruiter_impression_score": <int 0-100>,
  "project_relevance_score": <int 0-100>,
  "reasoning": {{
    "ats": "<1-2 sentences. Be specific — what sections are missing or well done?>",
    "technical": "<1-2 sentences. Name specific skills matched and missing.>",
    "semantic": "<1-2 sentences. Does their experience narrative actually fit the role?>",
    "recruiter": "<1-2 sentences. Specific examples of strong/weak bullets.>",
    "projects": "<1-2 sentences. Name relevant or irrelevant projects.>"
  }},
  "missing_keywords": ["<required skill not in resume>", ...],
  "key_strengths": ["<specific strength with evidence>", "<strength>", "<strength>"],
  "key_weaknesses": ["<specific weakness with evidence>", "<weakness>", "<weakness>"],
  "hire_recommendation": "<Strong Yes | Yes | Maybe | No | Strong No>",
  "seniority_match": "<Overqualified | Perfect | Slight stretch | Underqualified>",
  "role_domain_match": <float 0.0-1.0>
}}"""


# ─── Main scorer ──────────────────────────────────────────────────────────────

async def score_with_ai(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
) -> dict[str, Any]:
    """
    Score resume vs JD using LLM-as-judge.

    Returns full score dict compatible with compute_all_scores output,
    plus extra AI fields (reasoning, hire_recommendation, etc.).
    """
    resume_snippet = resume_text[:3000].strip()
    job_snippet = job_text[:2000].strip()

    if not resume_snippet or not job_snippet:
        logger.warning("Empty resume or job text — falling back to rules")
        return await _rule_fallback(resume_text, job_text, parsed_resume, parsed_job)

    prompt = _SCORING_PROMPT.format(
        resume_text=resume_snippet,
        job_text=job_snippet,
    )

    # Try primary model first, then fast model
    raw: str | None = None
    for model, label in [
        (settings.GROQ_MODEL, "primary"),
        (settings.GROQ_FAST_MODEL, "fallback"),
    ]:
        try:
            raw = await groq_call(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,          # low temp → consistent, calibrated scores
                max_tokens=900,
                json_mode=True,
                use_cache=False,          # never cache scoring — each resume is unique
            )
            logger.info("AI scoring completed", model=label)
            break
        except Exception as e:
            logger.warning(f"AI scoring {label} failed", error=str(e))
            await asyncio.sleep(1)

    if not raw:
        logger.error("All LLM scorers failed — using rule fallback")
        return await _rule_fallback(resume_text, job_text, parsed_resume, parsed_job)

    # Parse response
    try:
        result = _parse_llm_response(raw)
    except Exception as e:
        logger.error("Failed to parse LLM scoring response", error=str(e), raw=raw[:200])
        return await _rule_fallback(resume_text, job_text, parsed_resume, parsed_job)

    # Apply calibration if trained model available
    calibrator = get_calibrator()
    if calibrator:
        result = calibrator.calibrate_scores(result)
        logger.debug("Scores calibrated by trained model")

    # Compute overall from AI scores
    result["overall_score"] = _compute_overall(result)

    # Merge keyword analysis from rules (faster than asking LLM)
    from app.services.skill_normalizer import skills_overlap, display_skill, normalize_skills
    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])
    matched, missing = skills_overlap(resume_skills, job_required + job_tech)

    # Merge LLM missing keywords with rule-based ones
    llm_missing = result.get("missing_keywords", [])
    rule_missing = [display_skill(s) for s in missing]
    all_missing = _merge_keywords(llm_missing, rule_missing)

    result["missing_keywords"] = [
        {
            "keyword": kw,
            "importance": "required" if kw.lower() in {s.lower() for s in job_required} else "nice_to_have",
            "context": "Identified by AI analysis",
            "category": "technical_skill",
        }
        for kw in all_missing[:20]
    ]

    result["skill_overlap"] = {
        "matched": [display_skill(s) for s in matched],
        "missing": rule_missing[:15],
    }

    result["scored_by"] = "ai"
    return result


def _parse_llm_response(raw: str) -> dict:
    """Parse LLM JSON response, handling common formatting issues."""
    # Strip markdown code blocks if present
    cleaned = re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()

    # Try direct parse
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try extracting JSON object from the response
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in LLM response")
        data = json.loads(match.group(0))

    # Validate and clamp all scores to 0-100
    score_fields = [
        "ats_score", "technical_fit_score", "semantic_match_score",
        "recruiter_impression_score", "project_relevance_score",
    ]
    for field in score_fields:
        if field not in data:
            data[field] = 50  # neutral default
        else:
            data[field] = max(0, min(100, int(data[field])))

    # Ensure reasoning fields exist
    reasoning = data.get("reasoning", {})
    for dim in ["ats", "technical", "semantic", "recruiter", "projects"]:
        if dim not in reasoning:
            reasoning[dim] = ""
    data["reasoning"] = reasoning

    # Ensure list fields
    for field in ["missing_keywords", "key_strengths", "key_weaknesses"]:
        if field not in data or not isinstance(data[field], list):
            data[field] = []

    return data


def _compute_overall(scores: dict) -> int:
    """Weighted overall from AI scores (same weights as rules but AI-sourced)."""
    weights = {
        "ats_score": 0.20,
        "technical_fit_score": 0.25,
        "semantic_match_score": 0.25,
        "recruiter_impression_score": 0.20,
        "project_relevance_score": 0.10,
    }
    overall = sum(scores.get(k, 50) * w for k, w in weights.items())
    return min(int(overall), 100)


def _merge_keywords(llm_list: list, rule_list: list) -> list[str]:
    """Merge and deduplicate keyword lists from AI and rules."""
    seen = set()
    merged = []
    for kw in llm_list + rule_list:
        norm = kw.lower().strip()
        if norm and norm not in seen and len(norm) > 2:
            seen.add(norm)
            merged.append(kw)
    return merged[:20]


async def _rule_fallback(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
) -> dict:
    """Call rule-based engine as last resort fallback."""
    from app.services.ats_engine import compute_all_scores
    from app.services.embedding_service import embed_text

    resume_emb = embed_text(resume_text[:3000])
    job_emb = embed_text(job_text[:3000])

    result = compute_all_scores(
        resume_text=resume_text,
        parsed_resume=parsed_resume,
        job_text=job_text,
        parsed_job=parsed_job,
        resume_embedding=resume_emb,
        job_embedding=job_emb,
    )
    # Flatten scores dict into top-level
    flat = {**result["scores"], **result}
    flat["scored_by"] = "rules_fallback"
    flat["reasoning"] = {
        "ats": "Scored by rule-based engine (AI unavailable)",
        "technical": "Scored by rule-based engine (AI unavailable)",
        "semantic": "Scored by rule-based engine (AI unavailable)",
        "recruiter": "Scored by rule-based engine (AI unavailable)",
        "projects": "Scored by rule-based engine (AI unavailable)",
    }
    return flat


# ─── Batch / async helpers ────────────────────────────────────────────────────

async def score_with_ai_timeout(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
    timeout: float = 45.0,
) -> dict[str, Any]:
    """Score with a hard timeout — returns rule fallback if LLM is too slow."""
    try:
        return await asyncio.wait_for(
            score_with_ai(resume_text, job_text, parsed_resume, parsed_job),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning("AI scoring timed out, using rule fallback")
        return await _rule_fallback(resume_text, job_text, parsed_resume, parsed_job)
