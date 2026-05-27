"""
Template-based Feedback Generator — zero LLM dependency.

Strategy:
  Generates recruiter-quality feedback entirely from scoring signals
  and deterministic rules. No Groq / Ollama needed.

  This runs FIRST. Only escalate to an LLM when scores are borderline
  (40-75) and the user has explicit premium access, or when the caller
  explicitly passes force_llm=True.

  Benefits:
    • Handles unlimited concurrent users (no rate limit)
    • Sub-millisecond generation
    • Deterministic — same input → same output (fully cacheable)
    • Covers 80% of use cases perfectly (extreme scores are clear-cut)
"""
from __future__ import annotations

from typing import Any
import structlog

logger = structlog.get_logger()


# ─── Strength / weakness templates ───────────────────────────────────────────

_STRENGTHS: dict[str, list[dict]] = {
    "ats_high": [
        {
            "title": "ATS Keyword Optimisation",
            "description": "Resume contains high-density keyword coverage matching the JD's required skills.",
            "impact": "high",
        },
    ],
    "ats_medium": [
        {
            "title": "Solid ATS Alignment",
            "description": "Core job keywords are present; minor additions would push ATS score higher.",
            "impact": "medium",
        },
    ],
    "technical_high": [
        {
            "title": "Strong Technical Match",
            "description": "Technical skill stack closely matches the role's requirements.",
            "impact": "high",
        },
    ],
    "semantic_high": [
        {
            "title": "Excellent Semantic Fit",
            "description": "Resume language strongly resonates with the job's domain — you speak the same vocabulary as the team.",
            "impact": "high",
        },
    ],
    "recruiter_high": [
        {
            "title": "Compelling Recruiter Profile",
            "description": "Seniority signals, company tier, and progression patterns all align with what recruiters look for.",
            "impact": "high",
        },
    ],
    "metrics_present": [
        {
            "title": "Quantified Achievements",
            "description": "Bullet points include measurable outcomes (%, $, scale), which dramatically increase recruiter engagement.",
            "impact": "high",
        },
    ],
    "projects_relevant": [
        {
            "title": "Relevant Project Experience",
            "description": "Side projects / portfolio work directly maps to the role's responsibilities.",
            "impact": "medium",
        },
    ],
    "career_progression": [
        {
            "title": "Clear Career Trajectory",
            "description": "Consistent title/seniority growth visible from employment history.",
            "impact": "medium",
        },
    ],
    "education_strong": [
        {
            "title": "Strong Educational Background",
            "description": "Degree tier and field are well-matched to the target role.",
            "impact": "medium",
        },
    ],
    "low_skill_gap": [
        {
            "title": "Minimal Skill Gap",
            "description": "You already have the vast majority of skills listed in the job description.",
            "impact": "high",
        },
    ],
}

_WEAKNESSES: dict[str, list[dict]] = {
    "ats_low": [
        {
            "title": "Missing ATS Keywords",
            "description": "Applicant Tracking System will likely filter this resume before a human sees it.",
            "severity": "critical",
            "section": "keywords",
        },
    ],
    "ats_medium": [
        {
            "title": "ATS Keyword Gaps",
            "description": "Several important keywords from the job description are absent or under-represented.",
            "severity": "major",
            "section": "keywords",
        },
    ],
    "technical_low": [
        {
            "title": "Significant Technical Skill Gap",
            "description": "Core technical requirements listed in the JD are not demonstrated in the resume.",
            "severity": "critical",
            "section": "skills",
        },
    ],
    "technical_medium": [
        {
            "title": "Partial Technical Coverage",
            "description": "Some required technical skills are missing. Addressing these would significantly improve your fit score.",
            "severity": "major",
            "section": "skills",
        },
    ],
    "semantic_low": [
        {
            "title": "Language Mismatch",
            "description": "Resume vocabulary doesn't align well with the job description's domain language. Consider mirroring terminology from the JD.",
            "severity": "major",
            "section": "content",
        },
    ],
    "recruiter_low": [
        {
            "title": "Weak Seniority Signals",
            "description": "Resume does not clearly convey the expected experience level for this role.",
            "severity": "major",
            "section": "experience",
        },
    ],
    "no_metrics": [
        {
            "title": "No Quantified Impact",
            "description": "Bullet points lack measurable outcomes. Recruiters skip bullets without numbers.",
            "severity": "critical",
            "section": "experience",
        },
    ],
    "large_skill_gap": [
        {
            "title": "Large Skill Gap",
            "description": "Multiple high-priority skills from the JD are missing from your profile.",
            "severity": "critical",
            "section": "skills",
        },
    ],
    "project_mismatch": [
        {
            "title": "Project Relevance Mismatch",
            "description": "Projects listed don't clearly demonstrate the competencies required for this role.",
            "severity": "minor",
            "section": "projects",
        },
    ],
}

_IMPROVEMENTS: dict[str, dict] = {
    "add_keywords": {
        "category": "Keywords",
        "title": "Add Missing JD Keywords",
        "description": "Directly mirror the exact phrasing from the job description for required skills.",
        "priority": "high",
        "action": "Copy exact technology names from 'Required' section of JD into your Skills section.",
    },
    "add_metrics": {
        "category": "Impact Quantification",
        "title": "Quantify Every Bullet Point",
        "description": "Replace vague statements with specific, measurable outcomes.",
        "priority": "high",
        "action": "Format: 'Action verb + [what] + [metric]'. E.g., 'Reduced API latency by 40% serving 2M daily requests'.",
    },
    "mirror_jd_language": {
        "category": "Semantic Alignment",
        "title": "Mirror Job Description Language",
        "description": "Use the same terminology as the employer — especially for frameworks, methodologies, and tools.",
        "priority": "medium",
        "action": "Read JD 3× and identify 10 key phrases. Use each phrase naturally in your bullet points.",
    },
    "strengthen_summary": {
        "category": "Profile Summary",
        "title": "Write a Role-Specific Summary",
        "description": "Top of resume should directly address this specific role, not be generic.",
        "priority": "high",
        "action": "2-3 sentences: who you are, top relevant skill, biggest relevant achievement.",
    },
    "add_projects": {
        "category": "Proof of Work",
        "title": "Add Relevant Projects",
        "description": "Side projects directly using required skills prove capability beyond job titles.",
        "priority": "medium",
        "action": "Add 1-2 projects that use the JD's primary tech stack. Link to GitHub.",
    },
    "rewrite_bullets_with_verbs": {
        "category": "Writing Quality",
        "title": "Use Strong Action Verbs",
        "description": "Weak verbs (worked on, helped, involved in) reduce recruiter impact.",
        "priority": "medium",
        "action": "Start every bullet with: Architected, Reduced, Delivered, Scaled, Shipped, Led, Optimised.",
    },
    "close_skill_gap": {
        "category": "Skills",
        "title": "Close Critical Skill Gaps",
        "description": "High-demand missing skills should be addressed before applying.",
        "priority": "high",
        "action": "Build a quick project using the missing tech, then add it to your Skills and Projects sections.",
    },
    "education_signal": {
        "category": "Education",
        "title": "Highlight Relevant Coursework",
        "description": "For early-career roles, relevant courses and projects carry significant weight.",
        "priority": "low",
        "action": "Add GPA (if 3.5+), honours, relevant coursework, and thesis topic.",
    },
}


# ─── Summary generators ───────────────────────────────────────────────────────

def _build_summary(scores: dict, tier: str) -> str:
    overall = scores.get("overall_score", 0)
    interview_prob = scores.get("interview_probability", 0)
    ats = scores.get("ats_score", 0)
    tech = scores.get("technical_fit_score", 0)
    skill_gap = scores.get("skill_gap_score", 100)

    if tier == "top_10":
        return (
            f"Outstanding application. With an overall score of {overall}/100 and "
            f"{round(interview_prob)}% interview probability, this profile is in the top 10% "
            f"of candidates for this role. Submit with confidence."
        )
    elif tier == "competitive":
        weakest = min(
            [("ATS", ats), ("Technical", tech)],
            key=lambda x: x[1]
        )
        return (
            f"Competitive profile ({overall}/100). You have a solid chance at {round(interview_prob)}% "
            f"interview probability. Improve your {weakest[0]} score ({round(weakest[1])}/100) "
            f"for an even stronger application."
        )
    elif tier == "borderline":
        return (
            f"Borderline fit at {overall}/100. Your {round(interview_prob)}% interview probability "
            f"suggests this is a stretch role. Targeted improvements — especially to "
            f"{'ATS keywords' if ats < 60 else 'technical alignment'} — could tip the scales."
        )
    else:  # unlikely
        issues = []
        if ats < 50:
            issues.append("ATS keyword coverage")
        if tech < 50:
            issues.append("technical skill alignment")
        if skill_gap > 60:
            issues.append("large skill gap")
        issue_str = " and ".join(issues) if issues else "multiple scoring dimensions"
        return (
            f"Significant challenges detected (score: {overall}/100, interview probability: "
            f"{round(interview_prob)}%). Primary blockers: {issue_str}. "
            f"Consider closing the skill gap before applying."
        )


# ─── Main entrypoint ──────────────────────────────────────────────────────────

def generate_template_feedback(
    scores: dict,
    parsed_resume: dict,
    parsed_job: dict,
    missing_keywords: list[dict],
    skill_gap_analysis: dict | None = None,
) -> dict:
    """
    Produce full recruiter feedback without any LLM call.

    Args:
        scores: dict with ats_score, technical_fit_score, semantic_match_score,
                recruiter_impression_score, project_relevance_score, overall_score,
                interview_probability, skill_gap_score
        parsed_resume: structured resume dict
        parsed_job: structured job dict
        missing_keywords: list of {keyword, weight, category}
        skill_gap_analysis: optional output from skill_graph.analyze_skill_gaps

    Returns:
        dict matching the same schema as generate_recruiter_feedback()
    """
    ats = scores.get("ats_score", 0)
    tech = scores.get("technical_fit_score", 0)
    semantic = scores.get("semantic_match_score", 0)
    recruiter = scores.get("recruiter_impression_score", 0)
    projects = scores.get("project_relevance_score", 0)
    skill_gap = scores.get("skill_gap_score", 50)
    overall = scores.get("overall_score", 0)
    interview_prob = scores.get("interview_probability", 0)

    tier = _classify_tier(interview_prob)

    # ── Detect signal flags ──────────────────────────────────────────────────
    has_metrics = _detect_metrics(parsed_resume)
    strong_progression = _detect_career_progression(parsed_resume)
    strong_education = _detect_education_tier(parsed_resume)

    # ── Build strengths ──────────────────────────────────────────────────────
    strengths: list[dict] = []

    if ats >= 75:
        strengths.extend(_STRENGTHS["ats_high"])
    elif ats >= 60:
        strengths.extend(_STRENGTHS["ats_medium"])

    if tech >= 75:
        strengths.extend(_STRENGTHS["technical_high"])

    if semantic >= 75:
        strengths.extend(_STRENGTHS["semantic_high"])

    if recruiter >= 70:
        strengths.extend(_STRENGTHS["recruiter_high"])

    if has_metrics:
        strengths.extend(_STRENGTHS["metrics_present"])

    if projects >= 70:
        strengths.extend(_STRENGTHS["projects_relevant"])

    if strong_progression:
        strengths.extend(_STRENGTHS["career_progression"])

    if strong_education:
        strengths.extend(_STRENGTHS["education_strong"])

    if skill_gap < 30:
        strengths.extend(_STRENGTHS["low_skill_gap"])

    # ── Build weaknesses ─────────────────────────────────────────────────────
    weaknesses: list[dict] = []

    if ats < 50:
        weaknesses.extend(_WEAKNESSES["ats_low"])
    elif ats < 70:
        weaknesses.extend(_WEAKNESSES["ats_medium"])

    if tech < 50:
        weaknesses.extend(_WEAKNESSES["technical_low"])
    elif tech < 65:
        weaknesses.extend(_WEAKNESSES["technical_medium"])

    if semantic < 50:
        weaknesses.extend(_WEAKNESSES["semantic_low"])

    if recruiter < 50:
        weaknesses.extend(_WEAKNESSES["recruiter_low"])

    if not has_metrics:
        weaknesses.extend(_WEAKNESSES["no_metrics"])

    if skill_gap >= 60:
        weaknesses.extend(_WEAKNESSES["large_skill_gap"])

    if projects < 50 and _has_projects_section(parsed_resume):
        weaknesses.extend(_WEAKNESSES["project_mismatch"])

    # Deduplicate and cap at 5
    strengths = _dedup(strengths)[:5]
    weaknesses = _dedup(weaknesses)[:5]

    # ── Build skill gaps ─────────────────────────────────────────────────────
    skill_gaps_out = _build_skill_gaps(missing_keywords, skill_gap_analysis)

    # ── Build improvement suggestions ────────────────────────────────────────
    suggestions = _build_suggestions(ats, tech, semantic, has_metrics, skill_gap, parsed_resume)

    # ── Summary ──────────────────────────────────────────────────────────────
    summary = _build_summary(scores, tier)

    logger.debug(
        "Template feedback generated",
        tier=tier,
        overall=overall,
        strengths=len(strengths),
        weaknesses=len(weaknesses),
        suggestions=len(suggestions),
    )

    return {
        "recruiter_summary": summary,
        "strengths": strengths,
        "weaknesses": weaknesses,
        "skill_gaps": skill_gaps_out,
        "improvement_suggestions": suggestions,
        "_source": "template",   # marker — callers can check this
    }


# ─── Decision function — should we call an LLM? ───────────────────────────────

def should_use_llm(scores: dict, force_template: bool = False) -> bool:
    """
    Returns True only when the LLM is genuinely needed for nuanced advice.

    Template covers: extreme scores (very high or very low) — clear-cut.
    LLM adds value for: borderline scores where nuanced phrasing matters.
    """
    if force_template:
        return False

    overall = scores.get("overall_score", 0)
    interview_prob = scores.get("interview_probability", 0)

    # Very strong or very weak — template is perfectly adequate
    if overall >= 80 or overall <= 35:
        return False
    if interview_prob >= 70 or interview_prob <= 25:
        return False

    # Borderline range — LLM adds genuine value
    return True


# ─── Private helpers ──────────────────────────────────────────────────────────

def _classify_tier(interview_prob: float) -> str:
    if interview_prob >= 75:
        return "top_10"
    if interview_prob >= 55:
        return "competitive"
    if interview_prob >= 35:
        return "borderline"
    return "unlikely"


def _detect_metrics(parsed_resume: dict) -> bool:
    """Check if bullets contain numbers / percentages / $ amounts."""
    import re
    metric_pattern = re.compile(r'\d+%|\$\d+|\d+[xX]\b|\d{3,}')
    for exp in parsed_resume.get("experience", []):
        for bullet in exp.get("bullets", []):
            if metric_pattern.search(bullet):
                return True
    return False


def _detect_career_progression(parsed_resume: dict) -> bool:
    """Detect if job titles show upward progression (simple heuristic)."""
    SENIOR_WORDS = {"senior", "sr", "lead", "principal", "staff", "manager", "director", "vp", "head"}
    titles = [
        exp.get("title", "").lower()
        for exp in parsed_resume.get("experience", [])
    ]
    # At least one senior+ role in the last 2 positions
    for t in titles[:2]:
        if any(sw in t for sw in SENIOR_WORDS):
            return True
    return False


def _detect_education_tier(parsed_resume: dict) -> bool:
    """Detect strong educational background."""
    TIER_1 = {"mit", "stanford", "berkeley", "cmu", "caltech", "harvard", "princeton", "oxf", "cambridge", "iit", "iisc"}
    ADVANCED = {"phd", "ms", "msc", "m.s.", "master", "m.eng"}
    for edu in parsed_resume.get("education", []):
        inst = edu.get("institution", "").lower()
        deg = edu.get("degree", "").lower()
        if any(t in inst for t in TIER_1):
            return True
        if any(a in deg for a in ADVANCED):
            return True
    return False


def _has_projects_section(parsed_resume: dict) -> bool:
    return bool(parsed_resume.get("projects"))


def _build_skill_gaps(
    missing_keywords: list[dict],
    skill_gap_analysis: dict | None,
) -> list[dict]:
    """Convert missing keywords + gap analysis into structured skill gap items."""
    gaps = []

    # From skill_gap_analysis (richer data)
    if skill_gap_analysis:
        critical_gaps = skill_gap_analysis.get("critical_gaps", [])
        for gap in critical_gaps[:4]:
            skill = gap.get("skill", "")
            resources = gap.get("learning_resources", [])
            res_list = [r.get("url", r.get("title", "")) for r in resources[:2] if isinstance(r, dict)]
            gaps.append({
                "skill": skill,
                "importance": "critical",
                "how_to_acquire": f"Build a small project using {skill} and add it to your portfolio",
                "time_to_learn": f"{gap.get('days_to_learn', 14)} days",
                "resources": res_list,
            })

        moderate_gaps = skill_gap_analysis.get("moderate_gaps", [])
        for gap in moderate_gaps[:2]:
            skill = gap.get("skill", "")
            gaps.append({
                "skill": skill,
                "importance": "important",
                "how_to_acquire": f"Complete a tutorial and add {skill} to Skills section",
                "time_to_learn": f"{gap.get('days_to_learn', 7)} days",
                "resources": [],
            })
        return gaps[:5]

    # Fallback: from missing keywords
    for kw in missing_keywords[:5]:
        keyword = kw.get("keyword", "")
        weight = kw.get("weight", 0)
        category = kw.get("category", "")
        importance = "critical" if weight >= 0.08 else "important" if weight >= 0.05 else "nice_to_have"
        gaps.append({
            "skill": keyword,
            "importance": importance,
            "how_to_acquire": f"Add {keyword} experience via a project or certification",
            "time_to_learn": "1-4 weeks",
            "resources": [],
        })

    return gaps


def _build_suggestions(
    ats: float,
    tech: float,
    semantic: float,
    has_metrics: bool,
    skill_gap: float,
    parsed_resume: dict,
) -> list[dict]:
    suggestions = []

    if not has_metrics:
        suggestions.append(_IMPROVEMENTS["add_metrics"])

    if ats < 65:
        suggestions.append(_IMPROVEMENTS["add_keywords"])

    if semantic < 65:
        suggestions.append(_IMPROVEMENTS["mirror_jd_language"])

    if skill_gap >= 50:
        suggestions.append(_IMPROVEMENTS["close_skill_gap"])

    if not _has_summary(parsed_resume):
        suggestions.append(_IMPROVEMENTS["strengthen_summary"])

    if tech < 65 and not _has_projects_section(parsed_resume):
        suggestions.append(_IMPROVEMENTS["add_projects"])

    suggestions.append(_IMPROVEMENTS["rewrite_bullets_with_verbs"])

    # Return unique, highest priority first
    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions = sorted(suggestions, key=lambda x: priority_order.get(x["priority"], 9))
    return _dedup(suggestions)[:5]


def _has_summary(parsed_resume: dict) -> bool:
    summary = parsed_resume.get("summary", "") or ""
    return len(summary.strip()) > 50


def _dedup(items: list[dict]) -> list[dict]:
    """Remove duplicate items by title."""
    seen: set[str] = set()
    out = []
    for item in items:
        key = item.get("title", "")
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out
