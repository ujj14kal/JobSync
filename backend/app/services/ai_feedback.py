"""
AI Feedback Generator using Groq (free LLM).
Generates:
- Recruiter-style summary
- Strengths and weaknesses
- Skill gap analysis
- Bullet point rewrites
- Improvement suggestions
"""
from __future__ import annotations

import json
import structlog
from groq import AsyncGroq
from app.core.config import settings

logger = structlog.get_logger()


def _get_client() -> AsyncGroq:
    return AsyncGroq(api_key=settings.GROQ_API_KEY)


async def generate_recruiter_feedback(
    resume_text: str,
    job_text: str,
    parsed_resume: dict,
    parsed_job: dict,
    scores: dict,
    missing_keywords: list[dict],
) -> dict:
    """
    Generate comprehensive recruiter-style feedback using Groq LLM.
    Returns structured feedback JSON.
    """
    client = _get_client()

    # Build a concise context for the LLM
    resume_summary = _summarize_resume(parsed_resume)
    job_summary = _summarize_job(parsed_job)
    score_summary = (
        f"Overall: {scores['overall_score']}/100, "
        f"ATS: {scores['ats_score']}/100, "
        f"Technical Fit: {scores['technical_fit_score']}/100, "
        f"Semantic: {scores['semantic_match_score']}/100"
    )
    missing_kw_str = ", ".join(
        [kw["keyword"] for kw in missing_keywords[:10]]
    )

    prompt = f"""You are a senior technical recruiter at a top tech company (Google/Meta/Stripe level).
Review this resume against the job description and provide detailed, honest feedback.

=== CANDIDATE RESUME ===
{resume_summary}

=== TARGET JOB ===
{job_summary}

=== ATS SCORES ===
{score_summary}

=== MISSING KEYWORDS ===
{missing_kw_str}

Return ONLY valid JSON with exactly this structure:
{{
  "recruiter_summary": "2-3 sentence honest recruiter assessment of this application",
  "strengths": [
    {{
      "title": "strength name",
      "description": "specific explanation",
      "impact": "high|medium|low"
    }}
  ],
  "weaknesses": [
    {{
      "title": "weakness name",
      "description": "specific explanation",
      "severity": "critical|major|minor",
      "section": "which resume section this affects"
    }}
  ],
  "skill_gaps": [
    {{
      "skill": "skill name",
      "importance": "critical|important|nice_to_have",
      "how_to_acquire": "specific learning path",
      "time_to_learn": "estimated time e.g. 2-4 weeks",
      "resources": ["resource1", "resource2"]
    }}
  ],
  "improvement_suggestions": [
    {{
      "category": "Content|Format|Keywords|Projects|Experience",
      "title": "specific suggestion",
      "description": "detailed explanation",
      "priority": "high|medium|low",
      "action": "concrete action to take"
    }}
  ]
}}

Be specific, technical, and actionable. Focus on what matters most for THIS job.
Include 3-5 strengths, 3-5 weaknesses, 3-5 skill gaps, and 5-8 improvement suggestions."""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=3000,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error("Recruiter feedback generation failed", error=str(e))
        return _fallback_feedback(scores)


async def generate_bullet_rewrites(
    parsed_resume: dict,
    parsed_job: dict,
) -> list[dict]:
    """
    Rewrite weak resume bullet points with:
    - Stronger action verbs
    - Quantifiable metrics
    - Role-specific language
    """
    client = _get_client()

    # Collect bullets from experience
    bullets_with_context = []
    for exp in parsed_resume.get("experience", [])[:3]:  # Top 3 jobs
        for bullet in exp.get("bullets", [])[:4]:  # Top 4 bullets each
            bullets_with_context.append({
                "section": f"{exp.get('title', 'Experience')} at {exp.get('company', '')}",
                "bullet": bullet,
            })

    if not bullets_with_context:
        return []

    job_title = parsed_job.get("title", "Software Engineer")
    job_company = parsed_job.get("company", "")
    required_skills = ", ".join(parsed_job.get("required_skills", [])[:8])

    bullets_str = "\n".join(
        f"{i+1}. [{bc['section']}] {bc['bullet']}"
        for i, bc in enumerate(bullets_with_context[:12])
    )

    prompt = f"""You are a professional resume writer specializing in tech resumes.
Rewrite these resume bullet points for a "{job_title}" position at {job_company}.

Required skills for this role: {required_skills}

BULLETS TO IMPROVE:
{bullets_str}

Rewrite each bullet to:
1. Start with a powerful action verb (Developed, Engineered, Led, Scaled, etc.)
2. Include quantifiable metrics (%, $, x improvement, # users)
3. Mention relevant technologies for this role where appropriate
4. Show business impact, not just task completion
5. Be specific and concise (1-2 lines max)

Return ONLY valid JSON:
{{
  "rewrites": [
    {{
      "section": "job title at company",
      "original": "original bullet text",
      "rewritten": "improved bullet text",
      "improvement_reason": "why this is better",
      "metrics_added": true|false
    }}
  ]
}}"""

    try:
        response = await client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return result.get("rewrites", [])
    except Exception as e:
        logger.error("Bullet rewrite generation failed", error=str(e))
        return []


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _summarize_resume(parsed_resume: dict) -> str:
    """Create a compact resume summary for the LLM prompt."""
    lines = []

    contact = parsed_resume.get("contact", {})
    if contact.get("name"):
        lines.append(f"Name: {contact['name']}")

    if parsed_resume.get("summary"):
        lines.append(f"Summary: {parsed_resume['summary'][:200]}")

    skills = parsed_resume.get("skills", [])
    if skills:
        lines.append(f"Skills: {', '.join(skills[:20])}")

    experience = parsed_resume.get("experience", [])
    for exp in experience[:3]:
        lines.append(
            f"\n{exp.get('title', '')} at {exp.get('company', '')} "
            f"({exp.get('start_date', '')} - {exp.get('end_date', 'Present')})"
        )
        for bullet in exp.get("bullets", [])[:3]:
            lines.append(f"  • {bullet[:150]}")

    education = parsed_resume.get("education", [])
    for edu in education[:2]:
        lines.append(f"Education: {edu.get('degree', '')} - {edu.get('institution', '')}")

    return "\n".join(lines)[:3000]


def _summarize_job(parsed_job: dict) -> str:
    """Create a compact job description summary."""
    lines = [
        f"Title: {parsed_job.get('title', '')}",
        f"Company: {parsed_job.get('company', '')}",
        f"Level: {parsed_job.get('experience_level', '')}",
    ]

    reqs = parsed_job.get("requirements", [])
    if reqs:
        lines.append(f"Requirements: {'; '.join(reqs[:6])}")

    skills = parsed_job.get("required_skills", [])
    if skills:
        lines.append(f"Required Skills: {', '.join(skills[:12])}")

    preferred = parsed_job.get("preferred_skills", [])
    if preferred:
        lines.append(f"Preferred: {', '.join(preferred[:6])}")

    return "\n".join(lines)[:2000]


def _fallback_feedback(scores: dict) -> dict:
    """Return minimal feedback when LLM fails."""
    overall = scores.get("overall_score", 0)

    if overall >= 75:
        summary = "Strong application overall. A few targeted improvements could make this even more competitive."
    elif overall >= 50:
        summary = "Decent profile but needs work to stand out. Focus on adding metrics and closing skill gaps."
    else:
        summary = "Significant gaps between your resume and this role. Major improvements needed before applying."

    return {
        "recruiter_summary": summary,
        "strengths": [
            {"title": "Application submitted", "description": "Resume processed successfully", "impact": "low"}
        ],
        "weaknesses": [
            {"title": "Analysis limited", "description": "Full AI feedback unavailable", "severity": "minor", "section": "overall"}
        ],
        "skill_gaps": [],
        "improvement_suggestions": [
            {
                "category": "Content",
                "title": "Add quantifiable metrics",
                "description": "Add specific numbers to your bullet points",
                "priority": "high",
                "action": "Review each bullet point and add percentages, dollar amounts, or scale metrics",
            }
        ],
    }
