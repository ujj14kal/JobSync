"""
AI Feedback Generator — tiered by plan.

Free users  → Groq LLaMA 3.3-70b (quality) + 3.1-8b (fast)
Pro users   → Claude Sonnet (deeper, more specific feedback)

Model routing:
  - generate_recruiter_feedback        → Groq quality tier  (free)
  - generate_recruiter_feedback_claude → Claude Sonnet      (pro)
  - generate_bullet_rewrites           → Groq fast tier     (free)
  - generate_bullet_rewrites_claude    → Claude Sonnet      (pro)
"""
from __future__ import annotations

import json
import structlog

from app.services.local_inference import llm_call
from app.services.concurrency_manager import LLMSlot, LLMOverloadError

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
    Recruiter-grade feedback — always LLM, always full text, never templated.
    """
    score_line = (
        f"Overall {scores.get('overall_score', 0)}/100 | "
        f"ATS {scores.get('ats_score', 0)}/100 | "
        f"Technical Fit {scores.get('technical_fit_score', 0)}/100 | "
        f"Semantic Match {scores.get('semantic_match_score', 0)}/100"
    )
    missing_str = ", ".join(kw["keyword"] for kw in missing_keywords[:12])

    prompt = f"""You are a senior technical recruiter. Analyze this specific resume against this specific job description.

Give brutally honest, highly specific feedback — reference actual content from the resume by name (specific projects, companies, technologies, bullet points). Do not give generic advice.

=== RESUME ===
{resume_text[:3000]}

=== JOB DESCRIPTION ===
{job_text[:2000]}

=== ATS SCORES ===
{score_line}
Missing keywords: {missing_str}

Return JSON with this exact structure:
{{
  "recruiter_summary": "3-4 sentences: honest assessment of this specific application — what makes this candidate stand out or fall short for THIS role",
  "strengths": [{{"title":"","description":"reference specific resume content","impact":"high|medium|low"}}],
  "weaknesses": [{{"title":"","description":"reference specific gaps vs the JD","severity":"critical|major|minor","section":""}}],
  "skill_gaps": [{{"skill":"","importance":"critical|important|nice_to_have","how_to_acquire":"specific actionable path","time_to_learn":"","resources":[]}}],
  "improvement_suggestions": [{{"category":"","title":"","description":"what specifically to change and why","priority":"high|medium|low","action":"exact next step"}}]
}}
3-5 items per section. Every point must reference specific content from this resume and this job. No generic advice."""

    try:
        async with LLMSlot():
            raw = await llm_call(
                prompt=prompt,
                temperature=0.7,
                max_tokens=2000,
                json_mode=True,
                tier="quality",
                use_cache=False,
            )
        result = json.loads(raw)
        result.setdefault("_source", "llm")
        return result

    except LLMOverloadError:
        logger.warning("LLM slots busy — raising error instead of template fallback")
        raise

    except json.JSONDecodeError as e:
        logger.error("LLM returned invalid JSON for recruiter feedback", error=str(e))
        raise ValueError("AI returned malformed feedback — please retry") from e

    except Exception:
        logger.error("LLM recruiter feedback failed", exc_info=True)
        raise


# ─── Claude Sonnet feedback (Pro tier) ───────────────────────────────────────

async def generate_recruiter_feedback_claude(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
    scores: dict,
    missing_keywords: list[dict],
    user_id: str,
) -> dict:
    """
    Pro-tier recruiter feedback powered by Claude Sonnet.
    Deeper analysis, more specific, richer improvement suggestions.
    """
    from app.services.claude_client import claude_complete

    score_line = (
        f"Overall {scores.get('overall_score', 0)}/100 | "
        f"ATS {scores.get('ats_score', 0)}/100 | "
        f"Technical Fit {scores.get('technical_fit_score', 0)}/100 | "
        f"Semantic {scores.get('semantic_match_score', 0)}/100 | "
        f"Recruiter {scores.get('recruiter_impression_score', 0)}/100"
    )
    missing_str = ", ".join(kw["keyword"] for kw in missing_keywords[:15])

    system = (
        "You are a senior technical recruiter with 15+ years hiring for top tech companies. "
        "You give brutally honest, deeply specific feedback. You always reference actual content "
        "from the resume by name — specific projects, companies, exact technologies, real bullet points. "
        "Never write generic advice. Every point must be traceable to something in the resume or JD."
    )

    user_msg = f"""Analyse this resume against this job description. Return JSON only — no markdown.

=== RESUME ===
{resume_text[:4000]}

=== JOB DESCRIPTION ===
{job_text[:2500]}

=== ATS SCORES (JobSynk Neural Scorer) ===
{score_line}
Missing keywords: {missing_str}

Return this exact JSON structure:
{{
  "recruiter_summary": "4-5 sentences: brutally honest, specific assessment of THIS application for THIS role. Name the candidate. Reference specific projects/technologies. State clearly what's missing and what's impressive.",
  "strengths": [
    {{"title": "", "description": "reference specific resume content by name", "impact": "high|medium|low"}}
  ],
  "weaknesses": [
    {{"title": "", "description": "specific gap vs JD requirements", "severity": "critical|major|minor", "section": "experience|skills|education|projects"}}
  ],
  "skill_gaps": [
    {{"skill": "", "importance": "critical|important|nice_to_have", "how_to_acquire": "specific actionable path with resource names", "time_to_learn": "realistic estimate", "resources": ["specific course/book/project"]}}
  ],
  "improvement_suggestions": [
    {{"category": "ATS|Skills|Experience|Projects|Format", "title": "", "description": "exactly what to change and why it matters for this role", "priority": "high|medium|low", "action": "precise next step they can take today"}}
  ]
}}

Provide 4-6 items per section. Be specific — a candidate should read this and know exactly what to do next."""

    try:
        raw = await claude_complete(
            user_id=user_id,
            feature="ats_feedback",
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=2500,
            skip_quota_check=True,  # analysis quota already checked upstream
        )
        # Claude sometimes wraps in ```json ... ```
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rstrip("`").strip()
        result = json.loads(text)
        result["_source"] = "claude-sonnet"
        return result
    except json.JSONDecodeError as e:
        logger.error("Claude returned invalid JSON for recruiter feedback", error=str(e))
        raise ValueError("AI returned malformed feedback") from e
    except Exception as e:
        logger.error("Claude recruiter feedback failed — falling back to Groq", error=str(e))
        # Fall back to Groq so analysis never fully fails
        return await generate_recruiter_feedback(
            resume_text=resume_text,
            job_text=job_text,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            scores=scores,
            missing_keywords=missing_keywords,
        )


async def generate_bullet_rewrites_claude(
    parsed_resume: dict,
    parsed_job: dict,
    user_id: str,
) -> list[dict]:
    """
    Pro-tier bullet rewrites powered by Claude Sonnet.
    More context-aware, role-specific rewrites.
    """
    from app.services.claude_client import claude_complete

    bullets_ctx = _collect_bullets(parsed_resume, limit=10)
    if not bullets_ctx:
        return []

    job_title = parsed_job.get("title", "Software Engineer")
    req_skills = ", ".join(parsed_job.get("required_skills", [])[:10])
    preferred  = ", ".join(parsed_job.get("preferred_skills", [])[:6])
    bullets_str = "\n".join(
        f"{i+1}. [{bc['section']}] {bc['bullet']}"
        for i, bc in enumerate(bullets_ctx)
    )

    system = (
        "You are an expert resume writer who specialises in tech roles. "
        "You rewrite resume bullets to be tighter, more impactful, and optimised for ATS and recruiters. "
        "You preserve the candidate's actual experience — you never invent metrics or technologies they didn't mention."
    )

    user_msg = f"""Rewrite these resume bullets for a {job_title} role.

Required skills: {req_skills}
Preferred: {preferred}

BULLETS:
{bullets_str}

Rules:
- Start with a strong action verb (Architected, Reduced, Shipped, Led, Scaled…)
- Add a real metric where the original implies one (%, $, users, ms latency…)
- Make it directly relevant to the role's requirements above
- Keep it under 120 characters
- Never invent technologies or achievements not in the original

Return JSON only:
{{"rewrites":[{{"section":"","original":"","rewritten":"","improvement_reason":"specific reason this version is stronger for {job_title}","metrics_added":true|false}}]}}"""

    try:
        raw = await claude_complete(
            user_id=user_id,
            feature="ats_feedback",
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            max_tokens=2000,
            skip_quota_check=True,
        )
        text = raw.strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.rstrip("`").strip()
        result = json.loads(text)
        rewrites = result.get("rewrites", [])
        for r in rewrites:
            r["_source"] = "claude-sonnet"
        return rewrites
    except Exception as e:
        logger.error("Claude bullet rewrites failed — falling back to Groq", error=str(e))
        return await generate_bullet_rewrites(
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
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

    job_title = parsed_job.get("title", "Software Engineer")
    req_skills = ", ".join(parsed_job.get("required_skills", [])[:8])
    preferred = ", ".join(parsed_job.get("preferred_skills", [])[:5])

    bullets_str = "\n".join(
        f"{i+1}. [{bc['section']}] {bc['bullet']}"
        for i, bc in enumerate(bullets_ctx)
    )

    prompt = f"""Rewrite these resume bullets to be stronger for this specific role.

Role: {job_title}
Required skills: {req_skills}
Preferred: {preferred}

BULLETS TO REWRITE:
{bullets_str}

For each bullet: use a strong action verb, add a specific metric if possible, make it directly relevant to the role requirements above. Reference actual technologies and context from the original — don't invent new content.

Return JSON:
{{"rewrites":[{{"section":"","original":"","rewritten":"","improvement_reason":"why this specific change makes it stronger for this role","metrics_added":true|false}}]}}"""

    try:
        async with LLMSlot(timeout=45.0):
            raw = await llm_call(
                prompt=prompt,
                temperature=0.7,
                max_tokens=1400,
                json_mode=True,
                tier="fast",
                use_cache=False,
            )
        result = json.loads(raw)
        return result.get("rewrites", [])

    except (LLMOverloadError, json.JSONDecodeError, Exception) as e:
        logger.error("Bullet rewrite LLM failed", error=str(e))
        raise


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
