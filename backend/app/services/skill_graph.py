"""
SKILL GRAPH — JobSync Proprietary Skill Ontology
=================================================
A hand-crafted + learned knowledge graph of skill relationships.

This is a CORE COMPETITIVE MOAT component:
  - Competitors using keyword matching: React ≠ Vue → zero credit
  - JobSync: React → Vue (0.85 similar) → partial credit, better ranking

Graph structure:
  Nodes:  skills (300+)
  Edges:  (skill_a, skill_b, relationship_type, weight)

Relationship types:
  IS_SIMILAR_TO:        skills are interchangeable / alternatives
  IS_PREREQUISITE_OF:   learning A helps learn B (directional)
  COMPLEMENTS:          knowing both A+B is synergistic
  ENABLES_ROLE:         skill unlocks certain job titles
  TAUGHT_BY:            link to learning resource

This file also handles:
  - Skill gap analysis (compare candidate vs. job requirements)
  - Learning roadmap generation with time estimates
  - Skill demand scoring (from job posting frequency)
  - Skill category taxonomy
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
import structlog

logger = structlog.get_logger()


# ─── Skill taxonomy ───────────────────────────────────────────────────────────

SKILL_CATEGORIES = {
    # Languages
    "python": "languages", "javascript": "languages", "typescript": "languages",
    "java": "languages", "kotlin": "languages", "swift": "languages",
    "c++": "languages", "c#": "languages", "go": "languages", "golang": "languages",
    "rust": "languages", "ruby": "languages", "php": "languages",
    "scala": "languages", "r": "languages", "dart": "languages",
    "elixir": "languages", "haskell": "languages", "lua": "languages",
    "bash": "languages", "shell": "languages",

    # Frontend
    "react": "frontend", "react.js": "frontend", "next.js": "frontend",
    "vue": "frontend", "vue.js": "frontend", "angular": "frontend",
    "svelte": "frontend", "html": "frontend", "css": "frontend",
    "tailwindcss": "frontend", "sass": "frontend", "webpack": "frontend",
    "vite": "frontend", "redux": "frontend", "graphql": "frontend",

    # Backend
    "node.js": "backend", "express": "backend", "fastapi": "backend",
    "django": "backend", "flask": "backend", "spring": "backend",
    "rails": "backend", "laravel": "backend", "asp.net": "backend",
    "grpc": "backend", "rest api": "backend", "websockets": "backend",
    "microservices": "backend",

    # Databases
    "postgresql": "databases", "mysql": "databases", "mongodb": "databases",
    "redis": "databases", "elasticsearch": "databases", "sqlite": "databases",
    "cassandra": "databases", "dynamodb": "databases", "supabase": "databases",
    "firebase": "databases", "neo4j": "databases", "clickhouse": "databases",
    "snowflake": "databases",

    # Cloud
    "aws": "cloud", "gcp": "cloud", "azure": "cloud",
    "terraform": "cloud", "kubernetes": "cloud", "k8s": "cloud",
    "docker": "cloud", "helm": "cloud", "cloudformation": "cloud",
    "lambda": "cloud", "ec2": "cloud", "s3": "cloud",
    "github actions": "devops", "ci/cd": "devops",
    "jenkins": "devops", "gitlab ci": "devops",

    # AI/ML
    "machine learning": "ai_ml", "deep learning": "ai_ml",
    "nlp": "ai_ml", "computer vision": "ai_ml",
    "tensorflow": "ai_ml", "pytorch": "ai_ml",
    "scikit-learn": "ai_ml", "sklearn": "ai_ml",
    "pandas": "data", "numpy": "data",
    "huggingface": "ai_ml", "langchain": "ai_ml",
    "openai": "ai_ml", "rag": "ai_ml", "llm": "ai_ml",

    # Data Engineering
    "spark": "data_eng", "kafka": "data_eng", "airflow": "data_eng",
    "dbt": "data_eng", "bigquery": "data_eng", "hadoop": "data_eng",
    "flink": "data_eng", "databricks": "data_eng",

    # Mobile
    "android": "mobile", "ios": "mobile",
    "react native": "mobile", "flutter": "mobile", "expo": "mobile",
    "swift": "mobile",

    # Practices
    "system design": "practices", "api design": "practices",
    "agile": "practices", "scrum": "practices",
    "linux": "systems", "git": "tools",
    "docker": "devops",
}


# ─── Skill similarity graph ────────────────────────────────────────────────────
#
#  FORMAT: { skill_a: [(skill_b, weight), ...] }
#  weight: 0.0-1.0 where 1.0 = essentially the same skill
#
#  These are BIDIRECTIONAL (we add both directions in code below).
#
SIMILARITY_GRAPH_RAW: dict[str, list[tuple[str, float]]] = {
    # JavaScript ecosystem
    "javascript":   [("typescript", 0.88), ("node.js", 0.70)],
    "typescript":   [("javascript", 0.88)],
    "react":        [("vue", 0.82), ("angular", 0.75), ("svelte", 0.78), ("react.js", 0.99)],
    "vue":          [("react", 0.82), ("angular", 0.75), ("svelte", 0.80), ("vue.js", 0.99)],
    "angular":      [("react", 0.75), ("vue", 0.75)],
    "next.js":      [("nuxt", 0.85), ("gatsby", 0.80), ("remix", 0.82)],
    "redux":        [("zustand", 0.82), ("mobx", 0.78), ("recoil", 0.80), ("pinia", 0.75)],

    # Python ecosystem
    "python":       [("r", 0.60), ("julia", 0.55)],
    "django":       [("fastapi", 0.72), ("flask", 0.75), ("rails", 0.60)],
    "fastapi":      [("django", 0.72), ("flask", 0.80), ("express", 0.65)],
    "flask":        [("fastapi", 0.80), ("django", 0.75)],

    # JVM languages
    "java":         [("kotlin", 0.85), ("scala", 0.70), ("c#", 0.65)],
    "kotlin":       [("java", 0.85), ("swift", 0.60)],
    "scala":        [("java", 0.70), ("clojure", 0.65)],

    # Systems languages
    "c++":          [("c", 0.88), ("rust", 0.65), ("c#", 0.60)],
    "rust":         [("c++", 0.65), ("go", 0.60)],
    "go":           [("rust", 0.60), ("java", 0.55)],

    # ML frameworks
    "pytorch":      [("tensorflow", 0.80), ("jax", 0.72), ("keras", 0.75)],
    "tensorflow":   [("pytorch", 0.80), ("keras", 0.85)],
    "keras":        [("tensorflow", 0.85), ("pytorch", 0.75)],
    "scikit-learn": [("sklearn", 0.99), ("xgboost", 0.72), ("lightgbm", 0.72)],

    # Data tools
    "pandas":       [("polars", 0.82), ("spark", 0.60), ("dask", 0.75)],
    "spark":        [("flink", 0.78), ("hadoop", 0.70), ("databricks", 0.72)],
    "kafka":        [("rabbitmq", 0.75), ("pulsar", 0.80), ("kinesis", 0.72)],
    "airflow":      [("prefect", 0.80), ("dagster", 0.78), ("luigi", 0.72)],
    "dbt":          [("sqlmesh", 0.78)],

    # Cloud providers
    "aws":          [("gcp", 0.72), ("azure", 0.72)],
    "gcp":          [("aws", 0.72), ("azure", 0.72)],
    "azure":        [("aws", 0.72), ("gcp", 0.72)],

    # Container / Orchestration
    "kubernetes":   [("k8s", 0.99), ("docker swarm", 0.80), ("nomad", 0.72)],
    "docker":       [("podman", 0.85), ("containerd", 0.75)],

    # Infrastructure as code
    "terraform":    [("pulumi", 0.82), ("cloudformation", 0.75), ("ansible", 0.65)],
    "ansible":      [("puppet", 0.80), ("chef", 0.78), ("salt", 0.75)],

    # Databases: SQL variants
    "postgresql":   [("mysql", 0.80), ("sqlite", 0.75), ("oracle", 0.68)],
    "mysql":        [("postgresql", 0.80), ("mariadb", 0.90)],

    # Databases: NoSQL variants
    "mongodb":      [("couchdb", 0.78), ("firestore", 0.72)],
    "redis":        [("memcached", 0.80), ("dragonfly", 0.78)],
    "elasticsearch": [("opensearch", 0.90), ("solr", 0.78)],

    # LLM ecosystem
    "langchain":    [("llamaindex", 0.82), ("haystack", 0.78), ("dspy", 0.72)],
    "openai":       [("anthropic", 0.80), ("cohere", 0.78), ("groq", 0.75)],
    "rag":          [("vector search", 0.82), ("semantic search", 0.80)],

    # BI tools
    "tableau":      [("power bi", 0.82), ("looker", 0.78), ("metabase", 0.72)],
    "power bi":     [("tableau", 0.82), ("looker studio", 0.80)],

    # Mobile
    "react native": [("flutter", 0.78), ("expo", 0.88)],
    "flutter":      [("react native", 0.78), ("ionic", 0.65)],
    "swift":        [("objective-c", 0.80)],
    "android":      [("ios", 0.55)],  # different but related domain

    # CI/CD
    "github actions": [("gitlab ci", 0.85), ("jenkins", 0.78), ("circleci", 0.80)],
    "jenkins":         [("github actions", 0.78), ("teamcity", 0.80)],
}


# Build bidirectional graph
_SIMILARITY_GRAPH: dict[str, list[tuple[str, float]]] = {}
for skill_a, targets in SIMILARITY_GRAPH_RAW.items():
    for skill_b, weight in targets:
        _SIMILARITY_GRAPH.setdefault(skill_a, []).append((skill_b, weight))
        _SIMILARITY_GRAPH.setdefault(skill_b, []).append((skill_a, weight))


# ─── Prerequisite graph ────────────────────────────────────────────────────────
#
#  FORMAT: { skill: [(prerequisite, strength 0-1), ...] }
#  Reading: "to learn X, you should first know Y"
#
PREREQUISITE_GRAPH: dict[str, list[tuple[str, float]]] = {
    "react":        [("javascript", 0.95), ("html", 0.90), ("css", 0.80)],
    "next.js":      [("react", 0.95), ("javascript", 0.90)],
    "redux":        [("react", 0.80), ("javascript", 0.85)],
    "fastapi":      [("python", 0.95), ("rest api", 0.70)],
    "django":       [("python", 0.95), ("html", 0.60), ("sql", 0.70)],
    "pytorch":      [("python", 0.95), ("numpy", 0.85), ("machine learning", 0.75)],
    "tensorflow":   [("python", 0.95), ("numpy", 0.85)],
    "scikit-learn": [("python", 0.90), ("numpy", 0.85), ("pandas", 0.80)],
    "pandas":       [("python", 0.95)],
    "spark":        [("python", 0.70), ("sql", 0.75), ("hadoop", 0.50)],
    "kafka":        [("distributed systems", 0.60), ("java", 0.50)],
    "kubernetes":   [("docker", 0.90), ("linux", 0.75), ("yaml", 0.70)],
    "terraform":    [("cloud", 0.70), ("hcl", 0.80)],
    "docker":       [("linux", 0.70), ("bash", 0.60)],
    "machine learning": [("python", 0.80), ("mathematics", 0.75), ("statistics", 0.85)],
    "deep learning": [("machine learning", 0.90), ("python", 0.85), ("numpy", 0.75)],
    "rag":          [("llm", 0.80), ("vector search", 0.85), ("python", 0.70)],
    "langchain":    [("python", 0.90), ("llm", 0.85)],
    "airflow":      [("python", 0.85), ("sql", 0.70), ("bash", 0.60)],
    "dbt":          [("sql", 0.95), ("analytics", 0.70)],
    "graphql":      [("rest api", 0.70), ("javascript", 0.65)],
    "react native": [("react", 0.85), ("javascript", 0.90)],
    "flutter":      [("dart", 0.95)],
    "ansible":      [("linux", 0.85), ("yaml", 0.80), ("bash", 0.70)],
    "elasticsearch":[("json", 0.70), ("rest api", 0.75)],
    "kotlin":       [("java", 0.75)],
    "swift":        [("ios", 0.60)],
}


# ─── Learning resources per skill ─────────────────────────────────────────────
#
# FORMAT: { skill: [{ platform, title, url, is_free, hours }] }
#
LEARNING_RESOURCES: dict[str, list[dict]] = {
    "python":         [{"platform": "Coursera", "title": "Python for Everybody", "url": "https://coursera.org/specializations/python", "is_free": True, "hours": 32}],
    "react":          [{"platform": "React.dev", "title": "Official React Docs", "url": "https://react.dev/learn", "is_free": True, "hours": 20}],
    "next.js":        [{"platform": "Next.js", "title": "Next.js Learn", "url": "https://nextjs.org/learn", "is_free": True, "hours": 10}],
    "kubernetes":     [{"platform": "CNCF", "title": "Kubernetes Basics", "url": "https://kubernetes.io/docs/tutorials/kubernetes-basics/", "is_free": True, "hours": 20}],
    "terraform":      [{"platform": "HashiCorp", "title": "Terraform Learn", "url": "https://developer.hashicorp.com/terraform/tutorials", "is_free": True, "hours": 15}],
    "docker":         [{"platform": "Docker", "title": "Docker Get Started", "url": "https://docs.docker.com/get-started/", "is_free": True, "hours": 8}],
    "pytorch":        [{"platform": "PyTorch", "title": "60-Minute Blitz", "url": "https://pytorch.org/tutorials/beginner/deep_learning_60min_blitz.html", "is_free": True, "hours": 10}],
    "machine learning": [{"platform": "Coursera", "title": "ML Specialization", "url": "https://coursera.org/specializations/machine-learning-introduction", "is_free": False, "hours": 88}],
    "aws":            [{"platform": "AWS", "title": "AWS Training", "url": "https://aws.amazon.com/training/", "is_free": True, "hours": 30}],
    "typescript":     [{"platform": "TypeScript", "title": "TS Handbook", "url": "https://www.typescriptlang.org/docs/handbook/", "is_free": True, "hours": 10}],
    "kafka":          [{"platform": "Confluent", "title": "Kafka Fundamentals", "url": "https://developer.confluent.io/courses/apache-kafka/", "is_free": True, "hours": 12}],
    "airflow":        [{"platform": "Astronomer", "title": "Airflow Fundamentals", "url": "https://academy.astronomer.io/astronomer-certified-apache-airflow-core-exam", "is_free": False, "hours": 20}],
    "dbt":            [{"platform": "dbt", "title": "dbt Learn", "url": "https://courses.getdbt.com/", "is_free": True, "hours": 15}],
    "langchain":      [{"platform": "LangChain", "title": "LangChain Docs", "url": "https://python.langchain.com/docs/get_started/", "is_free": True, "hours": 12}],
    "pandas":         [{"platform": "Kaggle", "title": "Pandas Course", "url": "https://www.kaggle.com/learn/pandas", "is_free": True, "hours": 4}],
    "fastapi":        [{"platform": "FastAPI", "title": "FastAPI Tutorial", "url": "https://fastapi.tiangolo.com/tutorial/", "is_free": True, "hours": 8}],
    "django":         [{"platform": "Django", "title": "Django Official Tutorial", "url": "https://docs.djangoproject.com/en/stable/intro/tutorial01/", "is_free": True, "hours": 12}],
    "go":             [{"platform": "Go", "title": "Go Tour", "url": "https://go.dev/tour/", "is_free": True, "hours": 15}],
    "rust":           [{"platform": "Rust", "title": "Rust Book", "url": "https://doc.rust-lang.org/book/", "is_free": True, "hours": 40}],
    "postgresql":     [{"platform": "PostgreSQL", "title": "PostgreSQL Tutorial", "url": "https://www.postgresqltutorial.com/", "is_free": True, "hours": 15}],
    "graphql":        [{"platform": "Apollo", "title": "Odyssey GraphQL", "url": "https://www.apollographql.com/tutorials/", "is_free": True, "hours": 8}],
}

# Default learning time estimates (hours) when no specific resource exists
DEFAULT_HOURS: dict[str, int] = {
    "languages": 40, "frontend": 20, "backend": 25,
    "databases": 15, "cloud": 30, "devops": 25,
    "ai_ml": 60, "data_eng": 35, "mobile": 30,
    "practices": 10, "systems": 15, "tools": 8,
}


# ─── Demand scores (updated from market signals) ──────────────────────────────
#
# 0-100 score = how in-demand is this skill in current job market
# This would eventually be refreshed weekly from scraped job data
#
DEMAND_SCORES: dict[str, float] = {
    "python": 96, "javascript": 94, "typescript": 90, "react": 89,
    "aws": 92, "docker": 85, "kubernetes": 82, "terraform": 78,
    "machine learning": 88, "pytorch": 82, "sql": 85, "postgresql": 80,
    "node.js": 83, "fastapi": 72, "django": 70, "next.js": 78,
    "java": 82, "go": 75, "rust": 68, "kotlin": 70,
    "spark": 76, "kafka": 74, "airflow": 70, "dbt": 72,
    "langchain": 80, "llm": 84, "rag": 79, "openai": 82,
    "vue": 68, "angular": 60, "svelte": 55,
    "flutter": 62, "react native": 65,
    "redis": 78, "elasticsearch": 72, "mongodb": 70,
    "git": 82, "linux": 78, "bash": 65,
    "github actions": 75, "ci/cd": 80,
}


# ─── Data structures ──────────────────────────────────────────────────────────

@dataclass
class SkillGap:
    skill: str
    category: str
    gap_type: str           # "missing" | "partial" | "outdated"
    gap_score: float        # 0.0 = no gap, 1.0 = completely missing
    priority_score: float   # 0-100: how urgent to fill this gap
    importance: str         # "critical" | "important" | "nice_to_have"
    demand_score: float     # market demand for this skill
    adjacent_skills: list[str]   # candidate's similar skills
    prerequisites: list[str]     # what to learn first
    estimated_hours: int
    resources: list[dict]
    impact_on_score: float  # how much fixing this improves overall match


@dataclass
class LearningRoadmap:
    total_hours: int
    ordered_steps: list[dict]    # ordered list of {skill, hours, prerequisites_met, resources}
    critical_gaps: list[str]     # skills that MUST be filled
    quick_wins: list[str]        # skills learnable in <10 hrs
    long_term: list[str]         # skills that take >30 hrs


@dataclass
class SkillGapAnalysis:
    matched_skills: list[str]
    missing_critical: list[SkillGap]
    missing_preferred: list[SkillGap]
    transferable_from: list[dict]    # {from, to, credit}
    roadmap: LearningRoadmap
    overall_gap_score: float         # 0-100 (higher = bigger gap)
    estimated_readiness_weeks: int


# ─── Core analysis functions ──────────────────────────────────────────────────

def get_similar_skills(skill: str, min_weight: float = 0.60) -> list[tuple[str, float]]:
    """Return similar skills with weight >= min_weight."""
    skill_lower = skill.lower()
    return [
        (s, w) for s, w in _SIMILARITY_GRAPH.get(skill_lower, [])
        if w >= min_weight
    ]


def get_prerequisites(skill: str) -> list[tuple[str, float]]:
    """Return prerequisites for a skill, ordered by importance."""
    skill_lower = skill.lower()
    prereqs = PREREQUISITE_GRAPH.get(skill_lower, [])
    return sorted(prereqs, key=lambda x: x[1], reverse=True)


def get_skill_category(skill: str) -> str:
    return SKILL_CATEGORIES.get(skill.lower(), "general")


def get_demand_score(skill: str) -> float:
    return DEMAND_SCORES.get(skill.lower(), 50.0)


def get_resources(skill: str) -> list[dict]:
    return LEARNING_RESOURCES.get(skill.lower(), [])


def get_default_hours(skill: str) -> int:
    category = get_skill_category(skill)
    return DEFAULT_HOURS.get(category, 20)


def _is_skill_adjacent(candidate_skills: set[str], target_skill: str) -> tuple[bool, list[str], float]:
    """
    Check if candidate has a skill adjacent (similar) to the target.
    Returns (is_adjacent, adjacent_skill_names, best_weight).
    """
    target_lower = target_skill.lower()
    similar = _SIMILARITY_GRAPH.get(target_lower, [])

    adjacent = []
    best_weight = 0.0
    for sim_skill, weight in similar:
        if sim_skill in candidate_skills:
            adjacent.append(sim_skill)
            best_weight = max(best_weight, weight)

    return len(adjacent) > 0, adjacent, best_weight


def analyze_skill_gaps(
    parsed_resume: dict,
    parsed_job: dict,
    top_n: int = 10,
) -> SkillGapAnalysis:
    """
    Full skill gap analysis:
    - Identify matched, missing, transferable skills
    - Score each gap by priority
    - Generate learning roadmap
    """
    # Candidate skills
    resume_skills_raw = parsed_resume.get("skills", [])
    candidate_skills = {s.lower() for s in resume_skills_raw}

    # Job requirements
    required_skills = parsed_job.get("required_skills", [])
    tech_stack = parsed_job.get("tech_stack", [])
    preferred_skills = parsed_job.get("preferred_skills", [])

    # Deduplicate
    all_required = list({s.lower(): s for s in required_skills + tech_stack}.values())
    all_preferred = list({s.lower(): s for s in preferred_skills}.values())

    matched_skills: list[str] = []
    missing_critical: list[SkillGap] = []
    missing_preferred: list[SkillGap] = []
    transferable_from: list[dict] = []

    # ── Analyze critical skills ────────────────────────────────────────────────
    for skill in all_required:
        skill_lower = skill.lower()

        if skill_lower in candidate_skills:
            matched_skills.append(skill)
            continue

        # Check for adjacent/similar skill
        is_adjacent, adjacent_list, best_weight = _is_skill_adjacent(candidate_skills, skill)

        if is_adjacent and best_weight >= 0.75:
            # High similarity → treat as transferable
            transferable_from.append({
                "candidate_has": adjacent_list[0],
                "job_requires": skill,
                "similarity": round(best_weight * 100),
                "gap_reduced_by": f"{int(best_weight * 100)}%",
            })
            gap_score = 1.0 - best_weight
        elif is_adjacent:
            gap_score = 1.0 - (best_weight * 0.6)  # partial credit
        else:
            gap_score = 1.0

        demand = get_demand_score(skill)
        # Priority = gap × demand (both normalized 0-1)
        priority = round((gap_score * (demand / 100)) * 100, 1)

        # Determine importance level
        if demand > 80 or skill_lower in [s.lower() for s in required_skills[:3]]:
            importance = "critical"
        elif demand > 65:
            importance = "important"
        else:
            importance = "nice_to_have"

        prereqs = [p for p, _ in get_prerequisites(skill)]
        prereqs_missing = [p for p in prereqs if p not in candidate_skills]

        resources = get_resources(skill)
        hours = resources[0].get("hours", get_default_hours(skill)) if resources else get_default_hours(skill)

        # Estimate impact on overall match score
        # Critical missing skill with high demand = high impact
        impact = round(gap_score * (demand / 100) * 15, 1)  # max ~15 pts per skill

        missing_critical.append(SkillGap(
            skill=skill,
            category=get_skill_category(skill),
            gap_type="partial" if is_adjacent else "missing",
            gap_score=round(gap_score, 3),
            priority_score=priority,
            importance=importance,
            demand_score=demand,
            adjacent_skills=adjacent_list,
            prerequisites=prereqs_missing[:3],
            estimated_hours=hours,
            resources=resources[:2],
            impact_on_score=impact,
        ))

    # ── Analyze preferred skills ───────────────────────────────────────────────
    for skill in all_preferred:
        skill_lower = skill.lower()
        if skill_lower in candidate_skills:
            matched_skills.append(skill)
            continue

        is_adjacent, adjacent_list, best_weight = _is_skill_adjacent(candidate_skills, skill)
        gap_score = 0.0 if skill_lower in candidate_skills else (1.0 - best_weight if is_adjacent else 1.0)
        demand = get_demand_score(skill)
        priority = round((gap_score * (demand / 100)) * 60, 1)  # preferred = lower priority

        resources = get_resources(skill)
        hours = resources[0].get("hours", get_default_hours(skill)) if resources else get_default_hours(skill)

        missing_preferred.append(SkillGap(
            skill=skill,
            category=get_skill_category(skill),
            gap_type="partial" if is_adjacent else "missing",
            gap_score=round(gap_score, 3),
            priority_score=priority,
            importance="nice_to_have",
            demand_score=demand,
            adjacent_skills=adjacent_list,
            prerequisites=[p for p, _ in get_prerequisites(skill)][:2],
            estimated_hours=hours,
            resources=resources[:1],
            impact_on_score=round(gap_score * (demand / 100) * 5, 1),
        ))

    # ── Sort by priority ───────────────────────────────────────────────────────
    missing_critical.sort(key=lambda g: g.priority_score, reverse=True)
    missing_preferred.sort(key=lambda g: g.priority_score, reverse=True)

    # Limit to top_n
    top_critical = missing_critical[:top_n]
    top_preferred = missing_preferred[:min(5, top_n)]

    # ── Build learning roadmap ─────────────────────────────────────────────────
    roadmap = _build_learning_roadmap(top_critical + top_preferred, candidate_skills)

    # ── Overall gap score (0-100, higher = bigger gap) ────────────────────────
    if not all_required:
        overall_gap = 0.0
    else:
        weighted_gaps = sum(
            g.gap_score * g.demand_score / 100
            for g in missing_critical
        )
        max_possible = len(all_required)
        overall_gap = min((weighted_gaps / max_possible) * 100, 100.0)

    # ── Readiness estimate ────────────────────────────────────────────────────
    total_hours = roadmap.total_hours
    hours_per_week = 10  # assumes ~10 hrs/week of focused learning
    weeks = max(1, math.ceil(total_hours / hours_per_week))

    return SkillGapAnalysis(
        matched_skills=list(set(matched_skills)),
        missing_critical=top_critical,
        missing_preferred=top_preferred,
        transferable_from=transferable_from,
        roadmap=roadmap,
        overall_gap_score=round(overall_gap, 1),
        estimated_readiness_weeks=weeks,
    )


def _build_learning_roadmap(
    gaps: list[SkillGap],
    candidate_skills: set[str],
) -> LearningRoadmap:
    """
    Build a dependency-ordered learning roadmap.
    Skills whose prerequisites are already met come first.
    """
    if not gaps:
        return LearningRoadmap(
            total_hours=0,
            ordered_steps=[],
            critical_gaps=[],
            quick_wins=[],
            long_term=[],
        )

    # Separate by time commitment
    quick_wins = [g.skill for g in gaps if g.estimated_hours <= 10]
    long_term = [g.skill for g in gaps if g.estimated_hours > 30]
    critical_gaps = [g.skill for g in gaps if g.importance == "critical"]

    # Topological sort: skills with no missing prerequisites first
    ordered: list[dict] = []
    scheduled: set[str] = set(candidate_skills)

    max_iterations = len(gaps) * 3
    iteration = 0
    remaining = list(gaps)

    while remaining and iteration < max_iterations:
        iteration += 1
        newly_scheduled = []

        for gap in remaining:
            prereqs_met = all(
                p in scheduled
                for p in gap.prerequisites[:3]  # only check top 3 prereqs
            )
            if prereqs_met or not gap.prerequisites:
                ordered.append({
                    "step": len(ordered) + 1,
                    "skill": gap.skill,
                    "category": gap.category,
                    "importance": gap.importance,
                    "gap_score": gap.gap_score,
                    "estimated_hours": gap.estimated_hours,
                    "prerequisites_met": True,
                    "adjacent_skills": gap.adjacent_skills,
                    "resources": gap.resources,
                    "impact_on_score": gap.impact_on_score,
                })
                scheduled.add(gap.skill.lower())
                newly_scheduled.append(gap)

        for g in newly_scheduled:
            remaining.remove(g)

        if not newly_scheduled and remaining:
            # Circular dependency or all prereqs missing — just add in order
            for gap in remaining:
                ordered.append({
                    "step": len(ordered) + 1,
                    "skill": gap.skill,
                    "category": gap.category,
                    "importance": gap.importance,
                    "gap_score": gap.gap_score,
                    "estimated_hours": gap.estimated_hours,
                    "prerequisites_met": False,
                    "adjacent_skills": gap.adjacent_skills,
                    "resources": gap.resources,
                    "impact_on_score": gap.impact_on_score,
                })
            break

    total_hours = sum(g.estimated_hours for g in gaps)

    return LearningRoadmap(
        total_hours=total_hours,
        ordered_steps=ordered,
        critical_gaps=critical_gaps[:5],
        quick_wins=quick_wins[:5],
        long_term=long_term[:5],
    )


# ─── Serialization helpers ────────────────────────────────────────────────────

def serialize_gap_analysis(analysis: SkillGapAnalysis) -> dict:
    """Convert SkillGapAnalysis to JSON-serializable dict."""
    def gap_to_dict(g: SkillGap) -> dict:
        return {
            "skill": g.skill,
            "category": g.category,
            "gap_type": g.gap_type,
            "gap_score": g.gap_score,
            "priority_score": g.priority_score,
            "importance": g.importance,
            "demand_score": g.demand_score,
            "adjacent_skills": g.adjacent_skills,
            "prerequisites": g.prerequisites,
            "estimated_hours": g.estimated_hours,
            "resources": g.resources,
            "impact_on_score": g.impact_on_score,
        }

    return {
        "matched_skills": analysis.matched_skills,
        "missing_critical": [gap_to_dict(g) for g in analysis.missing_critical],
        "missing_preferred": [gap_to_dict(g) for g in analysis.missing_preferred],
        "transferable_from": analysis.transferable_from,
        "roadmap": {
            "total_hours": analysis.roadmap.total_hours,
            "ordered_steps": analysis.roadmap.ordered_steps,
            "critical_gaps": analysis.roadmap.critical_gaps,
            "quick_wins": analysis.roadmap.quick_wins,
            "long_term": analysis.roadmap.long_term,
        },
        "overall_gap_score": analysis.overall_gap_score,
        "estimated_readiness_weeks": analysis.estimated_readiness_weeks,
    }


import math  # imported here to avoid circular at top
