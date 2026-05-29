"""
Skill Normalizer — canonical alias mapping for tech skills.
Prevents "k8s" ≠ "kubernetes", "ml" ≠ "machine learning" mismatches.
"""
from __future__ import annotations
import re
from functools import lru_cache

# ─── Alias Map ───────────────────────────────────────────────────────────────
# All keys and values are lowercase. Each alias maps to its canonical form.
SKILL_ALIASES: dict[str, str] = {
    # Languages
    "js": "javascript",
    "ts": "typescript",
    "py": "python",
    "rb": "ruby",
    "golang": "go",
    "c sharp": "c#",
    "csharp": "c#",
    "dotnet": ".net",
    "dot net": ".net",
    "cplusplus": "c++",
    "c plus plus": "c++",
    "objective-c": "objective c",
    "objc": "objective c",
    # Web
    "reactjs": "react",
    "react.js": "react",
    "vuejs": "vue",
    "vue.js": "vue",
    "angularjs": "angular",
    "nextjs": "next.js",
    "nuxtjs": "nuxt.js",
    "nodejs": "node.js",
    "node": "node.js",
    "expressjs": "express",
    "tailwind": "tailwindcss",
    "tailwind css": "tailwindcss",
    # Databases
    "postgres": "postgresql",
    "pg": "postgresql",
    "mongo": "mongodb",
    "mssql": "sql server",
    "ms sql": "sql server",
    "microsoft sql server": "sql server",
    "elastic": "elasticsearch",
    "es": "elasticsearch",
    "dynamo": "dynamodb",
    "dynamodb": "dynamodb",
    "couch": "couchdb",
    # Cloud / Infra
    "amazon web services": "aws",
    "google cloud": "gcp",
    "google cloud platform": "gcp",
    "azure cloud": "azure",
    "microsoft azure": "azure",
    "k8s": "kubernetes",
    "kube": "kubernetes",
    "tf": "terraform",
    "iac": "terraform",
    # CI/CD
    "github actions": "github actions",
    "gh actions": "github actions",
    "cicd": "ci/cd",
    "ci cd": "ci/cd",
    "continuous integration": "ci/cd",
    "continuous deployment": "ci/cd",
    # AI / ML
    "ml": "machine learning",
    "ai": "artificial intelligence",
    "dl": "deep learning",
    "nlp": "natural language processing",
    "cv": "computer vision",
    "llm": "large language models",
    "llms": "large language models",
    "gen ai": "generative ai",
    "genai": "generative ai",
    "sklearn": "scikit-learn",
    "sci-kit learn": "scikit-learn",
    "tf": "tensorflow",
    "pt": "pytorch",
    "hf": "huggingface",
    "hugging face": "huggingface",
    "langchain": "langchain",
    "rag": "retrieval augmented generation",
    # Data
    "pyspark": "spark",
    "apache spark": "spark",
    "apache kafka": "kafka",
    "apache airflow": "airflow",
    "bq": "bigquery",
    "redshift": "aws redshift",
    "looker": "looker",
    "tableau": "tableau",
    "powerbi": "power bi",
    "power bi": "power bi",
    # DevOps
    "gh": "github",
    "gl": "gitlab",
    "bb": "bitbucket",
    "jenkins ci": "jenkins",
    "argocd": "argo cd",
    # Mobile
    "rn": "react native",
    "flutter": "flutter",
    "swiftui": "swift",
    "xcode": "swift",
    # Methodologies
    "agile/scrum": "agile",
    "scrum": "agile",
    "kanban": "agile",
    "tdd": "test driven development",
    "bdd": "behavior driven development",
    "oop": "object oriented programming",
    "object-oriented": "object oriented programming",
    "fp": "functional programming",
    "microservice": "microservices",
    "micro services": "microservices",
    "rest api": "rest",
    "restful": "rest",
    "restful api": "rest",
    "graphql api": "graphql",
    "grpc": "grpc",
    # Security
    "appsec": "application security",
    "devsecops": "security",
    "oauth": "oauth2",
    "jwt": "json web tokens",
    # Testing
    "unit testing": "testing",
    "integration testing": "testing",
    "e2e testing": "testing",
    "end to end testing": "testing",
    "jest": "jest",
    "pytest": "pytest",
    "selenium": "selenium",
    "cypress": "cypress",
    # Other
    "linux/unix": "linux",
    "unix": "linux",
    "bash/shell": "bash",
    "shell scripting": "bash",
    "zsh": "bash",
    "vim/neovim": "vim",
    "vscode": "vs code",
}

# ─── Canonical Display Names ──────────────────────────────────────────────────
CANONICAL_DISPLAY: dict[str, str] = {
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "python": "Python",
    "go": "Go",
    "rust": "Rust",
    "ruby": "Ruby",
    "java": "Java",
    "kotlin": "Kotlin",
    "swift": "Swift",
    "c#": "C#",
    ".net": ".NET",
    "c++": "C++",
    "react": "React",
    "vue": "Vue.js",
    "angular": "Angular",
    "next.js": "Next.js",
    "node.js": "Node.js",
    "express": "Express",
    "tailwindcss": "Tailwind CSS",
    "postgresql": "PostgreSQL",
    "mongodb": "MongoDB",
    "redis": "Redis",
    "elasticsearch": "Elasticsearch",
    "dynamodb": "DynamoDB",
    "aws": "AWS",
    "gcp": "GCP",
    "azure": "Azure",
    "kubernetes": "Kubernetes",
    "docker": "Docker",
    "terraform": "Terraform",
    "ci/cd": "CI/CD",
    "github actions": "GitHub Actions",
    "machine learning": "Machine Learning",
    "deep learning": "Deep Learning",
    "natural language processing": "NLP",
    "computer vision": "Computer Vision",
    "large language models": "LLMs",
    "generative ai": "Generative AI",
    "scikit-learn": "scikit-learn",
    "tensorflow": "TensorFlow",
    "pytorch": "PyTorch",
    "huggingface": "HuggingFace",
    "langchain": "LangChain",
    "spark": "Apache Spark",
    "kafka": "Apache Kafka",
    "airflow": "Apache Airflow",
    "bigquery": "BigQuery",
    "power bi": "Power BI",
    "github": "GitHub",
    "gitlab": "GitLab",
    "microservices": "Microservices",
    "rest": "REST API",
    "graphql": "GraphQL",
    "grpc": "gRPC",
    "linux": "Linux",
    "bash": "Bash",
    "react native": "React Native",
    "flutter": "Flutter",
    "agile": "Agile",
    "testing": "Testing",
}


def normalize_skill(skill: str) -> str:
    """Normalize a skill string to its canonical lowercase form."""
    if not skill:
        return ""
    cleaned = skill.strip().lower()
    cleaned = re.sub(r"[^\w\s\.\+\#\-\/]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return SKILL_ALIASES.get(cleaned, cleaned)


def normalize_skills(skills: list[str]) -> list[str]:
    """Normalize a list of skills, deduplicating by canonical form."""
    seen: set[str] = set()
    result: list[str] = []
    for s in skills:
        norm = normalize_skill(s)
        if norm and norm not in seen:
            seen.add(norm)
            result.append(norm)
    return result


def display_skill(canonical: str) -> str:
    """Convert a canonical skill to its display name."""
    return CANONICAL_DISPLAY.get(canonical, canonical.title())


def skills_overlap(resume_skills: list[str], job_skills: list[str]) -> tuple[set[str], set[str]]:
    """
    Return (matched, missing) sets using normalized comparison.
    Both sets contain canonical forms.
    """
    resume_norm = set(normalize_skills(resume_skills))
    job_norm = set(normalize_skills(job_skills))

    matched: set[str] = set()
    missing: set[str] = set()

    for job_skill in job_norm:
        # Exact match
        if job_skill in resume_norm:
            matched.add(job_skill)
            continue
        # Substring match (e.g. "aws lambda" matches "aws")
        found = False
        for resume_skill in resume_norm:
            if job_skill in resume_skill or resume_skill in job_skill:
                matched.add(job_skill)
                found = True
                break
        if not found:
            missing.add(job_skill)

    return matched, missing


@lru_cache(maxsize=1)
def _alias_values_set() -> frozenset[str]:
    """All canonical target values in the alias map (for fast lookup)."""
    return frozenset(SKILL_ALIASES.values())
