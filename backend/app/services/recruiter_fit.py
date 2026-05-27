"""
RECRUITER-FIT PREDICTION ENGINE — JobSync Intelligence Layer
=============================================================
Predicts: probability of being selected for an interview.

Phase architecture (cold-start → ML evolution):
  Phase 1 (now):     Feature engineering + sigmoid regression (rule-based proxy)
  Phase 2 (100+ labels): LogisticRegression trained on outcome data
  Phase 3 (1k+ labels):  XGBoost / LightGBM with full feature set

This module handles:
  1. Feature extraction from parsed resume + scores
  2. Cold-start scoring (deterministic, explainable)
  3. Model serialization / loading (for Phase 2+)
  4. Score explanation (which factors help / hurt probability)

Key insight: recruiter_fit is DIFFERENT from ATS score.
  ATS score = "does your resume match the keywords?"
  Recruiter fit = "would a human recruiter shortlist you?"

These diverge because:
  - Over-qualified candidates get filtered (ATS high, fit lower)
  - Amazing projects with wrong keywords (ATS lower, fit higher)
  - Startup experience at FAANG role (ATS ok, fit depends on pattern)
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any
import structlog

logger = structlog.get_logger()


# ─── Feature definitions ──────────────────────────────────────────────────────

@dataclass
class RecruiterFitFeatures:
    """
    Complete feature vector for recruiter-fit prediction.
    All features are normalized to [0, 1] range for consistent weighting.
    """
    # ── Structural signals ────────────────────────────────────────────────────
    years_of_experience: float = 0.0      # raw years, pre-normalization
    education_tier: float = 0.0           # 0.0=none, 0.33=assoc, 0.67=bachelor, 1.0=masters+
    career_progression: float = 0.5       # 0.0=descending, 0.5=flat, 1.0=ascending
    company_tier_avg: float = 0.5         # 0.0=unknown, 1.0=FAANG/Tier1
    has_relevant_projects: float = 0.0    # 0 or 1
    certification_value: float = 0.0      # 0-1 (count × relevance)
    career_gaps: float = 1.0              # 1.0=no gaps, lower if significant gaps

    # ── Quality signals ───────────────────────────────────────────────────────
    metric_density: float = 0.0           # % of bullets with quantified metrics
    verb_strength: float = 0.0            # % of bullets with strong action verbs
    skill_overlap_ratio: float = 0.0      # matched / required skills
    keyword_coverage: float = 0.0         # % job keywords present in resume

    # ── Semantic signals ──────────────────────────────────────────────────────
    semantic_similarity: float = 0.0      # embedding cosine sim (0-1)
    experience_role_fit: float = 0.0      # how well experience matches responsibilities
    seniority_alignment: float = 0.5      # candidate level vs job level

    # ── Contextual signals (filled after enough data) ─────────────────────────
    cohort_percentile: float = 0.5        # where this profile ranks vs. similar applicants
    keyword_success_rate: float = 0.5     # historical success rate of key keywords

    def to_vector(self) -> list[float]:
        """Normalized feature vector for model inference."""
        return [
            min(self.years_of_experience / 15.0, 1.0),  # cap at 15 years
            self.education_tier,
            self.career_progression,
            self.company_tier_avg,
            self.has_relevant_projects,
            self.certification_value,
            self.career_gaps,
            self.metric_density,
            self.verb_strength,
            self.skill_overlap_ratio,
            self.keyword_coverage,
            self.semantic_similarity,
            self.experience_role_fit,
            self.seniority_alignment,
            self.cohort_percentile,
            self.keyword_success_rate,
        ]


@dataclass
class RecruiterFitResult:
    """Full output of the recruiter-fit predictor."""
    interview_probability: float    # 0-100 (probability as percentage)
    confidence_level: str           # "low" | "medium" | "high"
    tier: str                       # "top_10" | "competitive" | "borderline" | "unlikely"
    score: float                    # 0-100 composite fit score

    # What's helping / hurting
    positive_signals: list[dict]    # [{factor, description, impact}]
    negative_signals: list[dict]    # [{factor, description, impact}]

    # Feature-level breakdown
    features: dict[str, float]
    model_type: str                 # "rule_based" | "logistic" | "xgboost"
    explanation: str                # 1-sentence summary


# ─── Company tier lookup ──────────────────────────────────────────────────────

TIER_1_COMPANIES = {
    "google", "meta", "facebook", "amazon", "apple", "microsoft", "netflix",
    "openai", "anthropic", "deepmind", "tesla", "nvidia", "stripe", "spacex",
    "airbnb", "uber", "lyft", "palantir", "databricks", "snowflake",
    "twilio", "coinbase", "robinhood", "doordash", "instacart",
}

TIER_2_COMPANIES = {
    "adobe", "salesforce", "oracle", "ibm", "intel", "qualcomm", "cisco",
    "linkedin", "twitter", "x", "snap", "pinterest", "dropbox", "box",
    "slack", "zoom", "zendesk", "atlassian", "mongodb", "elastic",
    "datadog", "pagerduty", "okta", "cloudflare", "fastly",
}

KNOWN_STARTUPS = {
    "ycombinator", "yc", "series a", "series b", "techcrunch", "startup",
}


def _estimate_company_tier(company_name: str) -> float:
    """Return 0-1 company tier score."""
    if not company_name:
        return 0.5
    cn = company_name.lower()
    if any(t in cn for t in TIER_1_COMPANIES):
        return 1.0
    if any(t in cn for t in TIER_2_COMPANIES):
        return 0.75
    if any(t in cn for t in KNOWN_STARTUPS):
        return 0.60
    # Heuristic: longer company names tend to be more established
    if len(company_name) > 5:
        return 0.50
    return 0.40


# ─── Feature extractors ───────────────────────────────────────────────────────

def extract_years_of_experience(parsed_resume: dict) -> float:
    """Estimate total years of professional experience."""
    from datetime import datetime

    current_year = datetime.now().year
    total_months = 0

    for exp in parsed_resume.get("experience", []):
        start_str = exp.get("start_date", "")
        end_str = exp.get("end_date", "Present")

        # Extract years
        start_year_match = re.search(r"\b(20\d\d|19\d\d)\b", start_str)
        if not start_year_match:
            continue

        start_year = int(start_year_match.group(1))

        if re.search(r"present|current|now", end_str, re.IGNORECASE) or not end_str:
            end_year = current_year
        else:
            end_year_match = re.search(r"\b(20\d\d|19\d\d)\b", end_str)
            end_year = int(end_year_match.group(1)) if end_year_match else current_year

        duration_years = max(0, end_year - start_year)
        total_months += duration_years * 12

    return round(total_months / 12, 1)


def extract_education_tier(parsed_resume: dict) -> float:
    """0.0=none, 0.33=associate/diploma, 0.67=bachelor, 1.0=masters/phd"""
    education = parsed_resume.get("education", [])
    best = 0.0
    for edu in education:
        degree = edu.get("degree", "").lower()
        if re.search(r"ph\.?d|doctorate|phd", degree):
            best = max(best, 1.0)
        elif re.search(r"master|mba|m\.s|msc|m\.tech", degree):
            best = max(best, 0.90)
        elif re.search(r"bachelor|b\.s|b\.e|b\.tech|b\.sc|b\.a\b", degree):
            best = max(best, 0.67)
        elif re.search(r"associate|diploma|a\.s", degree):
            best = max(best, 0.33)
    return best


def extract_career_progression(parsed_resume: dict) -> float:
    """
    0.0=descending seniority, 0.5=flat/lateral, 1.0=ascending seniority.
    Recruiters love upward trajectory.
    """
    SENIORITY_LEVELS = {
        "intern": 0, "trainee": 0, "junior": 1, "associate": 1, "entry": 1,
        "": 2,  # no keyword = mid level assumed
        "senior": 3, "sr": 3, "lead": 3, "principal": 4,
        "staff": 4, "architect": 4, "manager": 3,
        "director": 5, "vp": 6, "head": 5, "cto": 7, "founder": 7,
    }

    experience = parsed_resume.get("experience", [])
    if len(experience) < 2:
        return 0.5  # Can't determine trajectory

    levels = []
    for exp in experience:
        title = exp.get("title", "").lower()
        best_level = 2  # default mid
        for keyword, level in SENIORITY_LEVELS.items():
            if keyword and keyword in title:
                best_level = max(best_level, level)
        levels.append(best_level)

    if not levels:
        return 0.5

    # Check if generally ascending (most recent first in typical resume order)
    # Higher index = earlier role
    if len(levels) >= 2:
        delta = levels[0] - levels[-1]  # most recent - oldest
        if delta > 0:
            return min(0.5 + (delta / 6) * 0.5, 1.0)  # ascending
        elif delta < 0:
            return max(0.5 + (delta / 6) * 0.5, 0.0)  # descending
    return 0.5


def extract_company_tier(parsed_resume: dict) -> float:
    """Average company tier across all experience entries."""
    experience = parsed_resume.get("experience", [])
    if not experience:
        return 0.4

    tiers = [_estimate_company_tier(exp.get("company", "")) for exp in experience]
    # Weight recent experience more heavily
    weights = [1.0 / (i + 1) for i in range(len(tiers))]
    total_weight = sum(weights)
    weighted_avg = sum(t * w for t, w in zip(tiers, weights)) / total_weight
    return round(weighted_avg, 3)


def extract_metric_density(parsed_resume: dict) -> float:
    """Fraction of experience bullets that contain quantified metrics."""
    METRIC_PATTERNS = [
        r"\d+%", r"\$[\d,]+", r"\d+[kKmMbB]", r"\d+x",
        r"\d+\s*(users|customers|engineers|teams|services|requests)",
        r"\d+\s*(million|billion|thousand)",
        r"(reduce|increase|improve)d?\s+\w+\s+by\s+\d+",
    ]

    all_bullets = []
    for exp in parsed_resume.get("experience", []):
        all_bullets.extend(exp.get("bullets", []))

    if not all_bullets:
        return 0.0

    count = sum(
        1 for b in all_bullets
        if any(re.search(p, b, re.IGNORECASE) for p in METRIC_PATTERNS)
    )
    return round(count / len(all_bullets), 3)


def extract_verb_strength(parsed_resume: dict) -> float:
    """Fraction of bullets starting with strong action verbs."""
    STRONG_VERBS = {
        "developed", "built", "designed", "architected", "led", "managed",
        "implemented", "optimized", "reduced", "improved", "increased", "scaled",
        "deployed", "automated", "created", "launched", "delivered", "drove",
        "established", "integrated", "migrated", "refactored", "streamlined",
        "collaborated", "mentored", "owned", "shipped", "engineered", "founded",
        "spearheaded", "pioneered", "transformed", "accelerated", "generated",
    }

    all_bullets = []
    for exp in parsed_resume.get("experience", []):
        all_bullets.extend(exp.get("bullets", []))

    if not all_bullets:
        return 0.0

    strong_count = sum(
        1 for b in all_bullets
        if any(b.lower().startswith(v) for v in STRONG_VERBS)
    )
    return round(strong_count / len(all_bullets), 3)


# ─── Cold-start scoring model (Phase 1) ───────────────────────────────────────
#
#  Weights tuned by reasoning about what recruiters actually look for.
#  These will be REPLACED by learned weights once outcome data accumulates.
#
COLD_START_WEIGHTS = {
    "semantic_similarity":    0.198,  # semantic match is the strongest signal
    "skill_overlap_ratio":    0.168,  # required skills coverage
    "metric_density":         0.119,  # quantification is a strong recruiter signal
    "years_of_experience":    0.099,  # experience level match
    "seniority_alignment":    0.089,  # level fit
    "keyword_coverage":       0.069,
    "verb_strength":          0.069,
    "career_progression":     0.059,
    "company_tier_avg":       0.050,
    "education_tier":         0.030,
    "has_relevant_projects":  0.020,  # extra signal for junior/mid candidates
    "certification_value":    0.010,
    "career_gaps":            0.010,
    "cohort_percentile":      0.005,
    "keyword_success_rate":   0.005,
    "experience_role_fit":    0.000,  # not used in cold start (set externally)
}

assert abs(sum(COLD_START_WEIGHTS.values()) - 1.0) < 0.001, f"Weights must sum to 1.0, got {sum(COLD_START_WEIGHTS.values()):.4f}"


def _sigmoid(x: float) -> float:
    """Sigmoid function for probability mapping."""
    return 1.0 / (1.0 + math.exp(-x))


def score_with_cold_start(features: RecruiterFitFeatures) -> float:
    """
    Phase 1 scoring: deterministic weighted sum → sigmoid → probability.

    Raw score is normalized such that:
      - "average" candidate (all features = 0.5) → ~50% probability
      - Strong candidate (most features ≥ 0.75) → 70-80% probability
      - Weak candidate (most features ≤ 0.25) → 20-30% probability
    """
    feature_dict = {
        "semantic_similarity":    features.semantic_similarity,
        "skill_overlap_ratio":    features.skill_overlap_ratio,
        "metric_density":         features.metric_density,
        "years_of_experience":    min(features.years_of_experience / 15.0, 1.0),
        "seniority_alignment":    features.seniority_alignment,
        "keyword_coverage":       features.keyword_coverage,
        "verb_strength":          features.verb_strength,
        "career_progression":     features.career_progression,
        "company_tier_avg":       features.company_tier_avg,
        "education_tier":         features.education_tier,
        "has_relevant_projects":  features.has_relevant_projects,
        "certification_value":    features.certification_value,
        "career_gaps":            features.career_gaps,
        "cohort_percentile":      features.cohort_percentile,
        "keyword_success_rate":   features.keyword_success_rate,
        "experience_role_fit":    features.experience_role_fit,
    }

    # Weighted sum (0-1 range)
    raw_score = sum(
        COLD_START_WEIGHTS[k] * v
        for k, v in feature_dict.items()
    )

    # Map to probability using sigmoid centered at 0.5
    # This gives a more natural probability distribution
    # raw_score=0.5 → 50%, raw_score=0.7 → 70%, raw_score=0.3 → 30%
    # (Linear passthrough since we're already in [0,1])
    return raw_score


def _classify_tier(probability: float) -> str:
    if probability >= 75:
        return "top_10"        # Top tier — strong shortlist candidate
    elif probability >= 55:
        return "competitive"   # Competitive — likely to be considered
    elif probability >= 35:
        return "borderline"    # Borderline — needs targeted improvements
    else:
        return "unlikely"      # Significant gaps to address


def _classify_confidence(features: RecruiterFitFeatures) -> str:
    """Confidence based on data completeness."""
    completeness = sum([
        1 if features.years_of_experience > 0 else 0,
        1 if features.education_tier > 0 else 0,
        1 if features.metric_density > 0 else 0,
        1 if features.skill_overlap_ratio > 0 else 0,
        1 if features.semantic_similarity > 0 else 0,
    ])
    if completeness >= 4:
        return "high"
    elif completeness >= 2:
        return "medium"
    return "low"


def _generate_signals(
    features: RecruiterFitFeatures,
    probability: float,
) -> tuple[list[dict], list[dict]]:
    """Generate positive and negative signal explanations."""
    positive = []
    negative = []

    # Semantic similarity
    if features.semantic_similarity >= 0.70:
        positive.append({
            "factor": "Semantic Match",
            "description": f"Your experience strongly aligns with job requirements ({int(features.semantic_similarity * 100)}% semantic match)",
            "impact": "high",
        })
    elif features.semantic_similarity < 0.45:
        negative.append({
            "factor": "Semantic Mismatch",
            "description": "Your background doesn't closely align with what this role needs",
            "impact": "high",
        })

    # Skill coverage
    if features.skill_overlap_ratio >= 0.75:
        positive.append({
            "factor": "Strong Skill Coverage",
            "description": f"You have {int(features.skill_overlap_ratio * 100)}% of the required skills",
            "impact": "high",
        })
    elif features.skill_overlap_ratio < 0.40:
        negative.append({
            "factor": "Skill Gaps",
            "description": f"Only {int(features.skill_overlap_ratio * 100)}% of required skills detected",
            "impact": "high",
        })

    # Metrics
    if features.metric_density >= 0.60:
        positive.append({
            "factor": "Quantified Impact",
            "description": f"{int(features.metric_density * 100)}% of bullets include numbers — recruiters love this",
            "impact": "medium",
        })
    elif features.metric_density < 0.25:
        negative.append({
            "factor": "Missing Metrics",
            "description": "Few quantified results — add numbers to show real impact",
            "impact": "medium",
        })

    # Career progression
    if features.career_progression >= 0.75:
        positive.append({
            "factor": "Career Trajectory",
            "description": "Your career shows clear upward progression",
            "impact": "medium",
        })
    elif features.career_progression < 0.35:
        negative.append({
            "factor": "Career Direction",
            "description": "Unclear career progression — consider framing your growth story",
            "impact": "low",
        })

    # Company tier
    if features.company_tier_avg >= 0.75:
        positive.append({
            "factor": "Strong Employer Brand",
            "description": "Tier-1 company experience adds credibility",
            "impact": "medium",
        })

    # Seniority alignment
    if features.seniority_alignment >= 0.80:
        positive.append({
            "factor": "Level Match",
            "description": "Your seniority level matches what the role requires",
            "impact": "medium",
        })
    elif features.seniority_alignment < 0.45:
        negative.append({
            "factor": "Level Mismatch",
            "description": "Your experience level doesn't match this role's requirements",
            "impact": "medium",
        })

    # Projects
    if features.has_relevant_projects >= 0.8:
        positive.append({
            "factor": "Relevant Projects",
            "description": "Side projects/portfolio strengthen your technical credibility",
            "impact": "low",
        })

    return positive[:4], negative[:4]


# ─── Main prediction function ─────────────────────────────────────────────────

def predict_recruiter_fit(
    parsed_resume: dict,
    parsed_job: dict,
    ats_scores: dict,
    semantic_match_score: float = 0.5,
    experience_role_fit: float = 0.5,
) -> RecruiterFitResult:
    """
    Main entry point: given resume + job + ATS scores, predict interview probability.

    Returns RecruiterFitResult with:
      - interview_probability (0-100)
      - tier classification
      - positive/negative signals
      - feature breakdown
    """
    # ── Extract features ────────────────────────────────────────────────────────
    yoe = extract_years_of_experience(parsed_resume)
    edu_tier = extract_education_tier(parsed_resume)
    career_prog = extract_career_progression(parsed_resume)
    company_tier = extract_company_tier(parsed_resume)
    metric_density = extract_metric_density(parsed_resume)
    verb_strength = extract_verb_strength(parsed_resume)

    # From ATS scores (already computed)
    skill_overlap = ats_scores.get("technical_fit_score", 50) / 100.0
    overall_ats = ats_scores.get("ats_score", 50) / 100.0

    # Derived
    resume_skills = parsed_resume.get("skills", [])
    job_required = parsed_job.get("required_skills", [])
    job_tech = parsed_job.get("tech_stack", [])
    all_job_skills = job_required + job_tech
    keyword_coverage = (
        len({s.lower() for s in resume_skills} & {s.lower() for s in all_job_skills})
        / max(len(all_job_skills), 1)
    )

    has_projects = 1.0 if parsed_resume.get("projects") else 0.0
    certs = parsed_resume.get("certifications", [])
    cert_value = min(len(certs) * 0.2, 1.0)  # each cert adds 0.2, max 1.0

    # Seniority alignment
    from app.services.semantic_matcher import score_seniority_alignment
    seniority_score = score_seniority_alignment(parsed_resume, parsed_job) / 100.0

    features = RecruiterFitFeatures(
        years_of_experience=yoe,
        education_tier=edu_tier,
        career_progression=career_prog,
        company_tier_avg=company_tier,
        has_relevant_projects=has_projects,
        certification_value=cert_value,
        career_gaps=0.9,  # default: assume no major gaps (improved with outcome data)
        metric_density=metric_density,
        verb_strength=verb_strength,
        skill_overlap_ratio=skill_overlap,
        keyword_coverage=keyword_coverage,
        semantic_similarity=semantic_match_score / 100.0,
        experience_role_fit=experience_role_fit / 100.0,
        seniority_alignment=seniority_score,
        cohort_percentile=0.5,   # default: will be updated when cohort data exists
        keyword_success_rate=0.5,  # default: will be updated from outcome data
    )

    # ── Score — try trained model first, fall back to cold-start rules ──────────
    model_type_used = "rule_based"
    try:
        from app.services.model_trainer import get_trained_predictor
        trained = get_trained_predictor()
        if trained is not None:
            feature_input = {
                "semantic_similarity":  features.semantic_similarity,
                "skill_overlap_ratio":  features.skill_overlap_ratio,
                "metric_density":       features.metric_density,
                "years_of_experience":  min(yoe / 15.0, 1.0),
                "seniority_alignment":  features.seniority_alignment,
                "keyword_coverage":     features.keyword_coverage,
                "verb_strength":        features.verb_strength,
                "career_progression":   features.career_progression,
                "company_tier_avg":     features.company_tier_avg,
                "education_tier":       features.education_tier,
                "has_relevant_projects": features.has_relevant_projects,
                "certification_value":  features.certification_value,
                "career_gaps":          features.career_gaps,
                "cohort_percentile":    features.cohort_percentile,
                "keyword_success_rate": features.keyword_success_rate,
                "experience_role_fit":  features.experience_role_fit,
            }
            raw_score = trained.predict(feature_input)
            model_type_used = trained.model_type
            logger.debug("Using trained model", type=model_type_used, prob=round(raw_score, 3))
        else:
            raw_score = score_with_cold_start(features)
    except Exception as e:
        logger.warning("Trained model inference failed, using cold-start", error=str(e))
        raw_score = score_with_cold_start(features)

    # Convert to 0-100 probability using soft-max scaling
    # A score of 0.5 → ~50%; 0.8 → ~75%; 0.2 → ~25%
    # We use a stretched sigmoid: less extreme than logistic, more readable
    probability = min(max(raw_score * 100, 5), 95)  # cap extremes

    tier = _classify_tier(probability)
    confidence = _classify_confidence(features)

    positive_signals, negative_signals = _generate_signals(features, probability)

    # ── One-sentence explanation ──────────────────────────────────────────────
    if tier == "top_10":
        explanation = f"Strong candidate — {int(probability)}% estimated interview probability based on skills, experience, and role alignment."
    elif tier == "competitive":
        explanation = f"Competitive profile with {int(probability)}% estimated interview probability — a few targeted improvements could push you higher."
    elif tier == "borderline":
        explanation = f"Borderline fit ({int(probability)}%) — close the skill gaps highlighted below to significantly improve your chances."
    else:
        explanation = f"Significant gaps detected ({int(probability)}%) — this role requires skills or experience levels not yet in your profile."

    # ── Build feature dict for storage ───────────────────────────────────────
    feature_dict = {
        "years_of_experience": yoe,
        "education_tier": edu_tier,
        "career_progression": round(career_prog, 3),
        "company_tier_avg": round(company_tier, 3),
        "metric_density": round(metric_density, 3),
        "verb_strength": round(verb_strength, 3),
        "skill_overlap_ratio": round(skill_overlap, 3),
        "keyword_coverage": round(keyword_coverage, 3),
        "semantic_similarity": round(semantic_match_score / 100, 3),
        "seniority_alignment": round(seniority_score, 3),
        "has_relevant_projects": has_projects,
        "certification_count": len(certs),
    }

    return RecruiterFitResult(
        interview_probability=round(probability, 1),
        confidence_level=confidence,
        tier=tier,
        score=round(raw_score * 100, 1),
        positive_signals=positive_signals,
        negative_signals=negative_signals,
        features=feature_dict,
        model_type=model_type_used,
        explanation=explanation,
    )


def serialize_fit_result(result: RecruiterFitResult) -> dict:
    return {
        "interview_probability": result.interview_probability,
        "confidence_level": result.confidence_level,
        "tier": result.tier,
        "score": result.score,
        "positive_signals": result.positive_signals,
        "negative_signals": result.negative_signals,
        "features": result.features,
        "model_type": result.model_type,
        "explanation": result.explanation,
    }
