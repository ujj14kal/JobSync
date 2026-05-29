"""
Domain Vocabulary for JobSync's Custom Tokenizer.

This is the raw material for our from-scratch tokenizer — a curated set of
domain terms for tech careers. No external corpus needed.

Covers: programming languages, frameworks, tools, role families, seniority
signals, action verbs, and common resume/JD structural tokens.
"""

# ─── Technical skills ─────────────────────────────────────────────────────────

LANGUAGES = [
    "python", "java", "javascript", "typescript", "golang", "go", "rust",
    "scala", "kotlin", "swift", "c", "cpp", "csharp", "ruby", "php",
    "r", "matlab", "bash", "shell", "sql", "nosql", "html", "css",
    "dart", "elixir", "haskell", "clojure", "perl", "lua",
]

FRONTEND = [
    "react", "reactjs", "nextjs", "vuejs", "angular", "svelte",
    "redux", "graphql", "webpack", "vite", "tailwind", "sass",
    "storybook", "cypress", "jest", "vitest", "playwright",
    "shadcn", "framer", "d3", "threejs", "webgl", "pwa",
]

BACKEND = [
    "fastapi", "django", "flask", "express", "nestjs", "spring",
    "rails", "laravel", "gin", "fiber", "actix", "phoenix",
    "grpc", "rest", "graphql", "websocket", "microservices",
    "celery", "kafka", "rabbitmq", "redis", "elasticsearch",
    "nginx", "gunicorn", "uvicorn",
]

DATA_ML = [
    "tensorflow", "pytorch", "keras", "scikit", "sklearn", "xgboost",
    "lightgbm", "catboost", "huggingface", "transformers", "langchain",
    "pandas", "numpy", "scipy", "matplotlib", "seaborn", "plotly",
    "spark", "hadoop", "airflow", "dbt", "mlflow", "wandb", "ray",
    "cuda", "triton", "onnx", "llm", "embedding", "rag", "bert",
    "gpt", "diffusion", "reinforcement", "nlp", "cv", "vision",
    "regression", "classification", "clustering", "neural", "deep",
]

DEVOPS_CLOUD = [
    "aws", "gcp", "azure", "docker", "kubernetes", "terraform",
    "ansible", "jenkins", "github", "gitlab", "ci", "cd",
    "helm", "prometheus", "grafana", "datadog", "cloudwatch",
    "lambda", "ec2", "s3", "rds", "dynamodb", "bigquery",
    "cloudrun", "eks", "gke", "aks", "istio", "argocd",
    "pulumi", "crossplane", "service-mesh", "observability",
]

DATABASES = [
    "postgresql", "postgres", "mysql", "sqlite", "mongodb", "cassandra",
    "redis", "elasticsearch", "neo4j", "supabase", "firebase", "dynamo",
    "snowflake", "databricks", "clickhouse", "pinecone", "pgvector",
]

MOBILE = [
    "android", "ios", "react-native", "flutter", "xcode",
    "kotlin", "swift", "jetpack", "compose", "objective-c",
    "firebase", "push-notification", "appstore", "playstore",
]

SECURITY = [
    "penetration", "pentest", "owasp", "cve", "vulnerability",
    "cryptography", "oauth", "jwt", "ssl", "tls", "zero-trust",
    "siem", "soc", "ids", "ips", "firewall", "compliance",
    "iso27001", "soc2", "gdpr", "hipaa",
]

# ─── Role vocabulary ──────────────────────────────────────────────────────────

ROLES = [
    "software", "engineer", "developer", "architect", "lead",
    "senior", "junior", "staff", "principal", "manager",
    "director", "vp", "head", "tech", "full-stack", "frontend",
    "backend", "platform", "infrastructure", "ml", "data",
    "product", "mobile", "security", "devops", "site-reliability",
    "sre", "analyst", "scientist", "researcher", "consultant",
]

SENIORITY = [
    "junior", "mid", "senior", "staff", "principal", "lead",
    "manager", "director", "vp", "intern", "entry", "experienced",
    "expert", "specialist", "associate",
]

# ─── Action verbs (resume bullets) ───────────────────────────────────────────

VERBS = [
    "built", "developed", "designed", "implemented", "architected",
    "led", "managed", "scaled", "optimized", "reduced", "increased",
    "shipped", "launched", "deployed", "migrated", "refactored",
    "created", "established", "improved", "delivered", "mentored",
    "collaborated", "integrated", "automated", "monitored",
    "researched", "analyzed", "modeled", "trained", "evaluated",
    "maintained", "debugged", "reviewed", "tested", "documented",
    "owned", "drove", "spearheaded", "pioneered", "streamlined",
]

# ─── Resume structure tokens ──────────────────────────────────────────────────

STRUCTURE = [
    "experience", "education", "skills", "projects", "summary",
    "objective", "certifications", "awards", "publications",
    "work", "employment", "history", "background", "profile",
    "contact", "email", "phone", "linkedin", "github", "portfolio",
    "university", "degree", "bachelor", "master", "phd",
    "gpa", "graduated", "major", "minor", "coursework",
    "company", "startup", "corporation", "inc", "llc", "ltd",
    "remote", "hybrid", "onsite", "full-time", "part-time",
    "contract", "freelance", "internship",
]

# ─── Metrics / Impact vocabulary ─────────────────────────────────────────────

METRICS = [
    "million", "billion", "thousand", "percent", "users", "customers",
    "revenue", "cost", "latency", "throughput", "uptime",
    "reduction", "improvement", "increase", "growth", "savings",
    "requests", "transactions", "queries", "deployments", "releases",
    "team", "engineers", "stakeholders", "sprint", "quarter",
]

# ─── Common English words (keep stop words that matter in context) ────────────

COMMON = [
    "and", "the", "with", "using", "for", "in", "on", "at", "to",
    "of", "a", "an", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "will", "would", "could", "should",
    "our", "we", "team", "project", "system", "service", "platform",
    "application", "api", "code", "feature", "product", "solution",
    "performance", "quality", "reliability", "scalability",
    "requirements", "responsible", "experience", "knowledge",
    "ability", "proficiency", "familiarity", "strong", "excellent",
    "good", "great", "looking", "seeking", "join", "hire",
]

# ─── Combine all into master vocab list ───────────────────────────────────────

ALL_DOMAIN_WORDS: list[str] = list(dict.fromkeys(
    LANGUAGES + FRONTEND + BACKEND + DATA_ML + DEVOPS_CLOUD +
    DATABASES + MOBILE + SECURITY + ROLES + SENIORITY +
    VERBS + STRUCTURE + METRICS + COMMON
))

# Skill categories for template data generation
SKILL_CATEGORIES: dict[str, list[str]] = {
    "languages":  LANGUAGES,
    "frontend":   FRONTEND,
    "backend":    BACKEND,
    "data_ml":    DATA_ML,
    "devops":     DEVOPS_CLOUD,
    "databases":  DATABASES,
    "mobile":     MOBILE,
    "security":   SECURITY,
}

# Role profiles: each profile defines the typical skill set for a job family
ROLE_PROFILES: dict[str, dict] = {
    "frontend_engineer": {
        "core_skills": ["react", "typescript", "javascript", "css", "html"],
        "secondary": ["nextjs", "redux", "graphql", "jest", "webpack", "tailwind"],
        "tools": ["git", "figma", "vite", "storybook"],
        "title_variants": ["Frontend Engineer", "UI Engineer", "Web Developer", "React Developer"],
    },
    "backend_engineer": {
        "core_skills": ["python", "java", "golang", "postgresql", "rest", "docker"],
        "secondary": ["fastapi", "django", "redis", "kafka", "grpc", "kubernetes"],
        "tools": ["git", "aws", "jenkins", "terraform"],
        "title_variants": ["Backend Engineer", "Software Engineer", "API Engineer", "Platform Engineer"],
    },
    "fullstack_engineer": {
        "core_skills": ["react", "typescript", "python", "postgresql", "docker"],
        "secondary": ["nextjs", "fastapi", "redis", "aws", "graphql"],
        "tools": ["git", "github", "ci/cd", "jest"],
        "title_variants": ["Full Stack Engineer", "Software Engineer", "Full-Stack Developer"],
    },
    "ml_engineer": {
        "core_skills": ["python", "pytorch", "tensorflow", "sklearn", "sql"],
        "secondary": ["mlflow", "docker", "kubernetes", "spark", "airflow", "ray"],
        "tools": ["git", "aws", "wandb", "jupyter"],
        "title_variants": ["ML Engineer", "Machine Learning Engineer", "AI Engineer"],
    },
    "data_scientist": {
        "core_skills": ["python", "r", "pandas", "numpy", "sklearn", "sql"],
        "secondary": ["pytorch", "tensorflow", "spark", "tableau", "airflow"],
        "tools": ["jupyter", "git", "databricks", "bigquery"],
        "title_variants": ["Data Scientist", "ML Researcher", "Applied Scientist"],
    },
    "devops_engineer": {
        "core_skills": ["kubernetes", "docker", "terraform", "aws", "linux"],
        "secondary": ["helm", "prometheus", "grafana", "ansible", "jenkins", "gitlab"],
        "tools": ["git", "bash", "python"],
        "title_variants": ["DevOps Engineer", "SRE", "Platform Engineer", "Cloud Engineer"],
    },
    "data_engineer": {
        "core_skills": ["python", "spark", "sql", "airflow", "dbt"],
        "secondary": ["kafka", "databricks", "snowflake", "bigquery", "aws"],
        "tools": ["git", "docker", "terraform"],
        "title_variants": ["Data Engineer", "Analytics Engineer", "ETL Engineer"],
    },
    "mobile_engineer": {
        "core_skills": ["swift", "kotlin", "react-native", "flutter", "ios"],
        "secondary": ["android", "firebase", "graphql", "rest", "xcode"],
        "tools": ["git", "xcode", "ci/cd"],
        "title_variants": ["iOS Engineer", "Android Engineer", "Mobile Developer"],
    },
    "security_engineer": {
        "core_skills": ["python", "penetration", "owasp", "cryptography", "linux"],
        "secondary": ["siem", "vulnerability", "oauth", "compliance", "zero-trust"],
        "tools": ["git", "aws", "docker"],
        "title_variants": ["Security Engineer", "AppSec Engineer", "Pentest Engineer"],
    },
    "product_manager": {
        "core_skills": ["roadmap", "agile", "scrum", "sql", "analytics"],
        "secondary": ["figma", "jira", "confluence", "a/b", "growth", "metrics"],
        "tools": ["excel", "tableau", "notion"],
        "title_variants": ["Product Manager", "Senior PM", "Product Lead", "Group PM"],
    },
}

SENIORITY_PROFILES: dict[str, dict] = {
    "junior": {
        "years_range": (0, 2),
        "label": "Junior",
        "signals": ["recent grad", "bootcamp", "internship", "entry-level", "0-2 years"],
    },
    "mid": {
        "years_range": (2, 5),
        "label": "Mid-Level",
        "signals": ["3 years", "4 years", "independent contributor", "2-4 years"],
    },
    "senior": {
        "years_range": (5, 10),
        "label": "Senior",
        "signals": ["5+ years", "senior", "tech lead", "mentors", "6-8 years"],
    },
    "staff": {
        "years_range": (10, 20),
        "label": "Staff / Principal",
        "signals": ["10+ years", "staff", "principal", "architect", "company-wide"],
    },
}
