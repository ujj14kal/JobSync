"""
JobSync AI Trainer v2 — MiniLM + Real Kaggle Data

Architecture:
  - all-MiniLM-L6-v2 as frozen encoder (pre-trained on 1B+ sentence pairs)
  - 5-head scorer trained on top of MiniLM embeddings
  - Real resume + JD data from public Kaggle datasets
  - Rule-based labels from category matching + skill overlap (no Groq needed)

Why better than v1:
  - Custom encoder trained on 3K synthetic pairs → MiniLM trained on 1B real pairs
  - Fake GPT-generated resumes → real human-written resumes
  - Random synthetic JDs → real job postings
  - Expected val_mae: <5 (vs 8.81 in v1)

Kaggle datasets required (add to kernel):
  - snehaanbhawal/resume-dataset
  - arashnic/linkedin-job-postings

Output: scorer.pt + tokenizer.json
(No encoder.pt — MiniLM is downloaded at inference time via sentence-transformers)
"""
import os, sys, json, math, re, time, random
from pathlib import Path
from datetime import datetime
from collections import defaultdict

OUTPUT_DIR = Path("/kaggle/working")

print("=" * 60)
print("JobSync AI Trainer v2 — MiniLM + Real Data")
print("=" * 60)

# Show all available input files for debugging
print("\nAvailable input files:")
for p in sorted(Path("/kaggle/input").rglob("*")):
    if p.is_file() and p.suffix in (".csv", ".json", ".jsonl"):
        print(f"  {p}  ({p.stat().st_size // 1024} KB)")

# ── Install deps ──────────────────────────────────────────────────────────────
os.system("pip install -q sentence-transformers pandas numpy torch")

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import pandas as pd

device = torch.device("cpu")
if torch.cuda.is_available():
    try:
        _t = torch.nn.Embedding(10, 8).cuda()
        _t(torch.zeros(2, dtype=torch.long).cuda())
        del _t
        device = torch.device("cuda")
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    except Exception as e:
        print(f"GPU incompatible — using CPU ({e})")
print(f"Device: {device}")

# ── Hyperparams ───────────────────────────────────────────────────────────────
if device.type == "cuda":
    SCORER_EPOCHS = 500
    SCORER_BATCH  = 256
    SCORER_LR     = 1e-4   # v7: lower LR — prevents divergence after warmup peak
    WARMUP_EPOCHS = 20
    N_PAIRS       = 12_000
    N_SYNTHETIC   = 3_000
else:
    SCORER_EPOCHS = 500
    SCORER_BATCH  = 64     # v7: smaller batch → better gradient estimates on CPU
    SCORER_LR     = 1e-4   # v7: was 1e-3, caused divergence at ep20-40 every run
    WARMUP_EPOCHS = 15     # v7: longer warmup — peak LR reached at ep15, not ep5
    N_PAIRS       = 4_000
    N_SYNTHETIC   = 2_000

print(f"Epochs={SCORER_EPOCHS}  Batch={SCORER_BATCH}  Pairs={N_PAIRS}")

# ── Category → tech domain mapping ───────────────────────────────────────────
# Maps resume dataset categories to job posting keywords for pairing
CATEGORY_MAP = {
    "Information-Technology": ["software", "developer", "engineer", "data", "devops", "fullstack", "backend", "frontend", "cloud", "ml", "ai"],
    "Data Science":           ["data scientist", "machine learning", "analytics", "ai engineer", "ml engineer"],
    "Developer":              ["software engineer", "developer", "programmer", "swe", "fullstack"],
    "Database":               ["database", "sql", "data engineer", "dba"],
    "Hadoop":                 ["data engineer", "big data", "spark", "hadoop"],
    "ETL Developer":          ["data engineer", "etl", "pipeline"],
    "DotNet Developer":       ["dotnet", ".net", "c#", "backend"],
    "Java Developer":         ["java", "backend", "spring", "jvm"],
    "Testing":                ["qa engineer", "test engineer", "quality assurance", "sdet"],
    "Python Developer":       ["python", "backend", "django", "fastapi"],
    "SAP Developer":          ["sap", "erp", "enterprise"],
    "Blockchain":             ["blockchain", "web3", "smart contract"],
    "Network Security Engineer": ["security engineer", "cybersecurity", "network"],
    "DevOps Engineer":        ["devops", "cloud", "infrastructure", "sre", "platform"],
    "PMO":                    ["project manager", "program manager", "product manager"],
    "Business Analyst":       ["business analyst", "product analyst", "strategy"],
    "Sales":                  ["sales", "account executive", "business development"],
    "HR":                     ["recruiter", "human resources", "talent"],
    "Finance":                ["finance", "financial analyst", "accounting"],
    "Accountant":             ["accountant", "finance", "bookkeeping"],
    "Operations Manager":     ["operations", "manager", "project manager"],
    "Arts":                   ["designer", "creative", "ux", "ui"],
    "Designer":               ["designer", "ux", "ui", "product design"],
    "Digital-Media":          ["marketing", "content", "social media", "digital"],
    "Healthcare":             ["healthcare", "medical", "clinical"],
    "Teacher":                ["teacher", "educator", "instructor"],
    "Agriculture":            ["agriculture", "farming"],
    "Aviation":               ["aviation", "pilot", "aerospace"],
    "Automobile":             ["automotive", "mechanical"],
    "Banking":                ["banking", "financial services", "investment"],
    "BPO":                    ["customer service", "support", "operations"],
    "Chef":                   ["chef", "culinary", "food"],
    "Construction":           ["construction", "civil", "project manager"],
    "Consultant":             ["consultant", "advisory"],
    "Fitness":                ["fitness", "trainer", "wellness"],
    "Advocate":               ["lawyer", "legal", "attorney"],
    "Public-Relations":       ["pr", "communications", "marketing"],
    "Apparel":                ["fashion", "retail", "apparel"],
}

# Adjacent category groups (medium match when paired)
ADJACENT_GROUPS = [
    {"Information-Technology", "Data Science", "Developer", "Python Developer", "Java Developer", "DotNet Developer", "Database", "Hadoop", "ETL Developer"},
    {"DevOps Engineer", "Network Security Engineer", "Blockchain"},
    {"Sales", "Business Analyst", "Operations Manager", "Consultant"},
    {"Finance", "Accountant", "Banking"},
    {"Arts", "Designer", "Digital-Media"},
    {"HR", "PMO", "Business Analyst"},
]

def get_category_group(cat):
    for g in ADJACENT_GROUPS:
        if cat in g:
            return frozenset(g)
    return frozenset({cat})

# ── Skill keyword bank ────────────────────────────────────────────────────────
TECH_SKILLS = {
    "python","java","javascript","typescript","golang","rust","scala","kotlin","swift",
    "c","cpp","sql","html","css","bash","shell","r","matlab",
    "react","nextjs","vuejs","angular","svelte","redux","graphql","webpack",
    "fastapi","django","flask","express","spring","grpc","kafka","rabbitmq","redis",
    "elasticsearch","tensorflow","pytorch","scikit","sklearn","pandas","numpy","spark",
    "aws","gcp","azure","docker","kubernetes","terraform","ansible","jenkins","github",
    "postgresql","mysql","mongodb","cassandra","firebase","supabase","pinecone",
    "linux","nginx","microservices","rest","api","git","ci","cd",
    "machine learning","deep learning","nlp","computer vision","llm","rag",
}

def skill_overlap(text1, text2):
    t1 = set(text1.lower().split())
    t2 = set(text2.lower().split())
    s1 = t1 & TECH_SKILLS
    s2 = t2 & TECH_SKILLS
    if not s2:
        return 0.5
    return len(s1 & s2) / len(s2)

def keyword_density(resume, jd):
    jd_words = {w for w in jd.lower().split() if len(w) > 4}
    res_words = set(resume.lower().split())
    if not jd_words:
        return 0.5
    return len(jd_words & res_words) / len(jd_words)

def has_metrics(text):
    return bool(re.search(r'\b\d+[%x]\b|\$\d+|\d+k\b|\d{3,}\s*(users|customers|requests)', text.lower()))

def has_projects(text):
    return bool(re.search(r'\bproject|github|portfolio|built|developed|launched\b', text.lower()))

def has_education(text):
    return bool(re.search(r'\bbachelor|master|phd|degree|university|college\b', text.lower()))

def has_leadership(text):
    return bool(re.search(r'\bled|managed|director|head of|vp |chief\b', text.lower()))

# ── Label generator (rule-based, no Groq needed) ──────────────────────────────
def generate_labels(resume_text, jd_text, match_level, resume_cat, jd_cat):
    """
    Generate 5-dim scores from structural signals.
    High/medium/low match level from category pairing sets the base range.
    Skill overlap, metrics, structure tune within that range.
    """
    so  = skill_overlap(resume_text, jd_text)
    kd  = keyword_density(resume_text, jd_text)
    met = has_metrics(resume_text)
    proj = has_projects(resume_text)
    edu  = has_education(resume_text)
    ldr  = has_leadership(resume_text)
    rlen = min(len(resume_text) / 2000, 1.0)

    if match_level == "high":
        sem   = random.uniform(72, 90) + so * 8
        tech  = random.uniform(70, 88) + so * 10
        ats   = random.uniform(65, 85) + (kd * 12) + (edu * 5)
        rec   = random.uniform(60, 82) + (met * 10) + (ldr * 6) + (rlen * 5)
        prj   = random.uniform(62, 85) + (proj * 10)
    elif match_level == "medium":
        sem   = random.uniform(42, 65) + so * 10
        tech  = random.uniform(38, 62) + so * 12
        ats   = random.uniform(45, 68) + (kd * 10) + (edu * 4)
        rec   = random.uniform(42, 68) + (met * 8) + (ldr * 5) + (rlen * 4)
        prj   = random.uniform(38, 62) + (proj * 8)
    else:  # low
        sem   = random.uniform(8, 35) + so * 8
        tech  = random.uniform(5, 32) + so * 10
        ats   = random.uniform(20, 48) + (kd * 8) + (edu * 4)
        rec   = random.uniform(22, 50) + (met * 6) + (ldr * 4) + (rlen * 3)
        prj   = random.uniform(8, 35) + (proj * 6)

    def clip(v): return round(min(100., max(0., v)), 1)
    return {
        "ats_score":                  clip(ats),
        "technical_fit_score":        clip(tech),
        "semantic_match_score":       clip(sem),
        "recruiter_impression_score": clip(rec),
        "project_relevance_score":    clip(prj),
    }

# ── Load datasets ─────────────────────────────────────────────────────────────
def load_resumes():
    path = Path("/kaggle/input/resume-dataset/Resume.csv")
    if not path.exists():
        for p in Path("/kaggle/input").rglob("Resume.csv"):
            path = p; break
    if not path.exists():
        print("⚠ Resume dataset not found — generating fallback")
        return None
    df = pd.read_csv(path)
    print(f"Loaded {len(df)} resumes, {df['Category'].nunique()} categories")
    print(f"Categories: {sorted(df['Category'].unique())}")
    return df

def load_jobs():
    # Search all CSV files under /kaggle/input for a job postings file
    candidates = sorted(Path("/kaggle/input").rglob("*.csv"), key=lambda p: p.stat().st_size, reverse=True)
    for p in candidates:
        if p.stat().st_size < 50_000:  # skip tiny files
            continue
        try:
            # Peek at columns
            sample = pd.read_csv(p, nrows=2)
            cols = set(sample.columns.str.lower())
            title_col = next((c for c in sample.columns if c.lower() in ("title","job_title","position")), None)
            desc_col  = next((c for c in sample.columns if c.lower() in ("description","job_description","body","text")), None)
            if not title_col or not desc_col:
                continue
            df = pd.read_csv(p, usecols=[title_col, desc_col], nrows=20000)
            df = df.rename(columns={title_col: "title", desc_col: "description"})
            df = df.dropna(subset=["title","description"])
            df = df[df["description"].astype(str).str.len() > 150]
            if len(df) < 100:
                continue
            print(f"Loaded {len(df)} job postings from {p.name} (title={title_col}, desc={desc_col})")
            return df
        except Exception as e:
            continue
    print("⚠ No job postings CSV found — using JD stubs from category keywords")
    return None

# ── Pair creation ─────────────────────────────────────────────────────────────
def create_pairs(resumes_df, jobs_df, n_pairs):
    """
    Creates BALANCED pairs: 35% high / 40% medium / 25% low.
    Enforces distribution by construction — never relies on category matching luck.
    """
    target_high   = int(n_pairs * 0.35)
    target_medium = int(n_pairs * 0.40)
    target_low    = int(n_pairs * 0.25)

    # Build resume pool by category
    by_cat = defaultdict(list)
    for _, row in resumes_df.iterrows():
        text = str(row.get("Resume_str", row.get("resume", ""))).strip()
        cat  = str(row.get("Category", "Information-Technology")).strip()
        if len(text) > 200:
            by_cat[cat].append(text[:3000])
    cats = list(by_cat.keys())
    all_resumes = [(cat, r) for cat, resumes in by_cat.items() for r in resumes]
    print(f"Resume pool: {len(all_resumes)} resumes across {len(cats)} categories")

    # Build JD pool — ALL job postings, no category filtering
    jd_pool = []  # list of (title_lower, jd_text)
    if jobs_df is not None:
        for _, row in jobs_df.sample(min(len(jobs_df), 5000), random_state=42).iterrows():
            title = str(row.get("title", ""))
            desc  = str(row.get("description", ""))[:2000]
            if len(desc) > 100:
                jd_pool.append((title.lower(), f"{title}\n\n{desc}"))
        print(f"JD pool: {len(jd_pool)} job postings")

    def _jd_for_cat(cat, require_match=True):
        """Get a JD that matches (or doesn't match) the given category."""
        kws = CATEGORY_MAP.get(cat, ["engineer"])
        if jd_pool:
            if require_match:
                matched = [jd for title, jd in jd_pool if any(k in title for k in kws)]
                if matched:
                    return random.choice(matched)
            else:
                # explicitly non-matching JD
                non_matched = [jd for title, jd in jd_pool if not any(k in title for k in kws)]
                if non_matched:
                    return random.choice(non_matched)
                # fallback: just pick a random one from a clearly different domain
                domain_kws = ["chef","nurse","teacher","accountant","driver","sales","lawyer","hr"]
                diff = [jd for title, jd in jd_pool if any(k in title for k in domain_kws)]
                return random.choice(diff) if diff else random.choice([jd for _, jd in jd_pool])
        # No job pool — build stub
        kws2 = CATEGORY_MAP.get(cat, ["software", "engineer"])
        return (f"{cat.replace('-',' ').title()} Role\n\n"
                f"Requirements:\n• Experience with {', '.join(kws2[:4])}\n"
                f"• Strong communication skills")

    pairs = []
    random.shuffle(all_resumes)

    # ── HIGH: same-category resume + matching JD ──────────────────────────────
    count = 0
    for cat, resume in all_resumes:
        if count >= target_high: break
        jd = _jd_for_cat(cat, require_match=True)
        pairs.append({"resume": resume, "jd": jd[:2000], "match_level": "high",
                      "resume_cat": cat, "jd_cat": cat,
                      **generate_labels(resume, jd, "high", cat, cat)})
        count += 1
    print(f"  High pairs: {count}")

    # ── MEDIUM: same category group, slightly mismatched JD ───────────────────
    count = 0
    random.shuffle(all_resumes)
    for cat1, resume in all_resumes:
        if count >= target_medium: break
        g1 = get_category_group(cat1)
        # Pick a category from same group but different
        adj = [c for c in cats if c != cat1 and get_category_group(c) == g1]
        cat2 = random.choice(adj) if adj else random.choice([c for c in cats if c != cat1])
        jd = _jd_for_cat(cat2, require_match=True)
        pairs.append({"resume": resume, "jd": jd[:2000], "match_level": "medium",
                      "resume_cat": cat1, "jd_cat": cat2,
                      **generate_labels(resume, jd, "medium", cat1, cat2)})
        count += 1
    print(f"  Medium pairs: {count}")

    # ── LOW: completely different domain JD ───────────────────────────────────
    count = 0
    random.shuffle(all_resumes)
    for cat1, resume in all_resumes:
        if count >= target_low: break
        g1 = get_category_group(cat1)
        # Force a JD from a completely different domain
        diff_cats = [c for c in cats if get_category_group(c) != g1]
        cat2 = random.choice(diff_cats) if diff_cats else random.choice([c for c in cats if c != cat1])
        jd = _jd_for_cat(cat2, require_match=False)
        pairs.append({"resume": resume, "jd": jd[:2000], "match_level": "low",
                      "resume_cat": cat1, "jd_cat": cat2,
                      **generate_labels(resume, jd, "low", cat1, cat2)})
        count += 1
    print(f"  Low pairs: {count}")

    random.shuffle(pairs)
    print(f"Total pairs: {len(pairs)}")
    return pairs

def create_fallback_pairs(n):
    """Fallback when Kaggle datasets not available — better than v1 (more diverse)."""
    ROLES = {
        "swe":      (["python","java","golang","fastapi","docker","kubernetes","postgresql","redis","kafka","aws"],
                     "Senior Software Engineer"),
        "frontend": (["react","typescript","nextjs","tailwind","css","javascript","jest","webpack","figma"],
                     "Frontend Engineer"),
        "data_sci": (["python","pandas","numpy","scikit","tensorflow","pytorch","sql","spark","airflow","mlflow"],
                     "Data Scientist"),
        "ml_eng":   (["pytorch","tensorflow","cuda","bert","transformers","onnx","mlflow","python","docker"],
                     "ML Engineer"),
        "devops":   (["kubernetes","terraform","ansible","github","prometheus","grafana","aws","gcp","linux","bash"],
                     "DevOps Engineer"),
        "mobile":   (["swift","kotlin","flutter","react-native","ios","android","firebase","xcode"],
                     "Mobile Engineer"),
        "security": (["penetration","vulnerability","siem","splunk","python","bash","aws","security","compliance"],
                     "Security Engineer"),
        "pm":       (["roadmap","stakeholders","agile","jira","analytics","a/b testing","sql","strategy"],
                     "Product Manager"),
    }
    SENIORITY = ["junior","mid","senior","staff"]
    VERBS = ["Built","Designed","Led","Optimized","Deployed","Scaled","Automated","Improved","Reduced","Shipped"]
    METRICS = ["by 40%","by 2x","for 50k+ users","saving $200k/year","with 99.9% uptime","cutting latency 60%"]

    def make_resume(role, sen, skills):
        yrs = {"junior":"1-2","mid":"3-5","senior":"6-10","staff":"10+"}.get(sen,"3-5")
        s = random.sample(skills, min(6, len(skills)))
        lines = [
            f"{'Senior' if sen in ('senior','staff') else ''} {ROLES[role][1]}\n",
            f"SUMMARY\n{sen.title()} engineer with {yrs} years. Expert in {', '.join(s[:3])}.\n",
            "EXPERIENCE\n",
        ]
        for _ in range(4):
            v = random.choice(VERBS); m = random.choice(METRICS)
            skill = random.choice(s)
            lines.append(f"• {v} {skill}-based system {m}")
        if sen in ("senior","staff"):
            lines.append(f"• Led team of {random.randint(3,12)} engineers")
        lines.append(f"\nSKILLS\n{', '.join(skills[:8])}")
        if random.random() > 0.3:
            lines.append(f"\nPROJECTS\nBuilt open-source {random.choice(s)} tool — {random.randint(100,5000)} GitHub stars")
        if random.random() > 0.4:
            lines.append(f"\nEDUCATION\nB.S. Computer Science — State University")
        return "\n".join(lines)

    def make_jd(role, sen, req_skills, extra_skills):
        yrs = {"junior":"1-2","mid":"3-5","senior":"5+","staff":"8+"}.get(sen,"3+")
        title = ROLES[role][1]
        lines = [
            f"{sen.title()} {title}\n",
            f"REQUIREMENTS\n• {yrs} years of experience",
        ]
        for s in req_skills[:5]: lines.append(f"• Strong proficiency in {s}")
        if sen in ("senior","staff"):
            lines.append("• Experience leading technical teams")
            lines.append("• Strong system design skills")
        if extra_skills:
            lines.append(f"\nNICE TO HAVE\n• {', '.join(extra_skills[:3])}")
        return "\n".join(lines)

    pairs = []
    role_list = list(ROLES.keys())
    for _ in range(n):
        sen = random.choice(SENIORITY)
        level = random.choices(["high","medium","low"], weights=[35,40,25])[0]
        role1 = random.choice(role_list)
        skills1, _ = ROLES[role1]

        if level == "high":
            role2 = role1
            req = random.sample(skills1, min(5, len(skills1)))
            extra = random.sample(skills1, min(2, len(skills1)))
        elif level == "medium":
            role2 = random.choice([r for r in role_list if r != role1])
            skills2, _ = ROLES[role2]
            # partial overlap
            req = random.sample(skills1, 2) + random.sample(skills2, 3)
            extra = []
        else:
            role2 = random.choice([r for r in role_list if r != role1])
            skills2, _ = ROLES[role2]
            req = random.sample(skills2, min(5, len(skills2)))
            extra = []

        res = make_resume(role1, sen, skills1)
        jd  = make_jd(role2, sen, req, extra)
        labels = generate_labels(res, jd, level, role1, role2)
        pairs.append({"resume": res, "jd": jd, "match_level": level,
                      "resume_cat": role1, "jd_cat": role2, **labels})

    random.shuffle(pairs)
    return pairs

# ── Load MiniLM ───────────────────────────────────────────────────────────────
print("\n▶ Loading all-MiniLM-L6-v2...")
t0 = time.monotonic()
from sentence_transformers import SentenceTransformer
MINILM = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
MINILM.to(device)
EMB_DIM = MINILM.get_sentence_embedding_dimension()  # 384
print(f"✓ MiniLM loaded  emb_dim={EMB_DIM}  {time.monotonic()-t0:.1f}s")

# ── Embed function ────────────────────────────────────────────────────────────
def embed_texts(texts, batch_size=128):
    """Encode a list of texts with MiniLM, returns (N, 384) numpy array."""
    return MINILM.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        device=str(device),
        normalize_embeddings=True,
    )

# ── Handcrafted feature extractor (same as ai_scorer.py) ─────────────────────
SKILLS_SET = {
    "python","java","javascript","typescript","react","sql","aws","docker",
    "kubernetes","tensorflow","pytorch","fastapi","django","golang","scala",
}

def hc_features(r_emb, j_emb, resume_text, jd_text):
    """10 handcrafted features — same logic as ai_scorer.py for consistency."""
    cosine = float(np.dot(r_emb, j_emb))
    rw = set(resume_text.lower().split())
    jw = set(jd_text.lower().split())
    rs = rw & SKILLS_SET; js = jw & SKILLS_SET
    ov  = len(rs & js) / max(len(js), 1) if js else 0.5
    kd  = len({w for w in jw if len(w) > 4} & rw) / max(len({w for w in jw if len(w) > 4}), 1)
    rl  = min(len(resume_text) / 3000, 1.0)
    jl  = min(len(jd_text) / 2000, 1.0)
    he  = float(any(k in resume_text.lower() for k in ["year","years","yr"]))
    edu = float(any(k in resume_text.lower() for k in ["bachelor","master","phd","degree"]))
    ldr = float(any(k in resume_text.lower() for k in ["led","managed","director","head"]))
    met = float(bool(re.search(r'\b\d+[%x]\b|\$\d+|\d{3,}', resume_text)))
    fw  = [w for w in (resume_text.strip().split('\n')[0] if resume_text.strip() else "").lower().split() if len(w)>3]
    ta  = sum(1 for w in fw if w in jd_text.lower()) / max(len(fw), 1)
    return np.array([cosine, ov, kd, rl, jl, he, edu, ldr, met, ta], dtype=np.float32)

# ── Scorer model ──────────────────────────────────────────────────────────────
INPUT_DIM = EMB_DIM * 4 + 10  # [r, j, |r-j|, r*j, hc] = 384*4 + 10 = 1546

class Scorer(nn.Module):
    """
    Lightweight scorer — ~120k params, appropriate for 4k-8k training samples.
    Smaller model + high dropout = better generalisation on limited data.
    """
    def __init__(self, inp=INPUT_DIM):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(inp, 256), nn.LayerNorm(256), nn.GELU(), nn.Dropout(0.4),
            nn.Linear(256, 128), nn.LayerNorm(128), nn.GELU(), nn.Dropout(0.3),
        )
        self.heads = nn.ModuleList([
            nn.Sequential(nn.Linear(128, 32), nn.GELU(), nn.Linear(32, 1), nn.Sigmoid())
            for _ in range(5)
        ])
        for n, p in self.named_parameters():
            if p.dim() > 1: nn.init.xavier_uniform_(p)
            elif "bias" in n: nn.init.zeros_(p)

    def forward(self, x):
        s = self.trunk(x)
        return torch.cat([h(s) * 100. for h in self.heads], dim=1)

    @property
    def n_params(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

# ── Ranking loss ──────────────────────────────────────────────────────────────
def rank_loss(pred, target, margin=5.0):
    op = pred.mean(1); ot = target.mean(1)
    n = op.shape[0]
    if n < 2: return torch.tensor(0., device=pred.device)
    i, j = torch.triu_indices(n, n, offset=1)
    diff_t = ot[i] - ot[j]
    diff_p = op[i] - op[j]
    loss = F.relu(margin - diff_p * diff_t.sign()) * (diff_t.abs() > margin).float()
    return loss.mean()

# ── Main training ──────────────────────────────────────────────────────────────
def build_dataset(pairs):
    print(f"\n▶ Embedding {len(pairs)} pairs with MiniLM...")
    t0 = time.monotonic()
    resumes = [p["resume"] for p in pairs]
    jds     = [p["jd"]     for p in pairs]
    r_embs  = embed_texts(resumes)
    j_embs  = embed_texts(jds)
    print(f"  Embedded in {time.monotonic()-t0:.1f}s")

    DIMS = ["ats_score","technical_fit_score","semantic_match_score",
            "recruiter_impression_score","project_relevance_score"]

    print("  Building feature vectors...")
    Xs, Ys = [], []
    for i, pair in enumerate(pairs):
        r_e = r_embs[i]; j_e = j_embs[i]
        hc  = hc_features(r_e, j_e, pair["resume"], pair["jd"])
        diff = np.abs(r_e - j_e)
        prod = r_e * j_e
        x = np.concatenate([r_e, j_e, diff, prod, hc])
        y = np.array([float(pair.get(d, 50.)) for d in DIMS], dtype=np.float32)
        Xs.append(x); Ys.append(y)

    Xt = torch.tensor(np.stack(Xs), dtype=torch.float32)
    Yt = torch.tensor(np.stack(Ys), dtype=torch.float32)
    print(f"  Dataset: {len(Xt)} samples, input_dim={Xt.shape[1]}")
    return Xt, Yt

def train_scorer(Xt, Yt):
    from torch.utils.data import DataLoader, TensorDataset, random_split
    print(f"\n▶ Training scorer ({SCORER_EPOCHS} epochs, batch={SCORER_BATCH})")

    nv  = max(64, int(len(Xt) * 0.1))
    nt  = len(Xt) - nv
    ds  = TensorDataset(Xt, Yt)
    tds, vds = random_split(ds, [nt, nv])
    tl  = DataLoader(tds, SCORER_BATCH, shuffle=True, drop_last=True)
    vl  = DataLoader(vds, SCORER_BATCH, shuffle=False)

    model = Scorer(Xt.shape[1]).to(device)
    print(f"  Scorer params: {model.n_params:,}")

    opt = torch.optim.AdamW(model.parameters(), lr=SCORER_LR, weight_decay=1e-4)

    # Warmup then cosine decay — prevents early divergence
    def lr_lambda(ep):
        if ep < WARMUP_EPOCHS:
            return (ep + 1) / WARMUP_EPOCHS          # linear warmup
        t = (ep - WARMUP_EPOCHS) / max(SCORER_EPOCHS - WARMUP_EPOCHS, 1)
        return 0.5 * (1 + math.cos(math.pi * t))    # cosine decay

    sch = torch.optim.lr_scheduler.LambdaLR(opt, lr_lambda)

    best, best_state, best_mae, patience = float("inf"), None, float("inf"), 0
    t0 = time.monotonic()

    for ep in range(1, SCORER_EPOCHS + 1):
        model.train()
        for X, y in tl:
            X, y = X.to(device), y.to(device)
            pred = model(X)
            loss = F.mse_loss(pred, y) + 0.15 * rank_loss(pred, y)
            opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
        sch.step()

        model.eval()
        vm, va = 0., 0.
        with torch.no_grad():
            for X, y in vl:
                X, y = X.to(device), y.to(device)
                p = model(X)
                vm += F.mse_loss(p, y).item()
                va += F.l1_loss(p, y).item()
        vm /= max(len(vl), 1); va /= max(len(vl), 1)

        if ep % 20 == 0 or ep == 1:
            print(f"  ep {ep:3d}/{SCORER_EPOCHS}  val_mse={vm:.2f}  val_mae={va:.2f}  lr={sch.get_last_lr()[0]:.2e}")

        if vm < best - 0.01:
            best = vm; best_mae = va
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience = 0
        else:
            patience += 1
            if patience >= 60:   # v7: more patience — low LR converges slowly
                print(f"  Early stop at ep={ep}")
                break

    model.load_state_dict(best_state)
    elapsed = time.monotonic() - t0
    print(f"✓ Scorer done  val_mse={best:.2f}  val_mae={best_mae:.2f}  {elapsed:.0f}s")
    return model, {"val_mse": round(best, 2), "val_mae": round(best_mae, 2), "epochs": ep}

# ── Run ───────────────────────────────────────────────────────────────────────
t_total = time.monotonic()

# Load datasets
resumes_df = load_resumes()
jobs_df    = load_jobs()

if resumes_df is not None:
    pairs = create_pairs(resumes_df, jobs_df, N_PAIRS)
    # Augment with synthetic for diversity — helps the model generalise
    print(f"\n▶ Adding {N_SYNTHETIC} synthetic pairs for augmentation...")
    pairs += create_fallback_pairs(N_SYNTHETIC)
    random.shuffle(pairs)
    data_source = "real-kaggle-datasets+synthetic"
else:
    print(f"⚠ Using fallback synthetic data ({N_PAIRS} pairs)")
    pairs = create_fallback_pairs(N_PAIRS)
    data_source = "synthetic-fallback"

hl = sum(1 for p in pairs if p["match_level"]=="high")
ml = sum(1 for p in pairs if p["match_level"]=="medium")
ll = sum(1 for p in pairs if p["match_level"]=="low")
print(f"Pair distribution — High:{hl}  Medium:{ml}  Low:{ll}")

# Print label stats
DIMS = ["ats_score","technical_fit_score","semantic_match_score","recruiter_impression_score","project_relevance_score"]
for d in DIMS:
    vals = [p[d] for p in pairs]
    print(f"  {d:35s}  mean={np.mean(vals):.1f}  std={np.std(vals):.1f}  min={min(vals):.0f}  max={max(vals):.0f}")

# Build dataset + train
Xt, Yt = build_dataset(pairs)
scorer, scr_meta = train_scorer(Xt, Yt)

# ── Save ──────────────────────────────────────────────────────────────────────
print("\n▶ Saving model files...")
torch.save({k: v.cpu() for k, v in scorer.state_dict().items()}, OUTPUT_DIR / "scorer.pt")

# tokenizer.json tells model_loader.py to use sentence-transformers at inference
tokenizer_config = {
    "type": "minilm",
    "model_name": "sentence-transformers/all-MiniLM-L6-v2",
    "emb_dim": EMB_DIM,
    "input_dim": INPUT_DIM,
    "version": 2,
}
(OUTPUT_DIR / "tokenizer.json").write_text(json.dumps(tokenizer_config, indent=2))

meta = {
    "trained_at":   datetime.utcnow().isoformat(),
    "version":      2,
    "encoder":      "sentence-transformers/all-MiniLM-L6-v2 (frozen)",
    "scorer":       scr_meta,
    "data_source":  data_source,
    "n_pairs":      len(pairs),
    "pair_dist":    {"high": hl, "medium": ml, "low": ll},
    "device":       str(device),
    "architecture": f"MiniLM-L6(frozen,384d)+Scorer3L×5heads(inp={INPUT_DIM})",
}
(OUTPUT_DIR / "model_meta.json").write_text(json.dumps(meta, indent=2))

print(f"\n{'='*60}")
print(f"✅ Training complete in {(time.monotonic()-t_total)/60:.1f} min")
print(f"   val_mse={scr_meta['val_mse']}  val_mae={scr_meta['val_mae']}")
print(f"   Data: {data_source}  Pairs: {len(pairs)}")
print(f"\n   Output files:")
for f in sorted(OUTPUT_DIR.iterdir()):
    print(f"     {f.name}  ({f.stat().st_size // 1024} KB)")
print(f"{'='*60}")
print("\nNext: download scorer.pt + tokenizer.json → upload to GitHub Release 'ai-model-latest'")
