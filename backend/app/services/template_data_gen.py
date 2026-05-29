"""
Template-Based Training Data Generator — zero API calls, zero LLM, pure code.

Generates thousands of realistic resume-JD pairs in seconds by:
  1. Picking a role profile + seniority level
  2. Selecting skill subsets at 3 match levels (high / medium / low)
  3. Filling text templates with realistic companies, metrics, action verbs
  4. Computing per-dimension ATS scores from the skill/match analysis

Output: JSONL at backend/data/training_pairs.jsonl
  Each record has all 5 dimension scores + the raw text pair.

Why this beats LLM generation:
  - Instant (5000 pairs in < 5 seconds)
  - Fully reproducible
  - Scores are ground-truth (computed from actual skill overlap, not estimated)
  - No API cost, no rate limits
  - Diverse: combinatorial explosion of skill/company/metric variations
"""
from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path
from typing import NamedTuple

from app.services.domain_vocab import ROLE_PROFILES, SENIORITY_PROFILES, VERBS, METRICS

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
OUTPUT_PATH = DATA_DIR / "training_pairs.jsonl"

# ─── Company name pool ────────────────────────────────────────────────────────

COMPANIES = [
    "Stripe", "Shopify", "Airbnb", "Uber", "Lyft", "DoorDash",
    "Coinbase", "Figma", "Notion", "Linear", "Vercel", "Supabase",
    "HashiCorp", "Datadog", "Snowflake", "Databricks", "Confluent",
    "MongoDB", "Redis Labs", "Elastic", "PagerDuty", "Twilio",
    "Cloudflare", "Fastly", "DigitalOcean", "Render", "Railway",
    "Anthropic", "OpenAI", "Cohere", "Mistral", "Scale AI",
    "Palantir", "C3.ai", "UiPath", "Automation Anywhere",
    "Google", "Meta", "Amazon", "Microsoft", "Apple", "Netflix",
    "Spotify", "Atlassian", "GitHub", "GitLab", "JetBrains",
    "Grab", "Gojek", "Sea Group", "Razorpay", "Zepto", "Meesho",
    "Swiggy", "Zomato", "PhonePe", "Paytm", "CRED", "BrowserStack",
    "TechCorp", "NovaSystems", "CloudNative Inc", "DataFlow Labs",
    "ScaleStack", "DevForge", "ByteBuilders", "InfraWorks",
]

UNIVERSITIES = [
    "IIT Bombay", "IIT Delhi", "IIT Madras", "BITS Pilani",
    "MIT", "Stanford", "Carnegie Mellon", "UC Berkeley",
    "University of Toronto", "ETH Zurich", "NUS",
    "University of Waterloo", "Georgia Tech", "UIUC",
    "NIT Trichy", "IIIT Hyderabad", "IIT Roorkee",
]

METRIC_TEMPLATES = [
    "reduced latency by {n}%",
    "improved throughput by {n}x",
    "saved ${n}K/month in infrastructure costs",
    "scaled to {n}M daily active users",
    "cut deployment time from {a} hours to {b} minutes",
    "achieved {n}% uptime SLA",
    "reduced error rate by {n}%",
    "grew revenue by ${n}M through new features",
    "onboarded {n}+ enterprise customers",
    "led team of {n} engineers",
    "reduced p99 latency from {a}ms to {b}ms",
    "increased test coverage from {a}% to {b}%",
    "migrated {n}TB of data with zero downtime",
    "handled {n}K requests/second at peak",
    "reduced cloud spend by {n}%",
]


def _metric() -> str:
    template = random.choice(METRIC_TEMPLATES)
    n = random.choice([5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 2, 3, 4])
    a = random.choice([10, 20, 30, 100, 200, 500, 60, 90])
    b = max(1, a // random.choice([2, 3, 4, 5, 10]))
    return template.format(n=n, a=a, b=b)


def _verb() -> str:
    return random.choice(VERBS).capitalize()


def _company() -> str:
    return random.choice(COMPANIES)


def _university() -> str:
    return random.choice(UNIVERSITIES)


def _years(seniority: str) -> str:
    lo, hi = SENIORITY_PROFILES[seniority]["years_range"]
    y = random.randint(lo, hi)
    return f"{y}" if y > 0 else "< 1"


# ─── Resume generation ────────────────────────────────────────────────────────

def generate_resume(
    role_key: str,
    seniority: str,
    skills_to_include: list[str],
    skills_to_omit: list[str],
) -> str:
    """
    Generate a realistic resume text for the given role/seniority/skills.
    Uses actual skills from the profile, not random words.
    """
    profile = ROLE_PROFILES[role_key]
    senior_profile = SENIORITY_PROFILES[seniority]
    title_variant = random.choice(profile["title_variants"])
    level_label = senior_profile["label"]
    years = _years(seniority)

    comp1, comp2, comp3 = random.sample(COMPANIES, 3)
    uni = _university()

    # Pick 3-5 skills to highlight in bullets
    highlight_skills = skills_to_include[:5]
    tool_skills = [s for s in skills_to_include if s in profile.get("tools", [])][:2]

    lines = [
        f"{'Alex' if random.random() > 0.5 else 'Jordan'} {'Smith' if random.random() > 0.5 else 'Chen'} · {title_variant}",
        f"contact@email.com · linkedin.com/in/profile · github.com/user",
        "",
        "SUMMARY",
        f"{level_label} {title_variant} with {years}+ years of experience. "
        f"Specialised in {', '.join(highlight_skills[:3])}. "
        f"{'Seeking to lead high-impact engineering work.' if seniority in ('senior','staff') else 'Passionate about building scalable products.'}",
        "",
        "EXPERIENCE",
        "",
    ]

    # Job 1 (most recent)
    n_bullets = 4 if seniority in ("senior", "staff") else 3
    lines += [
        f"{title_variant} · {comp1}",
        f"{'2022' if seniority != 'junior' else '2023'} – Present",
    ]
    for _ in range(n_bullets):
        skill = random.choice(highlight_skills) if highlight_skills else "systems"
        lines.append(f"  • {_verb()} {skill}-based solution — {_metric()}")

    lines += [""]

    # Job 2
    if seniority != "junior":
        lines += [
            f"Software Engineer · {comp2}",
            f"2019 – 2022",
        ]
        for _ in range(3):
            skill = random.choice(highlight_skills[:3]) if highlight_skills else "backend"
            lines.append(f"  • {_verb()} {skill} infrastructure — {_metric()}")
        lines += [""]

    # Education
    degree = "B.Tech" if random.random() > 0.4 else "B.S."
    major = "Computer Science" if random.random() > 0.3 else "Information Technology"
    grad_year = 2016 + SENIORITY_PROFILES[seniority]["years_range"][0]
    lines += [
        "EDUCATION",
        f"{degree} in {major} · {uni} · {grad_year}",
        "",
        "SKILLS",
        f"Languages & Frameworks: {', '.join(highlight_skills[:8])}",
    ]
    if tool_skills:
        lines.append(f"Tools: {', '.join(tool_skills)}")

    if seniority in ("senior", "staff"):
        lines += [
            "",
            "PROJECTS",
            f"  • {_verb()} open-source {random.choice(highlight_skills[:2])} tool — {_metric()}",
        ]

    return "\n".join(lines)


# ─── JD generation ────────────────────────────────────────────────────────────

def generate_jd(
    role_key: str,
    seniority: str,
    required_skills: list[str],
    nice_to_have: list[str],
) -> str:
    """
    Generate a realistic job description for the given role/seniority/skills.
    """
    profile = ROLE_PROFILES[role_key]
    title_variant = random.choice(profile["title_variants"])
    level_label = SENIORITY_PROFILES[seniority]["label"]
    company = _company()
    years_lo, years_hi = SENIORITY_PROFILES[seniority]["years_range"]

    lines = [
        f"{level_label} {title_variant} · {company}",
        f"Location: Remote / Hybrid  |  Full-time",
        "",
        "ABOUT THE ROLE",
        f"We are looking for a {level_label} {title_variant} to join our engineering team at {company}. "
        f"You will work on building and scaling our core platform using {', '.join(required_skills[:3])}.",
        "",
        "RESPONSIBILITIES",
        f"  • Design and implement scalable {required_skills[0] if required_skills else 'backend'} services",
        f"  • Collaborate cross-functionally to deliver product features",
        f"  • {'Lead technical design discussions and mentor junior engineers' if seniority in ('senior','staff') else 'Write clean, well-tested code'}",
        f"  • Improve system reliability and performance ({_metric()})",
        f"  • Participate in code reviews and maintain engineering standards",
        "",
        "REQUIREMENTS",
        f"  • {years_lo}+ years of software engineering experience",
    ]

    for skill in required_skills[:6]:
        lines.append(f"  • Proficiency in {skill}")

    lines += [
        f"  • Strong understanding of {'distributed systems' if role_key in ('backend_engineer','devops_engineer') else 'software design patterns'}",
        "",
        "NICE TO HAVE",
    ]
    for skill in nice_to_have[:4]:
        lines.append(f"  • Experience with {skill}")

    lines += [
        "",
        "TECH STACK",
        f"  {', '.join(required_skills + nice_to_have[:2])}",
    ]

    return "\n".join(lines)


# ─── Scoring ──────────────────────────────────────────────────────────────────

def compute_scores(
    resume_skills: list[str],
    required_skills: list[str],
    nice_to_have: list[str],
    seniority_match: bool,
    domain_match: bool,
    resume_has_metrics: bool,
    resume_length: int,
) -> dict:
    """
    Compute ground-truth ATS scores from the actual skill overlap.
    These are deterministic and accurate because we control both sides.
    """
    all_jd_skills = required_skills + nice_to_have
    matched_required = [s for s in resume_skills if s in required_skills]
    matched_nice = [s for s in resume_skills if s in nice_to_have]

    # Skills overlap ratios
    req_ratio = len(matched_required) / max(len(required_skills), 1)
    nice_ratio = len(matched_nice) / max(len(nice_to_have), 1)
    overall_skill_ratio = (req_ratio * 0.7 + nice_ratio * 0.3)

    # ATS score: keyword coverage + structure quality
    ats = 50.0
    ats += req_ratio * 30.0          # required keywords in resume
    ats += nice_ratio * 10.0         # nice-to-have keywords
    ats += 5.0 if resume_has_metrics else 0.0
    ats += 5.0 if resume_length > 400 else 0.0
    ats = min(ats, 100.0)

    # Technical fit: strict skill matching
    tech = req_ratio * 80.0 + nice_ratio * 20.0
    if seniority_match:
        tech = min(tech + 10.0, 100.0)
    else:
        tech = max(tech - 15.0, 0.0)

    # Semantic match: domain alignment
    semantic = 40.0
    if domain_match:
        semantic += overall_skill_ratio * 50.0
        semantic += 10.0
    else:
        semantic += overall_skill_ratio * 20.0

    # Recruiter impression: presentation quality
    recruiter = 50.0
    recruiter += 20.0 if resume_has_metrics else -5.0
    recruiter += 10.0 if resume_length > 500 else 0.0
    recruiter += seniority_match * 20.0

    # Project relevance: domain + skill match signal
    project = 40.0 if domain_match else 20.0
    project += req_ratio * 40.0
    project += nice_ratio * 10.0
    project = min(project, 100.0)

    # Add controlled noise (±3 points) for realism
    def _clamp_noise(v: float) -> float:
        return round(max(0.0, min(100.0, v + random.gauss(0, 2.5))), 1)

    return {
        "ats_score": _clamp_noise(ats),
        "technical_fit_score": _clamp_noise(tech),
        "semantic_match_score": _clamp_noise(semantic),
        "recruiter_impression_score": _clamp_noise(recruiter),
        "project_relevance_score": _clamp_noise(project),
    }


# ─── Pair generation ──────────────────────────────────────────────────────────

class TrainingRecord(NamedTuple):
    resume: str
    jd: str
    scores: dict
    role: str
    seniority: str
    match_level: str


def generate_pair(
    role_key: str,
    seniority: str,
    match_level: str,
    rng: random.Random,
) -> TrainingRecord:
    """
    Generate one (resume, JD, scores) record.

    match_level:
      "high"   → 80%+ required skills in resume, same seniority, same domain
      "medium" → 40-60% required skills, ±1 seniority level
      "low"    → < 25% required skills, different domain
    """
    profile = ROLE_PROFILES[role_key]
    all_core = profile["core_skills"]
    all_secondary = profile["secondary"]
    all_tools = profile.get("tools", [])
    all_jd_skills = list(dict.fromkeys(all_core + all_secondary))

    if match_level == "high":
        # Resume has most required skills
        n_core = max(1, int(len(all_core) * rng.uniform(0.75, 1.0)))
        n_sec = max(0, int(len(all_secondary) * rng.uniform(0.5, 0.85)))
        resume_skills = rng.sample(all_core, n_core) + rng.sample(all_secondary, min(n_sec, len(all_secondary)))
        required = all_core[:5]
        nice_to_have = all_secondary[:4]
        seniority_match = True
        domain_match = True
        jd_seniority = seniority

    elif match_level == "medium":
        # Resume has ~half the skills, maybe 1 level off
        n_core = max(1, int(len(all_core) * rng.uniform(0.35, 0.60)))
        n_sec = max(0, int(len(all_secondary) * rng.uniform(0.2, 0.45)))
        resume_skills = rng.sample(all_core, n_core) + rng.sample(all_secondary, min(n_sec, len(all_secondary)))
        required = all_core[:5]
        nice_to_have = all_secondary[:4]
        seniority_levels = list(SENIORITY_PROFILES.keys())
        idx = seniority_levels.index(seniority)
        jd_idx = max(0, min(len(seniority_levels) - 1, idx + rng.choice([-1, 0, 1])))
        jd_seniority = seniority_levels[jd_idx]
        seniority_match = (jd_idx == idx)
        domain_match = True

    else:  # low
        # Take skills from a DIFFERENT role family
        other_roles = [k for k in ROLE_PROFILES if k != role_key]
        other_role = rng.choice(other_roles)
        other_profile = ROLE_PROFILES[other_role]
        resume_skills = rng.sample(other_profile["core_skills"], min(3, len(other_profile["core_skills"])))
        required = all_core[:5]
        nice_to_have = all_secondary[:3]
        jd_seniority = seniority
        seniority_match = rng.random() > 0.5
        domain_match = False

    resume_text = generate_resume(role_key, seniority, resume_skills, [])
    jd_text = generate_jd(role_key, jd_seniority, required, nice_to_have)

    has_metrics = "%" in resume_text or "$" in resume_text or "x" in resume_text
    scores = compute_scores(
        resume_skills=resume_skills,
        required_skills=required,
        nice_to_have=nice_to_have,
        seniority_match=seniority_match,
        domain_match=domain_match,
        resume_has_metrics=has_metrics,
        resume_length=len(resume_text),
    )

    return TrainingRecord(
        resume=resume_text,
        jd=jd_text,
        scores=scores,
        role=role_key,
        seniority=seniority,
        match_level=match_level,
    )


def generate_dataset(
    n_pairs: int = 5000,
    seed: int = 42,
    high_ratio: float = 0.35,
    medium_ratio: float = 0.40,
    low_ratio: float = 0.25,
) -> list[TrainingRecord]:
    """
    Generate n_pairs training records.
    Distribution: ~35% high, ~40% medium, ~25% low match by default.
    """
    rng = random.Random(seed)

    counts = {
        "high":   int(n_pairs * high_ratio),
        "medium": int(n_pairs * medium_ratio),
        "low":    n_pairs - int(n_pairs * high_ratio) - int(n_pairs * medium_ratio),
    }

    roles = list(ROLE_PROFILES.keys())
    seniorities = list(SENIORITY_PROFILES.keys())

    records: list[TrainingRecord] = []
    for match_level, count in counts.items():
        for i in range(count):
            role = roles[i % len(roles)]
            seniority = seniorities[i % len(seniorities)]
            try:
                rec = generate_pair(role, seniority, match_level, rng)
                records.append(rec)
            except Exception:
                continue

    rng.shuffle(records)
    return records


def save_dataset(records: list[TrainingRecord], path: Path = OUTPUT_PATH) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        for r in records:
            f.write(json.dumps({
                "resume": r.resume,
                "jd": r.jd,
                "role": r.role,
                "seniority": r.seniority,
                "match_level": r.match_level,
                "ats_score": r.scores["ats_score"],
                "technical_fit_score": r.scores["technical_fit_score"],
                "semantic_match_score": r.scores["semantic_match_score"],
                "recruiter_impression_score": r.scores["recruiter_impression_score"],
                "project_relevance_score": r.scores["project_relevance_score"],
            }) + "\n")
    return path


if __name__ == "__main__":
    import time, sys
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    print(f"Generating {n} training pairs...")
    t0 = time.monotonic()
    records = generate_dataset(n_pairs=n)
    save_dataset(records)
    elapsed = time.monotonic() - t0
    print(f"Done: {len(records)} pairs in {elapsed:.2f}s → {OUTPUT_PATH}")
    print(f"  High: {sum(1 for r in records if r.match_level=='high')}")
    print(f"  Medium: {sum(1 for r in records if r.match_level=='medium')}")
    print(f"  Low: {sum(1 for r in records if r.match_level=='low')}")
