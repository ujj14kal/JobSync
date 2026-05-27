"""
SEMANTIC MATCHER — JobSync Proprietary Intelligence Layer
=========================================================
Multi-layer chunked embedding system that understands meaning, not just keywords.

Architecture:
  Resume   → section chunks → section embeddings → weighted composite score
  Job JD   → section chunks → section embeddings → weighted composite score
  Matching → cross-section similarity matrix → final semantic score

Key upgrades over basic cosine similarity:
  1. Section-level matching (skills vs requirements, experience vs responsibilities)
  2. Transferable skill detection via skill graph traversal
  3. Explainable per-section scores (not a black box)
  4. Career narrative coherence scoring
  5. Seniority signal alignment
"""
from __future__ import annotations

import re
import hashlib
import math
from typing import Any
from dataclasses import dataclass, field
from functools import lru_cache

import numpy as np
from app.services.embedding_service import embed_text, embed_texts, cosine_similarity
import structlog

logger = structlog.get_logger()


# ─── Data structures ──────────────────────────────────────────────────────────

@dataclass
class ResumeChunks:
    summary: str = ""
    skills: str = ""
    experience: list[str] = field(default_factory=list)   # one string per job
    projects: str = ""
    education: str = ""
    certifications: str = ""

    def all_texts(self) -> list[tuple[str, str]]:
        """Returns (chunk_type, text) pairs for embedding."""
        items = []
        if self.summary:
            items.append(("summary", self.summary))
        if self.skills:
            items.append(("skills", self.skills))
        for i, exp in enumerate(self.experience):
            if exp.strip():
                items.append((f"experience_{i}", exp))
        if self.projects:
            items.append(("projects", self.projects))
        if self.education:
            items.append(("education", self.education))
        if self.certifications:
            items.append(("certifications", self.certifications))
        return items


@dataclass
class JobChunks:
    core_requirements: str = ""    # required skills + qualifications
    responsibilities: str = ""     # day-to-day work description
    preferred: str = ""            # nice-to-have
    culture: str = ""              # company description

    def all_texts(self) -> list[tuple[str, str]]:
        items = []
        if self.core_requirements:
            items.append(("core_requirements", self.core_requirements))
        if self.responsibilities:
            items.append(("responsibilities", self.responsibilities))
        if self.preferred:
            items.append(("preferred", self.preferred))
        if self.culture:
            items.append(("culture", self.culture))
        return items


@dataclass
class SemanticMatchResult:
    """Full output of the semantic matcher."""
    overall_score: float          # 0-100

    # Per-section scores (0-1)
    skills_vs_requirements: float = 0.0
    experience_vs_responsibilities: float = 0.0
    projects_vs_requirements: float = 0.0
    education_fit: float = 0.0

    # Transfer scores
    transferable_skills_boost: float = 0.0
    found_transferable: list[dict] = field(default_factory=list)  # [{from, to, weight}]

    # Full composite embedding (for pgvector storage)
    resume_embedding: list[float] = field(default_factory=list)
    job_embedding: list[float] = field(default_factory=list)

    # Explainability
    score_breakdown: dict[str, float] = field(default_factory=dict)
    matched_concepts: list[str] = field(default_factory=list)


# ─── Cross-section weight matrix ──────────────────────────────────────────────
#
#  RESUME_SECTION      × JOB_SECTION        = WEIGHT
#  ──────────────────────────────────────────────────
#  skills              × core_requirements  = 0.35  ← most important match
#  experience          × responsibilities   = 0.30
#  projects            × core_requirements  = 0.15
#  experience          × core_requirements  = 0.10  ← experience also vs reqs
#  education           × core_requirements  = 0.05
#  summary             × culture            = 0.05
#
MATCH_WEIGHTS: list[tuple[str, str, float]] = [
    ("skills",      "core_requirements",  0.35),
    ("experience",  "responsibilities",   0.30),
    ("projects",    "core_requirements",  0.15),
    ("experience",  "core_requirements",  0.10),
    ("education",   "core_requirements",  0.05),
    ("summary",     "culture",            0.05),
]


# ─── Chunkers ─────────────────────────────────────────────────────────────────

def chunk_resume(parsed_resume: dict) -> ResumeChunks:
    """
    Convert parsed resume dict into semantic chunks.
    Each chunk is prose-like text optimized for embedding.
    """
    chunks = ResumeChunks()

    # Skills chunk: "Candidate skills: Python, React, ..."
    skills = parsed_resume.get("skills", [])
    if skills:
        chunks.skills = "Technical skills and technologies: " + ", ".join(skills)

    # Summary chunk
    summary = parsed_resume.get("summary", "")
    if summary:
        chunks.summary = str(summary)

    # Experience chunks: one per job role
    for exp in parsed_resume.get("experience", []):
        title = exp.get("title", "")
        company = exp.get("company", "")
        bullets = exp.get("bullets", [])
        start = exp.get("start_date", "")
        end = exp.get("end_date", "Present")

        parts = []
        if title:
            parts.append(f"Role: {title}")
        if company:
            parts.append(f"at {company}")
        if start:
            parts.append(f"({start} - {end})")
        if bullets:
            parts.append("Responsibilities: " + ". ".join(bullets[:5]))

        text = " ".join(parts)
        if len(text) > 30:
            chunks.experience.append(text)

    # Projects chunk
    projects = parsed_resume.get("projects", [])
    if projects:
        proj_texts = []
        for proj in projects:
            name = proj.get("name", "")
            techs = proj.get("tech_stack", [])
            bullets = proj.get("bullets", [])
            desc = ". ".join(bullets[:2]) if bullets else ""
            tech_str = ", ".join(techs) if techs else ""
            proj_text = f"{name}"
            if tech_str:
                proj_text += f" using {tech_str}"
            if desc:
                proj_text += f": {desc}"
            proj_texts.append(proj_text)
        chunks.projects = "Projects: " + " | ".join(proj_texts)

    # Education chunk
    education = parsed_resume.get("education", [])
    if education:
        edu_texts = []
        for edu in education:
            degree = edu.get("degree", "")
            institution = edu.get("institution", "")
            if degree or institution:
                edu_texts.append(f"{degree} from {institution}".strip(" from"))
        chunks.education = "Education: " + ". ".join(edu_texts)

    # Certifications
    certs = parsed_resume.get("certifications", [])
    if certs:
        chunks.certifications = "Certifications: " + ", ".join(
            c.get("name", str(c)) if isinstance(c, dict) else str(c)
            for c in certs[:5]
        )

    return chunks


def chunk_job(parsed_job: dict, raw_jd_text: str = "") -> JobChunks:
    """
    Convert parsed job description into semantic chunks.
    """
    chunks = JobChunks()

    # Core requirements: required skills + qualifications
    req_skills = parsed_job.get("required_skills", [])
    quals = parsed_job.get("qualifications", [])
    tech_stack = parsed_job.get("tech_stack", [])
    exp_level = parsed_job.get("experience_level", "")
    title = parsed_job.get("title", "")

    reqs_parts = []
    if title:
        reqs_parts.append(f"Role: {title}")
    if exp_level:
        reqs_parts.append(f"Experience level: {exp_level}")
    if req_skills:
        reqs_parts.append("Required skills: " + ", ".join(req_skills))
    if tech_stack:
        reqs_parts.append("Tech stack: " + ", ".join(tech_stack))
    if quals:
        reqs_parts.append("Qualifications: " + ". ".join(quals[:5]))
    chunks.core_requirements = " | ".join(reqs_parts)

    # Responsibilities
    responsibilities = parsed_job.get("responsibilities", [])
    if responsibilities:
        chunks.responsibilities = "Responsibilities: " + ". ".join(responsibilities[:6])
    elif raw_jd_text:
        # Fallback: use middle portion of JD as responsibilities proxy
        words = raw_jd_text.split()
        mid_start = len(words) // 4
        mid_end = 3 * len(words) // 4
        chunks.responsibilities = " ".join(words[mid_start:mid_end])[:600]

    # Preferred / nice-to-have
    preferred = parsed_job.get("preferred_skills", [])
    nice_to_have = parsed_job.get("nice_to_have", [])
    all_preferred = preferred + nice_to_have
    if all_preferred:
        chunks.preferred = "Preferred qualifications: " + ", ".join(all_preferred)

    # Culture / company
    company = parsed_job.get("company", "")
    company_desc = parsed_job.get("company_description", "")
    if company_desc:
        chunks.culture = f"{company}: {company_desc}"
    elif company:
        chunks.culture = f"Company: {company}"

    return chunks


# ─── Embedding cache (content-hash keyed) ─────────────────────────────────────

_embedding_cache: dict[str, list[float]] = {}


def _cached_embed(text: str) -> list[float]:
    """Embed with in-memory content-hash cache."""
    if not text or not text.strip():
        return [0.0] * 384

    key = hashlib.md5(text.encode()).hexdigest()
    if key in _embedding_cache:
        return _embedding_cache[key]

    embedding = embed_text(text)
    # Keep cache bounded (LRU approximation: evict oldest when >2000 entries)
    if len(_embedding_cache) > 2000:
        oldest_key = next(iter(_embedding_cache))
        del _embedding_cache[oldest_key]

    _embedding_cache[key] = embedding
    return embedding


def _batch_embed_chunks(
    chunk_items: list[tuple[str, str]]
) -> dict[str, list[float]]:
    """Batch embed (chunk_type, text) pairs. Returns {chunk_type: embedding}."""
    if not chunk_items:
        return {}

    # Deduplicate texts before embedding
    unique_texts = list({text for _, text in chunk_items if text.strip()})
    if not unique_texts:
        return {}

    all_embeddings = embed_texts(unique_texts)
    text_to_emb = dict(zip(unique_texts, all_embeddings))

    result = {}
    for chunk_type, text in chunk_items:
        if text.strip():
            result[chunk_type] = text_to_emb.get(text, [0.0] * 384)

    return result


# ─── Composite embedding (weighted mean pooling) ──────────────────────────────

# How much each resume section contributes to the composite vector
RESUME_SECTION_WEIGHTS = {
    "skills":        0.35,
    "experience":    0.35,   # shared across all experience chunks
    "projects":      0.15,
    "summary":       0.08,
    "education":     0.05,
    "certifications": 0.02,
}


def build_composite_embedding(
    chunk_embeddings: dict[str, list[float]]
) -> list[float]:
    """
    Weighted mean pooling across all section embeddings.
    Experience chunks (experience_0, experience_1, ...) share the experience budget.
    """
    experience_keys = [k for k in chunk_embeddings if k.startswith("experience_")]
    n_exp = len(experience_keys)

    total_weight = 0.0
    composite = np.zeros(384)

    for chunk_type, embedding in chunk_embeddings.items():
        emb = np.array(embedding)
        if emb.sum() == 0:
            continue

        if chunk_type.startswith("experience_"):
            # Split experience weight evenly across all job entries
            w = RESUME_SECTION_WEIGHTS["experience"] / max(n_exp, 1)
        else:
            w = RESUME_SECTION_WEIGHTS.get(chunk_type, 0.01)

        composite += w * emb
        total_weight += w

    if total_weight > 0:
        composite /= total_weight

    # Normalize to unit sphere
    norm = np.linalg.norm(composite)
    if norm > 0:
        composite /= norm

    return composite.tolist()


# ─── Cross-section similarity computation ─────────────────────────────────────

def _get_base_chunk_type(chunk_type: str) -> str:
    """experience_0 → experience, skills → skills"""
    return chunk_type.split("_")[0] if "_" in chunk_type else chunk_type


def compute_cross_section_score(
    resume_embeddings: dict[str, list[float]],
    job_embeddings: dict[str, list[float]],
) -> dict[str, float]:
    """
    Apply the MATCH_WEIGHTS matrix.
    For experience chunks (0..N), take the max similarity across all experience entries.
    Returns per-pair similarity + overall weighted score.
    """
    scores: dict[str, float] = {}

    # Pre-group resume embeddings by base type
    grouped_resume: dict[str, list[list[float]]] = {}
    for k, v in resume_embeddings.items():
        base = _get_base_chunk_type(k)
        grouped_resume.setdefault(base, []).append(v)

    total_score = 0.0
    used_weight = 0.0

    for resume_type, job_type, weight in MATCH_WEIGHTS:
        resume_vecs = grouped_resume.get(resume_type, [])
        job_vec = job_embeddings.get(job_type)

        if not resume_vecs or job_vec is None:
            continue

        # Take maximum similarity across experience entries (best-match semantics)
        sims = [cosine_similarity(rv, job_vec) for rv in resume_vecs]
        best_sim = max(sims)

        # Normalize from [-1, 1] → [0, 1]
        normalized = (best_sim + 1) / 2.0
        key = f"{resume_type}_vs_{job_type}"
        scores[key] = round(normalized * 100, 1)

        total_score += weight * normalized
        used_weight += weight

    # Rescale if not all pairs were present
    if used_weight > 0 and used_weight < 1.0:
        total_score /= used_weight

    scores["overall"] = round(min(total_score, 1.0) * 100, 1)
    return scores


# ─── Transferable skill detection ─────────────────────────────────────────────
#
# We embed known "transfer pairs" and check if the gap can be bridged.
# This is intentionally SEPARATE from the skill graph (skill_graph.py handles
# structured graph traversal; here we do embedding-space proximity detection).

def detect_transferable_skills(
    resume_skills: list[str],
    missing_skills: list[str],
    similarity_threshold: float = 0.72,
) -> tuple[float, list[dict]]:
    """
    For each missing skill, check if any resume skill is semantically close.
    Returns (boost_score 0-10, found_transfers list).

    boost_score feeds into the final semantic_score as a small additive bonus.
    It does NOT inflate scores dramatically — max +10 points.
    """
    if not resume_skills or not missing_skills:
        return 0.0, []

    # Limit to avoid embedding 100s of skills
    resume_sample = resume_skills[:25]
    missing_sample = missing_skills[:15]

    try:
        all_texts = resume_sample + missing_sample
        all_embeddings = embed_texts(all_texts)

        resume_embs = all_embeddings[: len(resume_sample)]
        missing_embs = all_embeddings[len(resume_sample):]

        found_transfers = []
        total_boost = 0.0

        for m_idx, missing_skill in enumerate(missing_sample):
            best_sim = 0.0
            best_resume_skill = ""

            for r_idx, resume_skill in enumerate(resume_sample):
                sim = cosine_similarity(resume_embs[r_idx], missing_embs[m_idx])
                if sim > best_sim:
                    best_sim = sim
                    best_resume_skill = resume_skill

            if best_sim >= similarity_threshold:
                transfer_weight = (best_sim - similarity_threshold) / (1.0 - similarity_threshold)
                found_transfers.append({
                    "from_skill": best_resume_skill,
                    "to_skill": missing_skill,
                    "similarity": round(best_sim, 3),
                    "transfer_credit": round(transfer_weight * 100, 1),
                })
                total_boost += transfer_weight * 3.0  # max ~3 pts per transfer

        capped_boost = min(total_boost, 10.0)
        return round(capped_boost, 2), found_transfers

    except Exception as e:
        logger.warning("Transferable skill detection failed", error=str(e))
        return 0.0, []


# ─── Seniority alignment scoring ──────────────────────────────────────────────

SENIORITY_LEVELS = {
    "intern": 0, "junior": 1, "associate": 1, "entry": 1,
    "mid": 2, "mid-level": 2, "ii": 2, "2": 2,
    "senior": 3, "sr": 3, "lead": 3, "iii": 3,
    "staff": 4, "principal": 4, "architect": 4,
    "director": 5, "vp": 5, "head": 5,
    "cto": 6, "ceo": 6, "founder": 6,
}


def score_seniority_alignment(parsed_resume: dict, parsed_job: dict) -> float:
    """
    Returns 0-100 score for how well candidate seniority matches job level.
    Undershooting → penalty. Overshooting → smaller penalty.
    """
    # Estimate candidate seniority from titles
    candidate_level = 0
    for exp in parsed_resume.get("experience", []):
        title_lower = exp.get("title", "").lower()
        for keyword, level in SENIORITY_LEVELS.items():
            if keyword in title_lower:
                candidate_level = max(candidate_level, level)
                break

    # Job required level
    job_level_text = parsed_job.get("experience_level", "").lower()
    job_level = 2  # default: mid
    for keyword, level in SENIORITY_LEVELS.items():
        if keyword in job_level_text:
            job_level = level
            break

    delta = candidate_level - job_level
    if delta == 0:
        return 100.0   # perfect match
    elif delta == 1:
        return 85.0    # slightly overqualified — recruiters still like this
    elif delta == -1:
        return 70.0    # slightly underqualified — depends on other factors
    elif delta == 2:
        return 60.0    # significantly overqualified
    elif delta == -2:
        return 45.0    # significantly underqualified
    else:
        return 30.0    # major mismatch


# ─── Master matching function ──────────────────────────────────────────────────

def compute_semantic_match(
    parsed_resume: dict,
    parsed_job: dict,
    raw_jd_text: str = "",
    precomputed_resume_embedding: list[float] | None = None,
    precomputed_job_embedding: list[float] | None = None,
) -> SemanticMatchResult:
    """
    Full semantic matching pipeline.

    Returns SemanticMatchResult with:
      - overall_score (0-100)
      - per-section breakdown
      - transferable skill detections
      - composite embeddings for storage

    Uses precomputed embeddings if provided (avoids re-embedding).
    """
    # Step 1: Build chunks
    resume_chunks = chunk_resume(parsed_resume)
    job_chunks = chunk_job(parsed_job, raw_jd_text)

    # Step 2: Embed all chunks in parallel batches
    resume_chunk_items = resume_chunks.all_texts()
    job_chunk_items = job_chunks.all_texts()

    resume_embeddings = _batch_embed_chunks(resume_chunk_items)
    job_embeddings = _batch_embed_chunks(job_chunk_items)

    # Step 3: Build composite embeddings
    resume_composite = (
        precomputed_resume_embedding
        if precomputed_resume_embedding
        else build_composite_embedding(resume_embeddings)
    )
    job_composite = (
        precomputed_job_embedding
        if precomputed_job_embedding
        else build_composite_embedding(job_embeddings)
    )

    # Step 4: Cross-section similarity matrix
    cross_scores = compute_cross_section_score(resume_embeddings, job_embeddings)
    base_semantic = cross_scores.get("overall", 50.0)

    # Step 5: Transferable skill detection
    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])

    # Skills the candidate is missing
    resume_skills_lower = {s.lower() for s in resume_skills}
    missing_skills = [
        s for s in (job_required + job_tech)
        if s.lower() not in resume_skills_lower
    ]

    transfer_boost, found_transfers = detect_transferable_skills(
        resume_skills, missing_skills
    )

    # Step 6: Seniority alignment
    seniority_score = score_seniority_alignment(parsed_resume, parsed_job)
    seniority_bonus = (seniority_score - 50) * 0.1  # -5 to +5 range contribution

    # Step 7: Final score assembly
    # Base: cross-section weighted semantic
    # Adjust: +transfer boost (max +10), +/-seniority contribution
    final_score = base_semantic + transfer_boost + seniority_bonus
    final_score = max(0.0, min(100.0, final_score))

    # Extract per-pair highlights
    skills_vs_reqs = cross_scores.get("skills_vs_core_requirements", 0.0) / 100
    exp_vs_resp = cross_scores.get("experience_vs_responsibilities", 0.0) / 100
    proj_vs_reqs = cross_scores.get("projects_vs_core_requirements", 0.0) / 100
    edu_fit = cross_scores.get("education_vs_core_requirements", 0.0) / 100

    # Matched concepts (top overlap terms for explainability)
    matched_concepts = _find_matched_concepts(
        resume_chunks.skills + " " + " ".join(resume_chunks.experience),
        job_chunks.core_requirements,
    )

    return SemanticMatchResult(
        overall_score=round(final_score, 1),
        skills_vs_requirements=round(skills_vs_reqs * 100, 1),
        experience_vs_responsibilities=round(exp_vs_resp * 100, 1),
        projects_vs_requirements=round(proj_vs_reqs * 100, 1),
        education_fit=round(edu_fit * 100, 1),
        transferable_skills_boost=transfer_boost,
        found_transferable=found_transfers,
        resume_embedding=resume_composite,
        job_embedding=job_composite,
        score_breakdown=cross_scores,
        matched_concepts=matched_concepts,
    )


# ─── Concept extraction (cheap keyword overlap for explainability) ─────────────

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "have", "has",
    "be", "been", "as", "this", "that", "we", "you", "our", "your", "will",
    "experience", "skills", "required", "role", "position", "team",
    "work", "working", "candidate", "must", "should", "ability", "strong",
}


def _find_matched_concepts(resume_text: str, job_text: str) -> list[str]:
    """
    Find multi-word and single-word concepts that appear in both texts.
    Used for the 'why this matched' explainability panel.
    """
    def tokenize(text: str) -> set[str]:
        words = re.findall(r"[a-z][a-z0-9+.#\-]+", text.lower())
        return {w for w in words if w not in _STOPWORDS and len(w) > 2}

    resume_tokens = tokenize(resume_text)
    job_tokens = tokenize(job_text)
    common = resume_tokens & job_tokens

    # Also find 2-gram overlaps
    def bigrams(text: str) -> set[str]:
        words = [w for w in re.findall(r"[a-z][a-z0-9+.#\-]+", text.lower())
                 if w not in _STOPWORDS and len(w) > 2]
        return {f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)}

    resume_2g = bigrams(resume_text)
    job_2g = bigrams(job_text)
    common_2g = resume_2g & job_2g

    # Prefer bigrams (more specific) then unigrams
    all_matched = list(common_2g)[:5] + list(common - {w for bg in common_2g for w in bg.split()})[:5]
    return sorted(all_matched, key=len, reverse=True)[:10]
