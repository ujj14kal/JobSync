"""
ATS Engine v2 — Multi-dimensional resume scoring with skill normalization.

5 scoring dimensions:
1. ATS Compatibility    (format, sections, keyword density)        20%
2. Technical Fit        (normalized skill overlap)                 25%
3. Semantic Match       (section-chunked embedding similarity)     25%
4. Recruiter Impression (action verbs, metrics, clarity)          20%
5. Project Relevance    (project tech vs job requirements)         10%

v2 improvements:
- All skill matching uses skill_normalizer (handles k8s=kubernetes, etc.)
- Section-level semantic scoring (experience vs JD, not full doc)
- Weighted semantic: experience 50%, skills 30%, projects 20%
- Missing keyword dedup with normalized forms
"""
from __future__ import annotations

import re
from typing import Any
from app.services.embedding_service import cosine_similarity, embed_text
from app.services.skill_normalizer import (
    normalize_skill,
    normalize_skills,
    skills_overlap,
    display_skill,
)
import structlog

logger = structlog.get_logger()


# ─── Action Verbs & Patterns ─────────────────────────────────────────────────

STRONG_ACTION_VERBS = {
    "developed", "built", "designed", "architected", "led", "managed",
    "implemented", "optimized", "reduced", "improved", "increased", "scaled",
    "deployed", "automated", "created", "launched", "delivered", "drove",
    "established", "integrated", "migrated", "refactored", "streamlined",
    "collaborated", "mentored", "owned", "shipped", "engineered", "spearheaded",
    "transformed", "orchestrated", "pioneered", "accelerated", "achieved",
    "boosted", "championed", "consolidated", "contributed", "coordinated",
    "crafted", "cut", "decreased", "defined", "devised", "directed",
    "eliminated", "enabled", "enhanced", "ensured", "exceeded", "executed",
    "expanded", "facilitated", "generated", "grew", "guided", "handled",
    "identified", "influenced", "initiated", "innovated", "inspired",
    "introduced", "leveraged", "maximized", "minimized", "modernized",
    "monitored", "oversaw", "partnered", "planned", "produced", "prototyped",
    "published", "rebuilt", "researched", "resolved", "restructured", "reviewed",
    "saved", "secured", "simplified", "solved", "standardized", "supported",
    "trained", "unified", "upgraded", "utilized",
}

METRIC_PATTERNS = [
    r"\d+\s*%",
    r"\$[\d,]+",
    r"\d+[kKmMbB]\b",
    r"\d+x\b",
    r"\d+\s*(million|billion|thousand)",
    r"(reduce|increase|improve|decrease|save|grow)d?\s+\w+\s+by\s+\d+",
    r"\d+\s*(users|customers|requests|queries|services|teams|engineers|repos|pipelines|apis)",
    r"(top|bottom)\s+\d+\s*%",
    r"\d+\s*(hours|days|weeks|months)\s*(faster|reduction|saved)",
]

WEAK_PHRASES = [
    "responsible for", "helped with", "assisted in", "worked on",
    "duties included", "was involved in", "participated in", "exposure to",
    "familiar with", "knowledge of", "understanding of", "tasked with",
]


# ─── ATS Compatibility ───────────────────────────────────────────────────────

def score_ats_compatibility(resume_text: str, parsed_resume: dict) -> int:
    """
    ATS Compatibility Score (0-100):
    - Section presence (50 pts)
    - Contact info completeness (20 pts)
    - Skills detected (15 pts)
    - Experience bullets (15 pts)
    """
    score = 0
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

    # Contact info (20 pts)
    contact = parsed_resume.get("contact", {})
    if contact.get("email"):
        score += 8
    if contact.get("phone"):
        score += 6
    if contact.get("linkedin"):
        score += 6

    # Skills (15 pts)
    skills_count = len(parsed_resume.get("skills", []))
    if skills_count >= 12:
        score += 15
    elif skills_count >= 7:
        score += 10
    elif skills_count >= 3:
        score += 5

    # Experience bullets (15 pts)
    experience = parsed_resume.get("experience", [])
    total_bullets = sum(len(e.get("bullets", [])) for e in experience)
    if total_bullets >= 12:
        score += 15
    elif total_bullets >= 6:
        score += 10
    elif total_bullets >= 2:
        score += 5

    return min(score, 100)


# ─── Technical Fit ────────────────────────────────────────────────────────────

def score_technical_fit(
    resume_skills: list[str],
    job_required_skills: list[str],
    job_tech_stack: list[str],
    job_preferred_skills: list[str],
) -> int:
    """
    Technical Fit Score (0-100) using normalized skill matching.
    - Required skills match  60%
    - Tech stack match       25%
    - Preferred skills match 15%
    """
    if not job_required_skills and not job_tech_stack:
        return 50

    def _overlap_pct(job_skills: list[str], resume_set: set[str]) -> float:
        if not job_skills:
            return 1.0
        matched, _ = skills_overlap(resume_skills, job_skills)
        return len(matched) / len(set(normalize_skills(job_skills)))

    resume_norm_set = set(normalize_skills(resume_skills))

    required_pct = _overlap_pct(job_required_skills, resume_norm_set)
    tech_pct = _overlap_pct(job_tech_stack, resume_norm_set)
    preferred_pct = _overlap_pct(job_preferred_skills, resume_norm_set)

    score = (required_pct * 60) + (tech_pct * 25) + (preferred_pct * 15)
    return min(int(score), 100)


# ─── Semantic Match ───────────────────────────────────────────────────────────

def score_semantic_match(
    parsed_resume: dict,
    parsed_job: dict,
    resume_embedding: list[float],
    job_embedding: list[float],
) -> int:
    """
    Semantic Match Score (0-100).
    Section-level similarity:
      - experience section ↔ job responsibilities/requirements  50%
      - skills section ↔ job tech stack                         30%
      - full doc (fallback/tiebreak)                            20%
    """
    if not resume_embedding or not job_embedding:
        return 50

    raw_sections = parsed_resume.get("raw_sections", {})
    parsed_job_raw = parsed_job.get("raw_sections", {}) if isinstance(parsed_job, dict) else {}

    # Build section texts
    resume_exp = raw_sections.get("experience", "")
    resume_skills_text = raw_sections.get("skills", "")

    job_requirements = " ".join([
        parsed_job.get("raw_sections", {}).get("requirements", "") if isinstance(parsed_job, dict) else "",
        " ".join(parsed_job.get("required_skills", []) if isinstance(parsed_job, dict) else []),
        " ".join(parsed_job.get("responsibilities", []) if isinstance(parsed_job, dict) else []),
    ])
    job_tech_text = " ".join(
        parsed_job.get("tech_stack", []) + parsed_job.get("preferred_skills", [])
        if isinstance(parsed_job, dict) else []
    )

    scores: list[tuple[float, float]] = []  # (similarity, weight)

    # Full doc similarity (always available)
    full_sim = cosine_similarity(resume_embedding, job_embedding)
    scores.append((full_sim, 0.2))

    # Experience ↔ requirements
    if resume_exp.strip() and job_requirements.strip():
        exp_emb = embed_text(resume_exp[:2000])
        req_emb = embed_text(job_requirements[:2000])
        exp_sim = cosine_similarity(exp_emb, req_emb)
        scores.append((exp_sim, 0.5))
    else:
        # Redistribute weight to full doc
        scores[0] = (scores[0][0], 0.7)

    # Skills ↔ tech stack
    if resume_skills_text.strip() and job_tech_text.strip():
        skills_emb = embed_text(resume_skills_text[:1000])
        tech_emb = embed_text(job_tech_text[:1000])
        skills_sim = cosine_similarity(skills_emb, tech_emb)
        scores.append((skills_sim, 0.3))

    # Weighted average, normalize from [-1,1] to [0,100]
    total_weight = sum(w for _, w in scores)
    weighted_sim = sum(sim * w for sim, w in scores) / total_weight
    return min(int(((weighted_sim + 1) / 2) * 100), 100)


# ─── Recruiter Impression ─────────────────────────────────────────────────────

def score_recruiter_impression(resume_text: str, parsed_resume: dict) -> int:
    """
    Recruiter Impression Score (0-100):
    - Strong action verbs in bullets     30 pts
    - Quantifiable metrics               35 pts
    - Appropriate length                 15 pts
    - Summary present                    10 pts
    - Weak phrase penalty               -15 pts max
    - Bullet length quality bonus        10 pts
    """
    score = 0
    experience = parsed_resume.get("experience", [])
    all_bullets: list[str] = []
    for exp in experience:
        all_bullets.extend(exp.get("bullets", []))

    if not all_bullets:
        return 30

    # Action verbs (30 pts)
    verb_count = sum(
        1 for b in all_bullets
        if any(b.lower().split()[0].rstrip(".,;:") in STRONG_ACTION_VERBS
               for _ in [None] if b.split())
    )
    verb_ratio = verb_count / len(all_bullets)
    score += int(verb_ratio * 30)

    # Metrics (35 pts)
    metric_count = sum(
        1 for b in all_bullets
        if any(re.search(p, b, re.IGNORECASE) for p in METRIC_PATTERNS)
    )
    metric_ratio = min(metric_count / max(len(all_bullets), 1), 1.0)
    score += int(metric_ratio * 35)

    # Resume length (15 pts)
    word_count = len(resume_text.split())
    if 400 <= word_count <= 900:
        score += 15
    elif 300 <= word_count <= 1200:
        score += 10
    elif word_count > 0:
        score += 5

    # Summary (10 pts)
    if parsed_resume.get("summary"):
        score += 10

    # Bullet quality bonus (10 pts) — reward longer, specific bullets
    avg_bullet_length = sum(len(b.split()) for b in all_bullets) / len(all_bullets)
    if avg_bullet_length >= 15:
        score += 10
    elif avg_bullet_length >= 10:
        score += 6
    elif avg_bullet_length >= 6:
        score += 3

    # Weak phrase penalty
    weak_count = sum(
        1 for b in all_bullets
        if any(wp in b.lower() for wp in WEAK_PHRASES)
    )
    if weak_count > 0:
        score = max(0, score - min(weak_count * 4, 15))

    return min(score, 100)


# ─── Project Relevance ────────────────────────────────────────────────────────

def score_project_relevance(
    parsed_resume: dict,
    job_tech_stack: list[str],
    job_required_skills: list[str],
) -> int:
    """Project Relevance Score (0-100) using normalized skill matching."""
    projects = parsed_resume.get("projects", [])

    if not projects:
        return 40
    if not job_tech_stack and not job_required_skills:
        return 60

    all_job_skills = job_tech_stack + job_required_skills
    job_norm = set(normalize_skills(all_job_skills))

    project_techs: list[str] = []
    for project in projects:
        project_techs.extend(project.get("tech_stack", []))
        # Extract skills from bullet text
        for bullet in project.get("bullets", []):
            for word in bullet.split():
                project_techs.append(word.strip(".,;:()[]"))

    proj_norm = set(normalize_skills(project_techs))

    if not job_norm:
        return 60

    # Direct + substring overlap
    matched: set[str] = set()
    for job_s in job_norm:
        if job_s in proj_norm:
            matched.add(job_s)
            continue
        for proj_s in proj_norm:
            if job_s in proj_s or proj_s in job_s:
                matched.add(job_s)
                break

    overlap = len(matched) / len(job_norm)
    score = int(overlap * 100)

    if len(projects) >= 3:
        score = min(score + 8, 100)
    if len(projects) >= 5:
        score = min(score + 5, 100)

    return min(max(score, 30), 100)


# ─── Overall Score ────────────────────────────────────────────────────────────

def compute_overall_score(ats: int, technical: int, semantic: int, recruiter: int, projects: int) -> int:
    weights = {"ats": 0.20, "technical": 0.25, "semantic": 0.25, "recruiter": 0.20, "projects": 0.10}
    overall = (
        ats * weights["ats"] +
        technical * weights["technical"] +
        semantic * weights["semantic"] +
        recruiter * weights["recruiter"] +
        projects * weights["projects"]
    )
    return min(int(overall), 100)


# ─── Missing Keywords ─────────────────────────────────────────────────────────

def find_missing_keywords(
    resume_text: str,
    job_required_skills: list[str],
    job_keywords: list[str],
    job_preferred_skills: list[str],
    parsed_resume: dict,
) -> list[dict]:
    """
    Find keywords missing from resume using normalized comparison.
    Returns list of {keyword, importance, context, category}.
    """
    resume_skills = parsed_resume.get("skills", [])
    resume_norm = set(normalize_skills(resume_skills))
    resume_lower = resume_text.lower()

    def _is_present(keyword: str) -> bool:
        norm = normalize_skill(keyword)
        if norm in resume_norm:
            return True
        kw_lower = keyword.lower()
        if kw_lower in resume_lower:
            return True
        # Partial: all words of multi-word skill present
        parts = norm.split()
        if len(parts) > 1 and all(p in resume_lower for p in parts):
            return True
        # Substring of any resume skill
        for rs in resume_norm:
            if norm in rs or rs in norm:
                return True
        return False

    seen_norm: set[str] = set()
    missing: list[dict] = []

    for skill in job_required_skills:
        if not _is_present(skill):
            norm = normalize_skill(skill)
            if norm not in seen_norm:
                seen_norm.add(norm)
                missing.append({
                    "keyword": display_skill(norm) if norm else skill,
                    "importance": "required",
                    "context": "Listed as required skill",
                    "category": "technical_skill",
                })

    for skill in job_preferred_skills:
        if not _is_present(skill):
            norm = normalize_skill(skill)
            if norm not in seen_norm:
                seen_norm.add(norm)
                missing.append({
                    "keyword": display_skill(norm) if norm else skill,
                    "importance": "preferred",
                    "context": "Listed as preferred qualification",
                    "category": "technical_skill",
                })

    for kw in job_keywords:
        if len(kw) <= 3:
            continue
        if not _is_present(kw):
            norm = normalize_skill(kw)
            if norm not in seen_norm:
                seen_norm.add(norm)
                missing.append({
                    "keyword": display_skill(norm) if norm else kw,
                    "importance": "nice_to_have",
                    "context": "Mentioned in job description",
                    "category": "keyword",
                })

    return missing[:20]


# ─── Main Entry Point ─────────────────────────────────────────────────────────

def compute_all_scores(
    resume_text: str,
    parsed_resume: dict,
    job_text: str,
    parsed_job: dict,
    resume_embedding: list[float],
    job_embedding: list[float],
) -> dict[str, Any]:
    """
    Compute all 5 ATS scores.
    Returns dict with scores, missing_keywords, and skill_overlap.
    """
    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])
    job_preferred = parsed_job.get("preferred_skills", [])
    job_keywords = parsed_job.get("keywords", [])

    ats = score_ats_compatibility(resume_text, parsed_resume)

    technical = score_technical_fit(resume_skills, job_required, job_tech, job_preferred)

    semantic = score_semantic_match(
        parsed_resume, parsed_job, resume_embedding, job_embedding
    )

    recruiter = score_recruiter_impression(resume_text, parsed_resume)

    projects = score_project_relevance(parsed_resume, job_tech, job_required)

    overall = compute_overall_score(ats, technical, semantic, recruiter, projects)

    missing_keywords = find_missing_keywords(
        resume_text, job_required, job_keywords, job_preferred, parsed_resume
    )

    # Normalized overlap for UI display
    matched, missing_set = skills_overlap(resume_skills, job_required + job_tech)

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
            "matched": [display_skill(s) for s in matched],
            "missing": [display_skill(s) for s in missing_set],
        },
    }
