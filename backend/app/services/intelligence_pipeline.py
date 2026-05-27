"""
INTELLIGENCE PIPELINE — JobSync Master Orchestrator
====================================================
Coordinates all AI intelligence systems in parallel.

This replaces the basic sequential analysis flow with a high-performance
parallel pipeline that runs all intelligence engines concurrently.

Pipeline flow:
  INPUT: resume_text + job_text + parsed data
      │
      ├─── [PARALLEL BATCH 1] ──────────────────────────────────────────
      │         branch_a: semantic_matcher.compute_semantic_match()
      │         branch_b: ats_engine.compute_all_scores()
      │         branch_c: skill_graph.analyze_skill_gaps()
      │         branch_d: cohort benchmark lookup
      │
      ├─── [SEQUENTIAL] ───────────────────────────────────────────────
      │         recruiter_fit.predict_recruiter_fit()  (uses branch outputs)
      │
      ├─── [PARALLEL BATCH 2] ──────────────────────────────────────────
      │         branch_e: ai_feedback.generate_recruiter_feedback()
      │         branch_f: ai_feedback.generate_bullet_rewrites()
      │
      └─── [STORE] ─────────────────────────────────────────────────────
                store analysis + embeddings + chunks
                record application event

Performance characteristics:
  Batch 1: ~1-3 seconds (embeddings + rule-based scoring)
  Sequential: ~0.1 seconds (in-memory computation)
  Batch 2: ~3-8 seconds (LLM calls, rate-limited)
  Total: ~5-12 seconds (parallel reduces from ~20s sequential)
"""
from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any
import structlog

from app.services.semantic_matcher import compute_semantic_match, SemanticMatchResult
from app.services.skill_graph import analyze_skill_gaps, serialize_gap_analysis
from app.services.recruiter_fit import predict_recruiter_fit, serialize_fit_result
from app.services.feedback_loop import get_cohort_percentile, _categorize_role
from app.services.ats_engine import compute_all_scores
from app.services.ai_feedback import generate_recruiter_feedback, generate_bullet_rewrites
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()


# ─── Output structures ────────────────────────────────────────────────────────

@dataclass
class IntelligenceResult:
    """Complete intelligence analysis output."""

    # Core scores (0-100)
    overall_score: int
    ats_score: int
    technical_fit_score: int
    semantic_match_score: int
    recruiter_impression_score: int
    project_relevance_score: int

    # NEW: Advanced intelligence scores
    interview_probability: float          # 0-100 estimated interview probability
    skill_gap_score: float                # 0-100 (higher = bigger gap)
    seniority_alignment_score: float      # 0-100

    # Tier classification
    recruiter_fit_tier: str               # "top_10" | "competitive" | "borderline" | "unlikely"
    confidence_level: str                 # "low" | "medium" | "high"

    # Semantic breakdown
    skills_vs_requirements: float
    experience_vs_responsibilities: float
    transferable_skills: list[dict]

    # Gap intelligence
    skill_gaps: list[dict]                # SkillGap serialized list
    learning_roadmap: dict                # LearningRoadmap serialized
    matched_skills: list[str]

    # Cohort context
    cohort_percentile: float              # 0-1 rank vs. peers

    # Traditional feedback
    missing_keywords: list[dict]
    strengths: list[dict]
    weaknesses: list[dict]
    improvement_suggestions: list[dict]
    rewritten_bullets: list[dict]
    recruiter_summary: str

    # Recruiter-fit details
    positive_signals: list[dict]
    negative_signals: list[dict]
    fit_explanation: str

    # Matched concepts
    matched_concepts: list[str]

    # Meta
    processing_time_ms: int
    model_type: str = "rule_based"


# ─── Main pipeline ────────────────────────────────────────────────────────────

async def run_intelligence_pipeline(
    resume_text: str,
    parsed_resume: dict,
    job_text: str,
    parsed_job: dict,
    user_id: str = "",
    career_stage: str = "mid",
    precomputed_resume_embedding: list[float] | None = None,
) -> IntelligenceResult:
    """
    Run the complete intelligence pipeline.

    All computationally independent steps run in parallel using asyncio.
    LLM calls (slowest) run concurrently with each other.
    """
    start_time = time.monotonic()

    # ── PARALLEL BATCH 1: Core scoring (non-LLM, fast) ─────────────────────────
    logger.info("Intelligence pipeline: starting batch 1 (core scoring)")

    (
        semantic_result,
        ats_result,
        gap_analysis,
    ) = await asyncio.gather(
        _compute_semantic(parsed_resume, parsed_job, job_text, precomputed_resume_embedding),
        _compute_ats(resume_text, parsed_resume, job_text, parsed_job, None, None),
        _compute_gaps(parsed_resume, parsed_job),
        return_exceptions=False,
    )

    # ── SEQUENTIAL: Recruiter-fit (depends on batch 1 outputs) ────────────────
    logger.info("Intelligence pipeline: computing recruiter fit")

    fit_result = predict_recruiter_fit(
        parsed_resume=parsed_resume,
        parsed_job=parsed_job,
        ats_scores=ats_result["scores"],
        semantic_match_score=semantic_result.overall_score,
        experience_role_fit=semantic_result.experience_vs_responsibilities,
    )

    # ── COHORT LOOKUP (async, with timeout) ───────────────────────────────────
    job_title = parsed_job.get("title", "Software Engineer")
    role_category = _categorize_role(job_title)

    try:
        cohort_pct = await asyncio.wait_for(
            get_cohort_percentile(
                overall_score=ats_result["scores"]["overall_score"],
                role=job_title,
                career_stage=career_stage,
            ),
            timeout=2.0
        )
    except asyncio.TimeoutError:
        cohort_pct = 0.5  # fallback if DB is slow

    # ── PARALLEL BATCH 2: LLM calls (slowest — run concurrently) ──────────────
    logger.info("Intelligence pipeline: starting batch 2 (LLM feedback)")

    scores = ats_result["scores"]
    missing_kw = ats_result["missing_keywords"]

    (feedback, rewrites) = await asyncio.gather(
        generate_recruiter_feedback(
            resume_text=resume_text,
            job_text=job_text,
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
            scores={
                **scores,
                "interview_probability": fit_result.interview_probability,
                "skill_gap_score": gap_analysis.overall_gap_score,
            },
            missing_keywords=missing_kw,
            skill_gap_analysis=serialize_gap_analysis(gap_analysis),
        ),
        generate_bullet_rewrites(
            parsed_resume=parsed_resume,
            parsed_job=parsed_job,
        ),
        return_exceptions=False,
    )

    # ── ASSEMBLE FINAL RESULT ──────────────────────────────────────────────────
    elapsed_ms = int((time.monotonic() - start_time) * 1000)

    gap_data = serialize_gap_analysis(gap_analysis)
    fit_data = serialize_fit_result(fit_result)

    # Blend semantic score into final overall
    # Existing weights: ats=0.20, technical=0.25, semantic=0.25, recruiter=0.20, projects=0.10
    # Enhanced: use our richer semantic score instead of basic cosine
    enhanced_semantic = int(semantic_result.overall_score)
    scores["semantic_match_score"] = enhanced_semantic

    # Recompute overall with enhanced semantic
    from app.services.ats_engine import compute_overall_score
    enhanced_overall = compute_overall_score(
        ats=scores["ats_score"],
        technical=scores["technical_fit_score"],
        semantic=enhanced_semantic,
        recruiter=scores["recruiter_impression_score"],
        projects=scores["project_relevance_score"],
    )

    logger.info(
        "Intelligence pipeline complete",
        overall=enhanced_overall,
        interview_prob=fit_result.interview_probability,
        gap_score=gap_analysis.overall_gap_score,
        elapsed_ms=elapsed_ms,
    )

    return IntelligenceResult(
        # Scores
        overall_score=enhanced_overall,
        ats_score=scores["ats_score"],
        technical_fit_score=scores["technical_fit_score"],
        semantic_match_score=enhanced_semantic,
        recruiter_impression_score=scores["recruiter_impression_score"],
        project_relevance_score=scores["project_relevance_score"],

        # Advanced
        interview_probability=fit_result.interview_probability,
        skill_gap_score=gap_analysis.overall_gap_score,
        seniority_alignment_score=fit_result.features.get("seniority_alignment", 0.5) * 100,

        # Tier
        recruiter_fit_tier=fit_result.tier,
        confidence_level=fit_result.confidence_level,

        # Semantic breakdown
        skills_vs_requirements=semantic_result.skills_vs_requirements,
        experience_vs_responsibilities=semantic_result.experience_vs_responsibilities,
        transferable_skills=semantic_result.found_transferable,

        # Gap intelligence
        skill_gaps=gap_data.get("missing_critical", []) + gap_data.get("missing_preferred", []),
        learning_roadmap=gap_data.get("roadmap", {}),
        matched_skills=gap_data.get("matched_skills", []),

        # Cohort
        cohort_percentile=cohort_pct,

        # Traditional feedback
        missing_keywords=missing_kw,
        strengths=feedback.get("strengths", []),
        weaknesses=feedback.get("weaknesses", []),
        improvement_suggestions=feedback.get("improvement_suggestions", []),
        rewritten_bullets=rewrites if isinstance(rewrites, list) else [],
        recruiter_summary=feedback.get("recruiter_summary", ""),

        # Recruiter-fit signals
        positive_signals=fit_result.positive_signals,
        negative_signals=fit_result.negative_signals,
        fit_explanation=fit_result.explanation,

        # Concepts
        matched_concepts=semantic_result.matched_concepts,

        processing_time_ms=elapsed_ms,
        model_type=feedback.get("_source", "rule_based"),
    )


# ─── Helper async wrappers (CPU-bound → thread pool) ──────────────────────────
#
# sentence-transformers encode() releases the GIL but is CPU-heavy.
# We wrap in asyncio.to_thread() so it doesn't block the event loop.
#

async def _compute_semantic(
    parsed_resume: dict,
    parsed_job: dict,
    job_text: str,
    precomputed_embedding: list[float] | None,
) -> SemanticMatchResult:
    """Run semantic matching in thread pool (CPU-bound)."""
    return await asyncio.to_thread(
        compute_semantic_match,
        parsed_resume,
        parsed_job,
        job_text,
        precomputed_embedding,
        None,
    )


async def _compute_ats(
    resume_text: str,
    parsed_resume: dict,
    job_text: str,
    parsed_job: dict,
    resume_embedding: list[float] | None,
    job_embedding: list[float] | None,
) -> dict:
    """Run ATS scoring in thread pool."""
    from app.services.embedding_service import embed_text

    if resume_embedding is None:
        resume_embedding = await asyncio.to_thread(embed_text, resume_text[:2000])
    if job_embedding is None:
        job_embedding = await asyncio.to_thread(embed_text, job_text[:2000])

    return await asyncio.to_thread(
        compute_all_scores,
        resume_text,
        parsed_resume,
        job_text,
        parsed_job,
        resume_embedding,
        job_embedding,
    )


async def _compute_gaps(
    parsed_resume: dict,
    parsed_job: dict,
) -> Any:
    """Run skill gap analysis in thread pool."""
    return await asyncio.to_thread(
        analyze_skill_gaps,
        parsed_resume,
        parsed_job,
        10,
    )


# ─── Serialization ────────────────────────────────────────────────────────────

def serialize_intelligence_result(result: IntelligenceResult) -> dict:
    """Convert to JSON-serializable dict for API response and DB storage."""
    return {
        "scores": {
            "overall_score": result.overall_score,
            "ats_score": result.ats_score,
            "technical_fit_score": result.technical_fit_score,
            "semantic_match_score": result.semantic_match_score,
            "recruiter_impression_score": result.recruiter_impression_score,
            "project_relevance_score": result.project_relevance_score,
        },
        "intelligence": {
            "interview_probability": result.interview_probability,
            "skill_gap_score": result.skill_gap_score,
            "seniority_alignment_score": result.seniority_alignment_score,
            "recruiter_fit_tier": result.recruiter_fit_tier,
            "confidence_level": result.confidence_level,
            "cohort_percentile": round(result.cohort_percentile * 100, 1),
            "fit_explanation": result.fit_explanation,
        },
        "semantic_breakdown": {
            "skills_vs_requirements": result.skills_vs_requirements,
            "experience_vs_responsibilities": result.experience_vs_responsibilities,
            "transferable_skills": result.transferable_skills,
            "matched_concepts": result.matched_concepts,
        },
        "skill_intelligence": {
            "matched_skills": result.matched_skills,
            "skill_gaps": result.skill_gaps[:8],  # top 8 for API response
            "learning_roadmap": result.learning_roadmap,
        },
        "recruiter_signals": {
            "positive": result.positive_signals,
            "negative": result.negative_signals,
        },
        "feedback": {
            "recruiter_summary": result.recruiter_summary,
            "strengths": result.strengths,
            "weaknesses": result.weaknesses,
            "improvement_suggestions": result.improvement_suggestions,
            "missing_keywords": result.missing_keywords,
            "rewritten_bullets": result.rewritten_bullets,
        },
        "meta": {
            "processing_time_ms": result.processing_time_ms,
            "model_type": result.model_type,
        },
    }
