"""
AI Scorer — Three-tier scoring pipeline for all 5 ATS dimensions.

Priority order:
  1. JobSync Neural Scorer (custom PyTorch model, fully local, no API)
     → Active once trained on synthetic data (600+ pairs, ~100 epochs)
     → Gets smarter with every user feedback signal

  2. Groq LLM-as-Judge (llama-3.3-70b bootstrap)
     → Used ONLY while the neural model is untrained / warming up
     → Also used to generate initial training data for the neural model
     → Will be fully replaced once neural model reaches target accuracy

  3. Rule-based engine (always-available last resort)
     → Pure keyword/regex/embedding rules, no ML
     → Only used if both neural model and Groq are unavailable

How the neural model improves over time:
  - Initial training: 600+ synthetic labeled pairs (generated via Groq once)
  - Continuous improvement: real user outcome feedback → fine-tuning
  - Calibration layer: isotonic regression on outcome data

Calibration:
  Raw scores pass through ScoreCalibrator (if trained) to correct
  systematic bias regardless of which tier produced them.
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
    Score resume vs JD — tries neural model first, Groq second, rules last.

    Returns full score dict compatible with compute_all_scores output,
    plus extra AI fields (reasoning, hire_recommendation, etc.).
    """
    if not resume_text.strip() or not job_text.strip():
        logger.warning("Empty resume or job text — falling back to rules")
        return await _rule_fallback(resume_text, job_text, parsed_resume, parsed_job)

    # ── Tier 1: Custom Neural Model ────────────────────────────────────────────
    result = await _try_neural_scoring(resume_text, job_text, parsed_resume, parsed_job)
    if result:
        logger.info("Neural model scoring succeeded", version=result.get("model_version"))
        return _post_process(result, resume_text, parsed_resume, parsed_job)

    # ── Tier 2: Groq LLM-as-Judge (bootstrap fallback) ─────────────────────────
    logger.info("Neural model unavailable — using Groq LLM scorer")
    result = await _try_groq_scoring(resume_text, job_text, parsed_resume, parsed_job)
    if result:
        return _post_process(result, resume_text, parsed_resume, parsed_job)

    # ── Tier 3: Rule-based engine ───────────────────────────────────────────────
    logger.warning("All AI scorers failed — using rule-based fallback")
    return await _rule_fallback(resume_text, job_text, parsed_resume, parsed_job)


async def _try_neural_scoring(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
) -> dict | None:
    """
    Attempt scoring with the custom JobSync AI (encoder + scorer).
    Uses model_loader's in-memory instances — no disk I/O per request.
    Returns None if models not loaded yet.
    """
    try:
        from app.services.model_loader import get_loaded_models, is_loaded
        import torch
        import torch.nn.functional as F
        import re as _re

        if not is_loaded():
            return None

        encoder, tokenizer, scorer = get_loaded_models()
        if encoder is None or tokenizer is None or scorer is None:
            return None

        def _infer():
            with torch.no_grad():
                # Tokenise
                r_ids = torch.tensor([tokenizer.encode(resume_text[:3000])], dtype=torch.long)
                j_ids = torch.tensor([tokenizer.encode(job_text[:2000])],    dtype=torch.long)
                r_msk = torch.tensor([tokenizer.mask(r_ids[0].tolist())],    dtype=torch.long)
                j_msk = torch.tensor([tokenizer.mask(j_ids[0].tolist())],    dtype=torch.long)

                # Encode
                r_emb = encoder(r_ids, r_msk)   # (1, 256)
                j_emb = encoder(j_ids, j_msk)   # (1, 256)

                # Build interaction features
                diff = (r_emb - j_emb).abs()
                prod = r_emb * j_emb

                # Handcrafted features
                cosine = float((r_emb * j_emb).sum().item())
                SKILLS = {"python","java","javascript","typescript","react","sql","aws",
                          "docker","kubernetes","tensorflow","pytorch","fastapi","django"}
                res_w = set(resume_text.lower().split())
                jd_w  = set(job_text.lower().split())
                res_s = res_w & SKILLS; jd_s = jd_w & SKILLS
                ov  = len(res_s & jd_s)/max(len(jd_s),1) if jd_s else 0.5
                kd  = len({w for w in jd_w if len(w)>4}&res_w)/max(len({w for w in jd_w if len(w)>4}),1)
                rl  = min(len(resume_text)/3000,1.0)
                jl  = min(len(job_text)/2000,1.0)
                he  = float(any(k in resume_text.lower() for k in ["year","years","yr"]))
                edu = float(any(k in resume_text.lower() for k in ["bachelor","master","phd","degree"]))
                ldr = float(any(k in resume_text.lower() for k in ["led","managed","director","head"]))
                met = float(bool(_re.search(r'\b\d+[%x]\b|\$\d+', resume_text)))
                fw  = resume_text.strip().split('\n')[0].lower().split() if resume_text.strip() else []
                fw  = [w for w in fw if len(w)>3]
                ta  = sum(1 for w in fw if w in job_text.lower())/max(len(fw),1)
                hc  = torch.tensor([[cosine,ov,kd,rl,jl,he,edu,ldr,met,ta]], dtype=torch.float32)

                # Full interaction vector
                x = torch.cat([r_emb, j_emb, diff, prod, hc], dim=1)

                # Score
                scores = scorer(x).squeeze(0).tolist()
            return scores

        raw_scores = await asyncio.to_thread(_infer)

        DIMS = ["ats_score","technical_fit_score","semantic_match_score",
                "recruiter_impression_score","project_relevance_score"]
        prediction = {d: round(float(s), 1) for d, s in zip(DIMS, raw_scores)}
        weights = [0.20, 0.25, 0.25, 0.20, 0.10]
        prediction["overall_score"] = round(sum(prediction[d]*w for d,w in zip(DIMS,weights)), 1)
        prediction["scored_by"] = "jobsync-custom-ai"

        result = {
            **prediction,
            "reasoning": _neural_reasoning(prediction, resume_text, job_text, parsed_resume, parsed_job),
            "hire_recommendation": _score_to_recommendation(prediction["overall_score"]),
            "seniority_match": _infer_seniority_match(resume_text, job_text),
            "key_strengths": [],
            "key_weaknesses": [],
        }
        logger.info("Custom AI scoring complete", overall=prediction["overall_score"])
        return result

    except Exception as e:
        logger.error("Custom AI scoring failed", error=str(e))
        return None


async def _try_groq_scoring(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
) -> dict | None:
    """Attempt LLM-as-judge scoring via Groq. Returns None on failure."""
    resume_snippet = resume_text[:3000].strip()
    job_snippet = job_text[:2000].strip()

    prompt = _SCORING_PROMPT.format(
        resume_text=resume_snippet,
        job_text=job_snippet,
    )

    raw: str | None = None
    for model, label in [
        (settings.GROQ_MODEL, "primary"),
        (settings.GROQ_FAST_MODEL, "fallback"),
    ]:
        try:
            raw = await groq_call(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=900,
                json_mode=True,
                use_cache=False,
            )
            logger.info("Groq LLM scoring completed", model=label)
            break
        except Exception as e:
            logger.warning(f"Groq scoring {label} failed", error=str(e))
            await asyncio.sleep(1)

    if not raw:
        return None

    try:
        result = _parse_llm_response(raw)
        result["scored_by"] = "groq-llm"
        return result
    except Exception as e:
        logger.error("Failed to parse Groq response", error=str(e))
        return None


def _post_process(
    result: dict,
    resume_text: str,
    parsed_resume: dict,
    parsed_job: dict,
) -> dict:
    """Shared post-processing: calibration + keyword merging."""
    # Apply calibration
    calibrator = get_calibrator()
    if calibrator:
        result = calibrator.calibrate_scores(result)
        logger.debug("Scores calibrated")

    # Compute weighted overall
    result["overall_score"] = _compute_overall(result)

    # Keyword analysis
    from app.services.skill_normalizer import skills_overlap, display_skill
    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])
    matched, missing = skills_overlap(resume_skills, job_required + job_tech)

    llm_missing = []
    existing = result.get("missing_keywords", [])
    if existing and isinstance(existing[0], dict):
        llm_missing = [m.get("keyword", "") for m in existing]
    elif existing and isinstance(existing[0], str):
        llm_missing = existing

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

    return result


def _neural_reasoning(
    prediction: dict,
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
) -> dict:
    """
    Generate human-readable reasoning from neural model scores.
    No LLM needed — derived from scores + skill analysis.
    """
    from app.services.skill_normalizer import skills_overlap, display_skill

    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])
    matched, missing = skills_overlap(resume_skills, job_required + job_tech)

    ats = prediction["ats_score"]
    tech = prediction["technical_fit_score"]
    sem = prediction["semantic_match_score"]
    rec = prediction["recruiter_impression_score"]
    proj = prediction["project_relevance_score"]

    matched_str = ", ".join(list(matched)[:4]) or "none detected"
    missing_str = ", ".join([display_skill(s) for s in list(missing)[:3]]) or "none"

    return {
        "ats": f"ATS compatibility score {ats:.0f}/100. "
               + ("Resume structure and keyword density look strong." if ats >= 70
                  else "Consider adding more industry keywords and improving formatting."),
        "technical": f"Technical fit {tech:.0f}/100. Matched skills: {matched_str}. "
                     + (f"Missing: {missing_str}." if missing_str != "none" else "Good skill alignment."),
        "semantic": f"Semantic match {sem:.0f}/100. "
                    + ("Experience narrative aligns well with the role requirements." if sem >= 65
                       else "The candidate's experience may not directly map to this role's core responsibilities."),
        "recruiter": f"Recruiter impression {rec:.0f}/100. "
                     + ("Strong action verbs and quantified impact evident." if rec >= 70
                        else "Consider adding more metrics and stronger action verbs to bullets."),
        "projects": f"Project relevance {proj:.0f}/100. "
                    + ("Projects demonstrate hands-on experience with required technologies." if proj >= 65
                       else "Add projects that directly showcase skills required for this role."),
    }


def _score_to_recommendation(overall: float) -> str:
    if overall >= 80:
        return "Strong Yes"
    elif overall >= 70:
        return "Yes"
    elif overall >= 55:
        return "Maybe"
    elif overall >= 40:
        return "No"
    else:
        return "Strong No"


def _infer_seniority_match(resume_text: str, job_text: str) -> str:
    """Quick heuristic seniority match from text signals."""
    import re
    senior_signals = len(re.findall(r'\b(senior|lead|principal|staff|architect|director|vp|10\+|8\+|9\+)\b', resume_text.lower()))
    junior_signals = len(re.findall(r'\b(junior|entry|intern|0-2|recent grad|bootcamp|fresher)\b', resume_text.lower()))
    jd_senior = len(re.findall(r'\b(senior|lead|principal|staff|5\+|7\+|8\+)\b', job_text.lower()))
    jd_junior = len(re.findall(r'\b(junior|entry|0-2|1-3)\b', job_text.lower()))

    if senior_signals > 2 and jd_junior > 0:
        return "Overqualified"
    elif junior_signals > 1 and jd_senior > 1:
        return "Underqualified"
    elif senior_signals > 0 and jd_senior > 0:
        return "Perfect"
    else:
        return "Slight stretch"


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
