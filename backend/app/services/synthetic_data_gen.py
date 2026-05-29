"""
Synthetic Training Data Generator for JobSync Neural Scorer Training.

Generates diverse resume-JD pairs at 3 similarity levels (high/medium/low)
across 8 role families and 4 seniority levels using Groq.

Each pair includes per-dimension ATS scores for multi-task neural training:
  - ats_score                 (keyword/format match)
  - technical_fit_score       (skills/stack alignment)
  - semantic_match_score      (conceptual relevance)
  - recruiter_impression_score (presentation quality)
  - project_relevance_score   (portfolio alignment)

Output: JSONL file at backend/data/training_pairs.jsonl

Usage:
  python -m app.services.synthetic_data_gen --pairs 600 --output data/training_pairs.jsonl
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import time
from pathlib import Path
from typing import NamedTuple
import structlog

logger = structlog.get_logger()

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

OUTPUT_PATH = DATA_DIR / "training_pairs.jsonl"

# ─── Taxonomy ─────────────────────────────────────────────────────────────────

ROLE_FAMILIES = [
    "Software Engineering",
    "Data Science & ML",
    "Product Management",
    "DevOps & Platform Engineering",
    "Mobile Engineering (iOS/Android)",
    "Frontend / Full-Stack Engineering",
    "Security Engineering",
    "Data Engineering",
]

SENIORITY_LEVELS = [
    ("junior", "0-2 years experience, recent grad or bootcamp"),
    ("mid",    "3-5 years experience, independent contributor"),
    ("senior", "6-10 years experience, tech lead, mentors others"),
    ("staff",  "10+ years experience, staff/principal, company-wide impact"),
]

MATCH_LEVELS = [
    ("high",   0.90, "same role family, matching skills, correct seniority"),
    ("medium", 0.52, "adjacent role or 1-2 key skills missing or 1 level off"),
    ("low",    0.12, "completely different domain or 3+ levels off or wrong industry"),
]


class TrainingPair(NamedTuple):
    resume: str
    jd: str
    label: float                    # overall similarity 0-1 (kept for embedder training)
    role: str
    seniority: str
    match_level: str
    # Per-dimension scores for neural scorer training (0-100)
    ats_score: float = 50.0
    technical_fit_score: float = 50.0
    semantic_match_score: float = 50.0
    recruiter_impression_score: float = 50.0
    project_relevance_score: float = 50.0


# ─── Prompts ──────────────────────────────────────────────────────────────────

def _build_pair_prompt(role: str, seniority_label: str, seniority_desc: str,
                       match_level: str, match_desc: str) -> str:
    # Score ranges per match level
    score_guide = {
        "high":   "ats_score: 78-95, technical_fit_score: 75-93, semantic_match_score: 80-95, recruiter_impression_score: 72-90, project_relevance_score: 70-92",
        "medium": "ats_score: 45-65, technical_fit_score: 40-62, semantic_match_score: 48-68, recruiter_impression_score: 45-65, project_relevance_score: 38-60",
        "low":    "ats_score: 8-30, technical_fit_score: 5-25, semantic_match_score: 10-28, recruiter_impression_score: 20-40, project_relevance_score: 5-22",
    }[match_level]

    return f"""Generate a realistic resume excerpt and job description for training an ATS scoring AI model.

Role family: {role}
Candidate seniority: {seniority_label} ({seniority_desc})
Match level: {match_level} — {match_desc}

Rules for resume (200-350 words):
- Include: name, contact, 2-3 job entries with metric-rich bullets, skills section
- Use realistic company names, specific technologies, quantified achievements (%, $, users)

Rules for JD (200-300 words):
- Include: role title, company, responsibilities, requirements, required tech stack
- Match level determines how well the resume fits:
  - high: 80%+ skill overlap, same seniority, matching domain
  - medium: ~40% skill overlap, 1-2 critical gaps or 1 level mismatch
  - low: genuinely different domain (e.g. marketing vs systems, finance vs mobile)

Score each dimension independently based on how well the resume matches the JD.
Score ranges for {match_level} match: {score_guide}
Vary scores within range (do NOT use the same value for all dimensions).

Return JSON only — no extra text:
{{
  "resume": "<full resume text>",
  "jd": "<full JD text>",
  "ats_score": <float 0-100>,
  "technical_fit_score": <float 0-100>,
  "semantic_match_score": <float 0-100>,
  "recruiter_impression_score": <float 0-100>,
  "project_relevance_score": <float 0-100>
}}"""


# ─── Generator ───────────────────────────────────────────────────────────────

async def generate_pair(
    role: str,
    seniority_label: str,
    seniority_desc: str,
    match_level: str,
    label: float,
    match_desc: str,
    semaphore: asyncio.Semaphore,
) -> TrainingPair | None:
    """Generate a single training pair via Groq."""
    from app.services.groq_limiter import groq_call
    from app.core.config import settings

    prompt = _build_pair_prompt(role, seniority_label, seniority_desc, match_level, match_desc)

    async with semaphore:
        try:
            raw = await groq_call(
                model=settings.GROQ_FAST_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.85,      # high diversity
                max_tokens=700,
                json_mode=True,
                use_cache=False,
            )
            data = json.loads(raw)
            resume = data.get("resume", "").strip()
            jd = data.get("jd", "").strip()

            if len(resume) < 100 or len(jd) < 100:
                logger.warning("Generated pair too short", role=role)
                return None

            # Add small Gaussian noise to overall label for realism
            noisy_label = float(max(0.0, min(1.0, label + random.gauss(0, 0.03))))

            # Extract per-dimension scores (Groq provides these)
            def _score(key: str, default: float) -> float:
                v = data.get(key, default)
                return float(max(0.0, min(100.0, v + random.gauss(0, 1.5))))

            base = label * 100.0
            return TrainingPair(
                resume=resume,
                jd=jd,
                label=noisy_label,
                role=role,
                seniority=seniority_label,
                match_level=match_level,
                ats_score=_score("ats_score", base),
                technical_fit_score=_score("technical_fit_score", base),
                semantic_match_score=_score("semantic_match_score", base),
                recruiter_impression_score=_score("recruiter_impression_score", base),
                project_relevance_score=_score("project_relevance_score", base),
            )
        except Exception as e:
            logger.warning("Failed to generate pair", error=str(e), role=role)
            return None


async def generate_dataset(target_pairs: int = 600) -> list[TrainingPair]:
    """
    Generate `target_pairs` training pairs with balanced distribution.

    Distribution:
      - 40% high match (label ~0.9)
      - 35% medium match (label ~0.52)
      - 25% low match (label ~0.12)
    """
    counts = {
        "high":   int(target_pairs * 0.40),
        "medium": int(target_pairs * 0.35),
        "low":    int(target_pairs * 0.25),
    }

    tasks = []
    semaphore = asyncio.Semaphore(4)  # max 4 concurrent Groq calls

    for match_level, label, match_desc in MATCH_LEVELS:
        count = counts[match_level]
        for i in range(count):
            role = ROLE_FAMILIES[i % len(ROLE_FAMILIES)]
            sl, sd = SENIORITY_LEVELS[i % len(SENIORITY_LEVELS)]
            tasks.append(generate_pair(role, sl, sd, match_level, label, match_desc, semaphore))

    random.shuffle(tasks)
    logger.info("Generating training pairs", total=len(tasks))

    results = []
    batch_size = 20
    for i in range(0, len(tasks), batch_size):
        batch = tasks[i:i + batch_size]
        batch_results = await asyncio.gather(*batch, return_exceptions=True)
        for r in batch_results:
            if isinstance(r, TrainingPair):
                results.append(r)
        logger.info("Generated", done=len(results), total=len(tasks))
        if i + batch_size < len(tasks):
            await asyncio.sleep(2)  # breathe between batches

    logger.info("Dataset generation complete", pairs=len(results))
    return results


def save_dataset(pairs: list[TrainingPair], output_path: Path = OUTPUT_PATH) -> Path:
    """Save training pairs to JSONL file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        for pair in pairs:
            f.write(json.dumps({
                "resume": pair.resume,
                "jd": pair.jd,
                "label": pair.label,
                "role": pair.role,
                "seniority": pair.seniority,
                "match_level": pair.match_level,
                # Per-dimension scores for neural scorer training
                "ats_score": pair.ats_score,
                "technical_fit_score": pair.technical_fit_score,
                "semantic_match_score": pair.semantic_match_score,
                "recruiter_impression_score": pair.recruiter_impression_score,
                "project_relevance_score": pair.project_relevance_score,
            }) + "\n")
    logger.info("Saved dataset", path=str(output_path), pairs=len(pairs))
    return output_path


def load_dataset(path: Path = OUTPUT_PATH) -> list[dict]:
    """Load training pairs from JSONL file."""
    if not path.exists():
        return []
    pairs = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    pairs.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    return pairs


# ─── CLI entry ────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="Generate ATS training data")
    parser.add_argument("--pairs", type=int, default=600, help="Target number of pairs")
    parser.add_argument("--output", type=str, default=str(OUTPUT_PATH), help="Output JSONL path")
    args = parser.parse_args()

    import os, sys
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent.parent))
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

    pairs = await generate_dataset(target_pairs=args.pairs)
    save_dataset(pairs, Path(args.output))
    print(f"\n✅ Generated {len(pairs)} pairs → {args.output}")
    print(f"   High: {sum(1 for p in pairs if p.match_level == 'high')}")
    print(f"   Medium: {sum(1 for p in pairs if p.match_level == 'medium')}")
    print(f"   Low: {sum(1 for p in pairs if p.match_level == 'low')}")


if __name__ == "__main__":
    asyncio.run(main())
