"""
Synthetic Training Data Generator for JobSync Embedder Fine-Tuning.

Generates diverse resume-JD pairs at 3 similarity levels (high/medium/low)
across 6 role families and 4 seniority levels using Groq.

Output: JSONL file at backend/data/training_pairs.jsonl
  Each line: {"resume": "...", "jd": "...", "label": 0.0-1.0}

Label convention:
  0.85-1.0  → high match (same role, matching skills, right level)
  0.45-0.65 → medium match (related role or skill gap or level mismatch)
  0.05-0.25 → low match  (different domain entirely)

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
    label: float
    role: str
    seniority: str
    match_level: str


# ─── Prompts ──────────────────────────────────────────────────────────────────

def _build_pair_prompt(role: str, seniority_label: str, seniority_desc: str,
                       match_level: str, match_desc: str) -> str:
    return f"""Generate a realistic resume excerpt and job description for training an ATS AI model.

Role family: {role}
Candidate seniority: {seniority_label} ({seniority_desc})
Match level: {match_level} — {match_desc}

Rules:
- Resume: 200-350 words. Include: name, contact, 2-3 job entries with bullets, skills section.
  Use realistic company names, specific technologies, quantified achievements.
- JD: 200-300 words. Include: role title, company, responsibilities, requirements, tech stack.
  Use realistic requirements for the seniority level.
- If match_level=low, make the JD a genuinely different domain (e.g., marketing analytics vs systems programming).
- If match_level=medium, share ~40% of skills but have 1-2 critical gaps.
- If match_level=high, 80%+ skill overlap, same level, matching domain.
- Be diverse: vary companies (startups, FAANG, mid-size), technologies, industries.

Return JSON only:
{{
  "resume": "<full resume text>",
  "jd": "<full job description text>"
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

            # Add small Gaussian noise to label for realism
            noisy_label = float(max(0.0, min(1.0, label + random.gauss(0, 0.03))))

            return TrainingPair(
                resume=resume,
                jd=jd,
                label=noisy_label,
                role=role,
                seniority=seniority_label,
                match_level=match_level,
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
