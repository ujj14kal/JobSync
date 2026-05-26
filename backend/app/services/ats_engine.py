"""
ATS Engine: Multi-dimensional resume scoring.

5 scoring dimensions:
1. ATS Compatibility (format, sections, keyword density)
2. Technical Fit (skill overlap, tech stack)
3. Semantic Match (embedding cosine similarity)
4. Recruiter Impression (action verbs, metrics, clarity)
5. Project Relevance (project tech vs job requirements)
"""
from __future__ import annotations

import re
from typing import Any
from app.services.embedding_service import cosine_similarity
import structlog

logger = structlog.get_logger()


# ─── ATS Keyword Scoring ────────────────────────────────────────────────────

STRONG_ACTION_VERBS = {
    "developed", "built", "designed", "architected", "led", "managed",
    "implemented", "optimized", "reduced", "improved", "increased", "scaled",
    "deployed", "automated", "created", "launched", "delivered", "drove",
    "established", "integrated", "migrated", "refactored", "streamlined",
    "collaborated", "mentored", "owned", "shipped", "engineered",
}

METRIC_PATTERNS = [
    r"\d+%",           # percentages
    r"\$[\d,]+",       # dollar amounts
    r"\d+[kKmMbB]",    # k/M/B numbers
    r"\d+x",           # multipliers
    r"\d+\s*(million|billion|thousand)",
    r"(reduce|increase|improve)d?\s+\w+\s+by\s+\d+",
    r"\d+\s*(users|customers|requests|queries|services|teams|engineers)",
]


def score_ats_compatibility(resume_text: str, parsed_resume: dict) -> int:
    """
    ATS Compatibility Score (0-100):
    - Has required sections: experience, education, skills, contact
    - No tables/columns (single-column is better for ATS)
    - No graphics/images
    - Proper heading usage
    - Keyword density
    """
    score = 0
    max_score = 100

    raw_sections = parsed_resume.get("raw_sections", {})

    # Section presence (50 pts)
    section_weights = {
        "experience": 20,
        "education": 15,
        "skills": 10,
        "header": 5,
    }
    for section, weight in section_weights.items():
        if raw_sections.get(section) and len(raw_sections[section]) > 20:
            score += weight

    # Contact info completeness (20 pts)
    contact = parsed_resume.get("contact", {})
    if contact.get("email"):
        score += 8
    if contact.get("phone"):
        score += 6
    if contact.get("linkedin"):
        score += 6

    # Skills detected (15 pts)
    skills_count = len(parsed_resume.get("skills", []))
    if skills_count >= 10:
        score += 15
    elif skills_count >= 5:
        score += 10
    elif skills_count >= 1:
        score += 5

    # Experience bullets present (15 pts)
    experience = parsed_resume.get("experience", [])
    total_bullets = sum(len(e.get("bullets", [])) for e in experience)
    if total_bullets >= 10:
        score += 15
    elif total_bullets >= 5:
        score += 10
    elif total_bullets >= 1:
        score += 5

    return min(score, max_score)


def score_technical_fit(
    resume_skills: list[str],
    job_required_skills: list[str],
    job_tech_stack: list[str],
    job_preferred_skills: list[str],
) -> int:
    """
    Technical Fit Score (0-100):
    - Required skills match (60% weight)
    - Tech stack match (25% weight)
    - Preferred skills match (15% weight)
    """
    if not job_required_skills and not job_tech_stack:
        return 50  # No tech requirements = neutral

    resume_skills_lower = {s.lower() for s in resume_skills}

    def overlap_pct(required: list[str], candidate_set: set) -> float:
        if not required:
            return 1.0
        required_lower = {s.lower() for s in required}
        matches = required_lower & candidate_set
        # Also check substring matches
        for req in required_lower:
            for cand in candidate_set:
                if req in cand or cand in req:
                    matches.add(req)
        return len(matches) / len(required_lower)

    required_match = overlap_pct(job_required_skills, resume_skills_lower)
    tech_match = overlap_pct(job_tech_stack, resume_skills_lower)
    preferred_match = overlap_pct(job_preferred_skills, resume_skills_lower)

    score = (
        required_match * 60 +
        tech_match * 25 +
        preferred_match * 15
    )

    return min(int(score), 100)


def score_recruiter_impression(resume_text: str, parsed_resume: dict) -> int:
    """
    Recruiter Impression Score (0-100):
    - Strong action verbs in bullets
    - Quantifiable metrics
    - Appropriate resume length
    - Clear, specific bullet points
    - No generic filler phrases
    """
    score = 0
    experience = parsed_resume.get("experience", [])
    all_bullets = []
    for exp in experience:
        all_bullets.extend(exp.get("bullets", []))

    if not all_bullets:
        return 30  # Minimal score for no bullets

    # Action verbs (30 pts)
    verb_count = sum(
        1 for b in all_bullets
        if any(b.lower().startswith(verb) for verb in STRONG_ACTION_VERBS)
    )
    verb_ratio = verb_count / len(all_bullets)
    score += int(verb_ratio * 30)

    # Quantifiable metrics (35 pts)
    metric_count = 0
    for bullet in all_bullets:
        if any(re.search(p, bullet, re.IGNORECASE) for p in METRIC_PATTERNS):
            metric_count += 1
    metric_ratio = min(metric_count / max(len(all_bullets), 1), 1.0)
    score += int(metric_ratio * 35)

    # Resume length (15 pts)
    word_count = len(resume_text.split())
    if 400 <= word_count <= 1000:
        score += 15
    elif 300 <= word_count <= 1500:
        score += 10
    elif word_count > 0:
        score += 5

    # Summary present (10 pts)
    if parsed_resume.get("summary"):
        score += 10

    # Avoid weak phrases (penalize)
    weak_phrases = ["responsible for", "helped with", "assisted in", "worked on", "duties included"]
    weak_count = sum(
        1 for b in all_bullets
        if any(wp in b.lower() for wp in weak_phrases)
    )
    if weak_count > 0:
        penalty = min(weak_count * 3, 15)
        score = max(0, score - penalty)

    return min(score, 100)


def score_project_relevance(
    parsed_resume: dict,
    job_tech_stack: list[str],
    job_required_skills: list[str],
) -> int:
    """
    Project Relevance Score (0-100):
    How well the candidate's projects align with job requirements.
    """
    projects = parsed_resume.get("projects", [])

    if not projects:
        return 40  # No projects = neutral (not all roles require them)

    if not job_tech_stack and not job_required_skills:
        return 60

    all_required = set((s.lower() for s in job_tech_stack + job_required_skills))
    project_tech = set()
    for project in projects:
        for tech in project.get("tech_stack", []):
            project_tech.add(tech.lower())
        for bullet in project.get("bullets", []):
            words = bullet.lower().split()
            project_tech.update(words)

    if not all_required:
        return 60

    matches = all_required & project_tech
    # Substring matching
    for req in all_required:
        for tech in project_tech:
            if req in tech or tech in req:
                matches.add(req)

    overlap = len(matches) / len(all_required)
    score = int(overlap * 100)

    # Bonus for having multiple relevant projects
    if len(projects) >= 3:
        score = min(score + 10, 100)

    return min(max(score, 30), 100)


def compute_overall_score(
    ats: int,
    technical: int,
    semantic: int,
    recruiter: int,
    projects: int,
) -> int:
    """Weighted average of all dimension scores."""
    weights = {
        "ats": 0.20,
        "technical": 0.25,
        "semantic": 0.25,
        "recruiter": 0.20,
        "projects": 0.10,
    }
    overall = (
        ats * weights["ats"] +
        technical * weights["technical"] +
        semantic * weights["semantic"] +
        recruiter * weights["recruiter"] +
        projects * weights["projects"]
    )
    return min(int(overall), 100)


def find_missing_keywords(
    resume_text: str,
    job_required_skills: list[str],
    job_keywords: list[str],
    job_preferred_skills: list[str],
) -> list[dict]:
    """
    Find keywords in job description that are missing from resume.
    Returns list of {keyword, importance, context, category}.
    """
    resume_lower = resume_text.lower()
    missing = []

    def is_present(keyword: str) -> bool:
        kw = keyword.lower()
        # Direct match
        if kw in resume_lower:
            return True
        # Partial match for compound skills
        parts = kw.split()
        if len(parts) > 1 and all(p in resume_lower for p in parts):
            return True
        return False

    for skill in job_required_skills:
        if not is_present(skill):
            missing.append({
                "keyword": skill,
                "importance": "required",
                "context": f"Listed as required skill in job description",
                "category": "technical_skill",
            })

    for skill in job_preferred_skills:
        if not is_present(skill):
            missing.append({
                "keyword": skill,
                "importance": "preferred",
                "context": "Listed as preferred qualification",
                "category": "technical_skill",
            })

    for kw in job_keywords:
        if not is_present(kw) and len(kw) > 3:
            # Avoid duplicates
            if not any(m["keyword"].lower() == kw.lower() for m in missing):
                missing.append({
                    "keyword": kw,
                    "importance": "nice_to_have",
                    "context": "Mentioned in job description",
                    "category": "keyword",
                })

    return missing[:20]  # Top 20 most important


def compute_all_scores(
    resume_text: str,
    parsed_resume: dict,
    job_text: str,
    parsed_job: dict,
    resume_embedding: list[float],
    job_embedding: list[float],
) -> dict[str, Any]:
    """
    Compute all 5 ATS scores at once.
    Returns dict with all scores and raw data for feedback generation.
    """
    # Extract relevant fields
    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])
    job_preferred = parsed_job.get("preferred_skills", [])
    job_keywords = parsed_job.get("keywords", [])

    # Compute scores
    ats = score_ats_compatibility(resume_text, parsed_resume)

    technical = score_technical_fit(
        resume_skills, job_required, job_tech, job_preferred
    )

    # Semantic: cosine similarity of embeddings → 0-100
    if resume_embedding and job_embedding:
        sim = cosine_similarity(resume_embedding, job_embedding)
        semantic = int(((sim + 1) / 2) * 100)  # normalize from [-1,1] to [0,100]
    else:
        semantic = 50

    recruiter = score_recruiter_impression(resume_text, parsed_resume)

    projects = score_project_relevance(
        parsed_resume, job_tech, job_required
    )

    overall = compute_overall_score(ats, technical, semantic, recruiter, projects)

    # Missing keywords
    missing_keywords = find_missing_keywords(
        resume_text, job_required, job_keywords, job_preferred
    )

    return {
        "scores": {
            "overall_score": overall,
            "ats_score": ats,
            "technical_fit_score": technical,
            "semantic_match_score": semantic,
            "recruiter_impression_score": recruiter,
            "project_relevance_score": projects,
        },
        "missing_keywords": missing_keywords,
        "skill_overlap": {
            "matched": list(
                {s.lower() for s in resume_skills} &
                {s.lower() for s in job_required + job_tech}
            ),
            "missing": list(
                {s.lower() for s in job_required} -
                {s.lower() for s in resume_skills}
            ),
        },
    }
