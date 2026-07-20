"""
JobSync AI Trainer v5 — Calibrated Labels + Larger Context
==============================================================

Key improvements over v2:
  - Groq LLM labels every pair (not cosine similarity)
  - Balanced distribution: low/medium/high/perfect all represented
  - Diverse pairs: tech, non-tech, career changers, wrong-field
  - Focal loss — penalises errors on hard examples (extreme scores)
  - 400 epochs with early stopping + cosine LR annealing

Kaggle datasets (add to kernel input):
  - snehaanbhawal/resume-dataset
  - arashnic/linkedin-job-postings

Kaggle secret:
  - GROQ_API_KEY

Output: scorer.pt + tokenizer.json  (drop into backend/models/)
"""

import os, sys, json, math, re, time, random, hashlib
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict


# ── Logging helpers ────────────────────────────────────────────────────────────
_session_start = time.time()

def ts():
    """Wall-clock timestamp for log lines."""
    return datetime.now(timezone.utc).strftime("%H:%M:%S")

def elapsed_str(since=None):
    sec = time.time() - (since or _session_start)
    h, rem = divmod(int(sec), 3600)
    m, s   = divmod(rem, 60)
    return f"{h}h{m:02d}m{s:02d}s" if h else f"{m}m{s:02d}s"

def eta_str(done, total, since):
    if done == 0:
        return "?"
    rate = done / (time.time() - since)
    rem  = (total - done) / rate
    h, r = divmod(int(rem), 3600)
    m, s = divmod(r, 60)
    return f"{h}h{m:02d}m" if h else f"{m}m{s:02d}s"

def log(msg, sep=False):
    prefix = f"[{ts()}] "
    if sep:
        print(f"\n{prefix}{'─'*55}")
    print(f"{prefix}{msg}")

# ── Paths ──────────────────────────────────────────────────────────────────────
OUTPUT_DIR   = Path("/kaggle/working")
PAIRS_CACHE  = OUTPUT_DIR / "labeled_pairs.jsonl"  # incremental save (write target)
# Pre-labeled cache from previous run — loaded as a Kaggle dataset input
PAIRS_CACHE_INPUT = Path("/kaggle/input/jobsync-pairs-cache/labeled_pairs.jsonl")
MODEL_OUT    = OUTPUT_DIR / "scorer.pt"
TOKEN_OUT    = OUTPUT_DIR / "tokenizer.json"
META_OUT     = OUTPUT_DIR / "model_meta.json"

OUTPUT_DIR.mkdir(exist_ok=True)

print("=" * 65)
print("JobSync AI Trainer v5 — Fixed Label Distribution")
print(f"Session started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
print("=" * 65)

# ── Deps ───────────────────────────────────────────────────────────────────────
# P100 (sm_60) is incompatible with torch 2.2+ which requires sm_70+.
# Install 2.1.2+cu118 which is the last release supporting sm_60 with Python 3.12.
import subprocess as _sp, importlib as _il
_torch_install = _sp.run(
    [sys.executable, "-m", "pip", "install", "-q",
     "torch==2.1.2+cu118",
     "--index-url", "https://download.pytorch.org/whl/cu118"],
    capture_output=True, text=True
)
if _torch_install.returncode == 0:
    print("[GPU FIX] torch==2.1.2+cu118 installed — P100 sm_60 now supported")
else:
    print(f"[GPU FIX] torch reinstall failed (will use CPU): {_torch_install.stderr[:120]}")

os.system("pip install -q sentence-transformers openai")

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import pandas as pd
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
if DEVICE.type == "cuda":
    # Verify the GPU is actually usable with this PyTorch build (P100=sm_60 dropped in PyTorch 2.x)
    try:
        torch.zeros(1, device=DEVICE)   # will raise if sm_60 incompatible
        log(f"Device: cuda  GPU: {torch.cuda.get_device_name(0)}")
        mem_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
        log(f"GPU VRAM: {mem_gb:.1f} GB")
    except Exception as _gpu_err:
        log(f"GPU not usable with this PyTorch ({_gpu_err}) — falling back to CPU")
        DEVICE = torch.device("cpu")
if DEVICE.type == "cpu":
    log("Device: cpu  (training will be slower but correct)")

# ── OpenAI setup ───────────────────────────────────────────────────────────────
from kaggle_secrets import UserSecretsClient
OPENAI_API_KEY = UserSecretsClient().get_secret("OPENAI_API_KEY")
from openai import OpenAI
openai_client = OpenAI(api_key=OPENAI_API_KEY)
log("OpenAI client ready")

# ── Hyperparams ────────────────────────────────────────────────────────────────
TARGET_PAIRS   = 5_000    # 5K pairs — more categories now available
LABEL_BATCH    = 20       # unused but kept for reference
RPM_LIMIT      = 200      # GPT-4o-mini allows 500 RPM — use 200 to be safe
SCORER_EPOCHS  = 400
SCORER_BATCH   = 256 if DEVICE.type == "cuda" else 64
SCORER_LR      = 3e-4
WARMUP_EPOCHS  = 20
WEIGHT_DECAY   = 1e-4

# Target distribution of overall match level
DIST = {
    "none":    0.15,   # overall ~0-20
    "poor":    0.20,   # overall ~20-40
    "partial": 0.30,   # overall ~40-65
    "good":    0.25,   # overall ~65-82
    "perfect": 0.10,   # overall ~82-100
}

DIMENSION_NAMES = [
    "ats_score", "technical_fit_score", "semantic_match_score",
    "recruiter_impression_score", "project_relevance_score",
]

# ── Category taxonomy ──────────────────────────────────────────────────────────
TECH_CATS = {
    "Data Science":          ["machine learning","python","sql","pandas","tensorflow","pytorch","statistics"],
    "Python Developer":      ["python","django","flask","fastapi","rest api","postgresql","aws"],
    "Java Developer":        ["java","spring boot","microservices","maven","hibernate","kubernetes"],
    "Web Designing":         ["html","css","javascript","react","figma","responsive design","ux"],
    "DevOps Engineer":       ["docker","kubernetes","ci/cd","terraform","aws","jenkins","linux"],
    "Database":              ["sql","mysql","postgresql","oracle","mongodb","etl","data warehouse"],
    "Testing":               ["selenium","junit","pytest","test automation","qa","agile","jira"],
    "Hadoop":                ["hadoop","spark","hive","kafka","data pipeline","bigdata","scala"],
    "Blockchain":            ["solidity","ethereum","web3","smart contracts","defi","rust","cryptography"],
    "ETL Developer":         ["etl","informatica","talend","data warehouse","sql","python","aws glue"],
    "Mechanical Engineer":   ["autocad","solidworks","manufacturing","thermodynamics","fea","catia"],
    "Civil Engineer":        ["autocad","structural analysis","project management","construction","revit"],
    "Electrical Engineering":["circuit design","plc","matlab","power systems","embedded","vhdl"],
    "Network Security":      ["firewalls","penetration testing","siem","soc","nmap","vulnerability","cissp"],
    "PMO":                   ["project management","agile","scrum","pmp","stakeholder management","budget"],
    "Business Analyst":      ["requirements gathering","sql","jira","stakeholder","uml","user stories","tableau"],
    "Sales":                 ["crm","salesforce","lead generation","b2b","quota","pipeline","negotiation"],
    "HR":                    ["recruitment","onboarding","payroll","hris","employee relations","talent acquisition"],
    "Accountant":            ["accounting","tally","gst","financial reporting","audit","excel","taxation"],
    "Arts":                  ["photoshop","illustrator","creative direction","branding","typography","indesign"],
    "Advocate":              ["legal research","contract drafting","litigation","compliance","negotiation","ipc"],
    "Health and Fitness":    ["nutrition","physiology","personal training","wellness","anatomy","certification"],
    "Chef":                  ["food preparation","culinary arts","kitchen management","menu planning","haccp"],
    "Teacher":               ["lesson planning","curriculum","classroom management","assessment","pedagogy"],
    "Aviation":              ["aircraft maintenance","amos","faa","safety compliance","avionics","logbooks"],
    "Banking":               ["financial analysis","risk management","kyc","aml","credit","reconciliation"],
}

ADJACENT = {
    "Data Science":    ["ETL Developer","Hadoop","Database","Python Developer"],
    "Python Developer":["Web Designing","DevOps Engineer","Data Science","ETL Developer"],
    "Java Developer":  ["DevOps Engineer","Python Developer","Testing","Database"],
    "DevOps Engineer": ["Java Developer","Python Developer","Network Security","Database"],
    "Web Designing":   ["Python Developer","Arts","Business Analyst","Sales"],
    "Testing":         ["Java Developer","Python Developer","Business Analyst","Database"],
    "Database":        ["ETL Developer","Data Science","Hadoop","Business Analyst"],
    "Business Analyst":["PMO","Sales","Testing","Database","HR"],
    "HR":              ["Sales","PMO","Business Analyst","Accountant"],
    "Sales":           ["Business Analyst","HR","Banking","PMO"],
    "Banking":         ["Accountant","Business Analyst","Sales","HR"],
    "Accountant":      ["Banking","Business Analyst","HR","PMO"],
    "Network Security":["DevOps Engineer","Java Developer","ETL Developer"],
    "Blockchain":      ["Python Developer","DevOps Engineer","Data Science"],
    "Hadoop":          ["Data Science","ETL Developer","Database","Python Developer"],
    "PMO":             ["Business Analyst","HR","Sales","Civil Engineer"],
    "Mechanical Engineer":["Civil Engineer","Electrical Engineering","Aviation"],
    "Civil Engineer":  ["Mechanical Engineer","PMO","Electrical Engineering"],
    "Electrical Engineering":["Mechanical Engineer","Network Security","DevOps Engineer"],
}

def get_adjacent(cat):
    return ADJACENT.get(cat, [])

def get_far(cat):
    """Categories with essentially zero overlap."""
    far_map = {
        "Data Science":["Chef","Arts","Advocate","Teacher","Health and Fitness","Aviation"],
        "Python Developer":["Chef","Advocate","Teacher","Health and Fitness","Civil Engineer","Chef"],
        "Java Developer":["Chef","Arts","Advocate","Teacher","Health and Fitness","Accountant"],
        "Sales":["Blockchain","DevOps Engineer","Hadoop","Network Security","Aviation"],
        "HR":["Blockchain","DevOps Engineer","Hadoop","Network Security","Electrical Engineering"],
        "Accountant":["DevOps Engineer","Blockchain","Hadoop","Data Science","Network Security"],
        "Chef":["Data Science","Java Developer","DevOps Engineer","Network Security","Blockchain","Hadoop","ETL Developer"],
        "Teacher":["Data Science","Java Developer","DevOps Engineer","Network Security","Blockchain"],
        "Advocate":["Data Science","Java Developer","DevOps Engineer","Hadoop","Blockchain"],
        "Arts":["Java Developer","DevOps Engineer","Hadoop","Network Security","Blockchain","ETL Developer"],
        "Health and Fitness":["Data Science","Java Developer","DevOps Engineer","Blockchain","Network Security"],
        "Aviation":["Data Science","Python Developer","Sales","HR","Chef","Advocate"],
    }
    fallback = [c for c in TECH_CATS if c != cat and c not in get_adjacent(cat)]
    return far_map.get(cat, fallback[:6])

# ── Load datasets ──────────────────────────────────────────────────────────────
print("\nLoading datasets...")

# Resume dataset
resume_paths = list(Path("/kaggle/input").rglob("*.csv"))
print(f"Found CSVs: {[str(p) for p in resume_paths]}")

resume_dfs = []   # collect ALL resume CSVs and merge
jd_df      = None
jd2025_dfs = []   # list, not a single df — multiple datasets can match this branch
                   # (e.g. adityarajsrv's JD-2025 set AND shree0910's India tech jobs set
                   # both have title+description columns); a single variable would silently
                   # drop whichever one loads first.
naukri_df  = None

for p in resume_paths:
    try:
        df = pd.read_csv(p, low_memory=False)
        cols_lower = [c.lower() for c in df.columns]

        # ── Resume CSVs (Category + Resume text) ──────────────────────
        if "category" in cols_lower and any("resume" in c for c in cols_lower):
            df.columns = [c.lower() for c in df.columns]
            if "resume_str" in df.columns:
                df["resume"] = df["resume_str"]
            elif "resume" not in df.columns:
                r_col = next(c for c in df.columns if "resume" in c)
                df["resume"] = df[r_col]
            resume_dfs.append(df[["category","resume"]].copy())
            log(f"Resume CSV: {p.name} — {len(df)} rows, {df['category'].nunique()} cats")

        # ── LinkedIn postings — match by filename OR by content (title+description+job_posting_url)
        elif p.name == "postings.csv" or (
            "title" in cols_lower and "description" in cols_lower and "job_posting_url" in cols_lower
        ):
            jd_df = df
            jd_df.columns = [c.lower() for c in jd_df.columns]
            log(f"LinkedIn postings: {p.name} — {len(jd_df)} rows | cols: {list(jd_df.columns[:8])}")

        # ── Naukri.com postings (promptcloud/jobs-on-naukricom) ───────────────────
        # cols_lower uses spaces (not underscores), so check both forms
        elif any(c in cols_lower for c in ["key_skills", "key skills", "keyskills"]) and \
             any(c in cols_lower for c in ["role_category", "role category", "rolecategory",
                                           "functional_area", "functional area", "functionalarea"]):
            naukri_df = df
            naukri_df.columns = [c.lower().replace(" ", "_") for c in naukri_df.columns]
            log(f"Naukri dataset: {p.name} — {len(naukri_df)} rows | cols: {list(naukri_df.columns[:8])}")

        # ── JD 2025 dataset (adityarajsrv) — detect by columns, not filename
        # Columns vary: title/job_title + skills/responsibilities/description/job_description
        elif (
            any(c in cols_lower for c in ["title", "job_title"]) and
            any(c in cols_lower for c in ["skills", "skills_required", "responsibilities", "description", "job_description", "required_skills"]) and
            "job_posting_url" not in cols_lower and
            "category" not in cols_lower
        ):
            df.columns = [c.lower() for c in df.columns]
            jd2025_dfs.append(df)
            log(f"JD 2025-style dataset: {p.name} — {len(df)} rows | cols: {list(df.columns[:8])}")

    except Exception as e:
        log(f"Skipped {p.name}: {e}")

if jd_df is None:
    log("WARNING: LinkedIn postings dataset not detected — will rely on JD 2025 + synthetic JDs")
if not jd2025_dfs:
    log("WARNING: No JD 2025-style dataset detected — will rely on LinkedIn + synthetic JDs")
if not resume_dfs:
    raise RuntimeError("No resume datasets found. Add snehaanbhawal/resume-dataset and jillanisofttech/updated-resume-dataset to kernel inputs.")

# ── Hard requirement: the two India-specific datasets must have actually loaded ──
# Verified to exist on Kaggle before this run (promptcloud/jobs-on-naukricom: 30001 rows,
# shree0910/india-tech-job-market-2026-23k-records: 23202 rows). If either fails to load
# here it means a path/column-detection mismatch on Kaggle's side, not that the dataset
# doesn't exist — abort now, in the first ~30s, instead of discovering it after a full
# 2-hour labeling+training run with no India-specific vocabulary in the data.
if naukri_df is None:
    raise RuntimeError(
        "Naukri dataset (promptcloud/jobs-on-naukricom) did not load. "
        "Check it's attached under kernel Input Data, and that its columns still match "
        "the detection logic (expects 'Key Skills' + 'Role Category'/'Functional Area')."
    )
_india_tech_2026_loaded = any(
    "skill_domain" in df.columns or "salary_min_lpa" in df.columns for df in jd2025_dfs
)
if not _india_tech_2026_loaded:
    raise RuntimeError(
        "India Tech Jobs 2026 dataset (shree0910/india-tech-job-market-2026-23k-records) "
        "did not load. Check it's attached under kernel Input Data, and that its columns "
        "still match the detection logic (expects 'job_title' + 'skill_domain'/'salary_min_lpa')."
    )
log(f"India-specific datasets confirmed loaded: Naukri ({len(naukri_df)} rows), "
    f"India Tech Jobs 2026 (present in jd2025-style sources)")

# Merge all resume CSVs
resume_df = pd.concat(resume_dfs, ignore_index=True).drop_duplicates(subset=["resume"])
log(f"Total resumes after merge: {len(resume_df)} | categories: {resume_df['category'].nunique()}")

# Map resume dataset category names → TECH_CATS names
# Dataset uses uppercase hyphenated names; TECH_CATS uses human-readable names
RESUME_CAT_MAP = {
    # snehaanbhawal/resume-dataset (uppercase hyphenated)
    "INFORMATION-TECHNOLOGY":   "Python Developer",
    "DATA-SCIENCE":             "Data Science",
    "DESIGNER":                 "Web Designing",
    "WEB-DESIGNING":            "Web Designing",
    "DIGITAL-MEDIA":            "Web Designing",
    "TEACHER":                  "Teacher",
    "ADVOCATE":                 "Advocate",
    "BUSINESS-DEVELOPMENT":     "Business Analyst",
    "CONSULTANT":               "Business Analyst",
    "HR":                       "HR",
    "HEALTHCARE":               "Health and Fitness",
    "FITNESS":                  "Health and Fitness",
    "HEALTH AND FITNESS":       "Health and Fitness",
    "SALES":                    "Sales",
    "CHEF":                     "Chef",
    "FINANCE":                  "Banking",
    "BANKING":                  "Banking",
    "ACCOUNTANT":               "Accountant",
    "ARTS":                     "Arts",
    "APPAREL":                  "Arts",
    "AVIATION":                 "Aviation",
    "ENGINEERING":              "Mechanical Engineer",
    "MECHANICAL ENGINEER":      "Mechanical Engineer",
    "AUTOMOBILE":               "Mechanical Engineer",
    "CONSTRUCTION":             "Civil Engineer",
    "CIVIL ENGINEER":           "Civil Engineer",
    "PUBLIC-RELATIONS":         "Sales",
    "BPO":                      "Business Analyst",
    "AGRICULTURE":              "Teacher",
    "NETWORK SECURITY":         "Network Security",
    "DEVOPS ENGINEER":          "DevOps Engineer",
    "DATABASE":                 "Database",
    "TESTING":                  "Testing",
    "JAVA DEVELOPER":           "Java Developer",
    "ETL DEVELOPER":            "ETL Developer",
    "HADOOP":                   "Hadoop",
    "BLOCKCHAIN":               "Blockchain",
    "PMO":                      "PMO",
    "ELECTRICAL ENGINEERING":   "Electrical Engineering",
    # jillanisofttech/updated-resume-dataset (title case, direct names)
    "DATA SCIENCE":             "Data Science",
    "PYTHON DEVELOPER":         "Python Developer",
    "JAVA DEVELOPER":           "Java Developer",
    "WEB DESIGNING":            "Web Designing",
    "DEVOPS ENGINEER":          "DevOps Engineer",
    "NETWORK SECURITY ENGINEER":"Network Security",
    "AUTOMATION TESTING":       "Testing",
    "DOTNET DEVELOPER":         "Python Developer",   # closest available
    "SAP DEVELOPER":            "ETL Developer",       # closest available
    "OPERATIONS MANAGER":       "PMO",
    "HEALTH AND FITNESS":       "Health and Fitness",
    "HEALTH AND FITNES":        "Health and Fitness",
}

def normalize_cat(raw: str) -> str:
    key = raw.strip().upper().replace(" ", "-")
    # try exact then without hyphens
    if key in RESUME_CAT_MAP:
        return RESUME_CAT_MAP[key]
    key2 = raw.strip().upper()
    if key2 in RESUME_CAT_MAP:
        return RESUME_CAT_MAP[key2]
    # fallback: check if any TECH_CATS key matches case-insensitively
    for tc in TECH_CATS:
        if tc.upper() == raw.strip().upper():
            return tc
    return None   # unmapped — skip

# Build resume index by category
resume_by_cat = defaultdict(list)
unmapped_cats = set()
for _, row in resume_df.iterrows():
    raw_cat = str(row.get("category", "")).strip()
    cat     = normalize_cat(raw_cat)
    text    = str(row.get("resume", "")).strip()
    if cat and text and len(text) > 200:
        resume_by_cat[cat].append(text)
    elif not cat and raw_cat:
        unmapped_cats.add(raw_cat)

log(f"Resume categories mapped: {dict((k, len(v)) for k,v in sorted(resume_by_cat.items()))}")
if unmapped_cats:
    log(f"Unmapped resume categories (skipped): {unmapped_cats}")

# ── Title → TECH_CATS mapping (used by both LinkedIn + JD 2025 loaders) ───────
TITLE_TO_CAT = {
            "data scientist": "Data Science",   "data science": "Data Science",
            "machine learning": "Data Science", "ml engineer": "Data Science",
            "python": "Python Developer",       "django": "Python Developer",
            "fastapi": "Python Developer",      "flask": "Python Developer",
            "java": "Java Developer",           "spring": "Java Developer",
            "frontend": "Web Designing",        "web design": "Web Designing",
            "ui/ux": "Web Designing",           "react": "Web Designing",
            "devops": "DevOps Engineer",        "site reliability": "DevOps Engineer",
            "sre": "DevOps Engineer",           "kubernetes": "DevOps Engineer",
            "database": "Database",             "dba": "Database",
            "sql": "Database",                  "data engineer": "Database",
            "qa": "Testing",                    "quality assurance": "Testing",
            "test": "Testing",
            "network": "Network Security",      "security": "Network Security",
            "cybersecurity": "Network Security","penetration": "Network Security",
            "hadoop": "Hadoop",                 "spark": "Hadoop",
            "big data": "Hadoop",
            "etl": "ETL Developer",             "informatica": "ETL Developer",
            "blockchain": "Blockchain",         "solidity": "Blockchain",
            "project manager": "PMO",           "program manager": "PMO",
            "scrum master": "PMO",
            "business analyst": "Business Analyst","product owner": "Business Analyst",
            "sales": "Sales",                   "account executive": "Sales",
            "hr ": "HR",                        "human resource": "HR",
            "recruiter": "HR",                  "talent": "HR",
            "accountant": "Accountant",         "finance": "Banking",
            "banking": "Banking",               "credit": "Banking",
            "chef": "Chef",                     "culinary": "Chef",
            "teacher": "Teacher",               "educator": "Teacher",
            "lawyer": "Advocate",               "attorney": "Advocate",
            "mechanical": "Mechanical Engineer","manufacturing": "Mechanical Engineer",
            "civil engineer": "Civil Engineer", "structural": "Civil Engineer",
            "electrical": "Electrical Engineering","embedded": "Electrical Engineering",
            "aviation": "Aviation",             "aircraft": "Aviation",
            "fitness": "Health and Fitness",    "personal trainer": "Health and Fitness",
            "designer": "Web Designing",        "graphic design": "Arts",
            "artist": "Arts",
            # adityarajsrv 2025 titles
            "ethical hacker": "Network Security","penetration test": "Network Security",
            "operations manager": "PMO",         "solutions architect": "Python Developer",
            "site reliability": "DevOps Engineer","sre": "DevOps Engineer",
            "fintech": "Banking",                "financial engineer": "Banking",
            "ai ": "Data Science",               "prompt engineer": "Data Science",
            "game developer": "Java Developer",  "game engineer": "Java Developer",
            "ar/vr": "Web Designing",            "augmented reality": "Web Designing",
            "seo": "Web Designing",              "digital marketing": "Sales",
            "marketing": "Sales",                "content writer": "Sales",
            "copywriter": "Sales",               "robotics": "Electrical Engineering",
            "market research": "Business Analyst",
            "android": "Java Developer",         ".net": "Python Developer",
            "dotnet": "Python Developer",        "ios developer": "Java Developer",
            "mobile developer": "Java Developer","flutter": "Java Developer",
}
MAX_PER_CAT = 500  # cap per category to avoid memory issues

# Build JD index — use LinkedIn postings or synthetic JDs
jd_by_cat = defaultdict(list)
if jd_df is not None:
    title_col = next((c for c in jd_df.columns if "title" in c), None)
    desc_col  = next((c for c in jd_df.columns if "description" in c or "desc" in c), None)
    log(f"LinkedIn postings columns: {list(jd_df.columns[:10])}")
    log(f"LinkedIn rows: {len(jd_df)}")
    # Filter for India-based JDs — reduces vocabulary mismatch with Indian CV datasets
    if "location" in jd_df.columns:
        india_mask = jd_df["location"].fillna("").str.contains("India", case=False, na=False)
        n_india = int(india_mask.sum())
        if n_india >= 5000:
            jd_df = jd_df[india_mask].reset_index(drop=True)
            log(f"LinkedIn filtered to India locations: {len(jd_df)} rows")
        else:
            log(f"LinkedIn India rows only {n_india} — keeping all {len(jd_df)} rows")
    if title_col and desc_col:
        for _, row in jd_df.iterrows():
            title = str(row.get(title_col, "")).lower()
            desc  = str(row.get(desc_col,  "")).strip()
            if not desc or len(desc) < 100:
                continue
            matched = None
            for kw, cat in TITLE_TO_CAT.items():
                if kw in title:
                    matched = cat
                    break
            if matched and len(jd_by_cat[matched]) < MAX_PER_CAT:
                jd_by_cat[matched].append(desc[:1200])
        log(f"JD categories from LinkedIn: { {k: len(v) for k,v in jd_by_cat.items() if v} }")
    else:
        log(f"LinkedIn postings: could not find title/description cols — will use JD 2025 + synthetic")

# ── JD 2025-style datasets (adityarajsrv, shree0910 India tech jobs, any future additions) ──
# Processed as a list — see the note where jd2025_dfs is declared for why.
for _jd2025_df in jd2025_dfs:
    added_2025 = 0
    # Resolve column names flexibly — each dataset may use different naming conventions
    _title_col = next((c for c in ["title", "job_title", "position"] if c in _jd2025_df.columns), None)
    _skills_col = next((c for c in ["skills", "required_skills", "key_skills", "skills_required"] if c in _jd2025_df.columns), None)
    _resp_col   = next((c for c in ["responsibilities", "job_description", "description", "duties"] if c in _jd2025_df.columns), None)
    log(f"JD 2025-style columns resolved → title='{_title_col}' skills='{_skills_col}' resp='{_resp_col}'")
    for _, row in _jd2025_df.iterrows():
        title = str(row.get(_title_col, "") if _title_col else "").lower()
        skills = str(row.get(_skills_col, "") if _skills_col else "").strip()
        responsibilities = str(row.get(_resp_col, "") if _resp_col else "").strip()
        if not skills and not responsibilities:
            continue
        jd_text = f"Role: {row.get(_title_col,'') if _title_col else ''}. Skills required: {skills}. Responsibilities: {responsibilities}"
        if len(jd_text) < 100:
            continue
        matched = None
        for kw, cat in TITLE_TO_CAT.items():
            if kw in title:
                matched = cat
                break
        if matched and len(jd_by_cat[matched]) < MAX_PER_CAT:
            jd_by_cat[matched].append(jd_text[:1200])
            added_2025 += 1
    log(f"JD 2025-style added: {added_2025} JDs | categories now: { {k: len(v) for k,v in jd_by_cat.items() if v} }")

# ── Naukri.com JDs (Indian market — vocabulary directly matches Indian CV datasets) ──
if naukri_df is not None:
    added_naukri = 0
    # naukri_df.columns already normalized to lowercase_underscore at detection time
    _n_title  = next((c for c in ["job_title","jobtitle","title","position"] if c in naukri_df.columns), None)
    _n_desc   = next((c for c in ["job_description","jobdescription","description","job_summary"] if c in naukri_df.columns), None)
    _n_skills = next((c for c in ["key_skills","keyskills","skills","required_skills"] if c in naukri_df.columns), None)
    log(f"Naukri columns resolved → title='{_n_title}' desc='{_n_desc}' skills='{_n_skills}'")
    for _, row in naukri_df.iterrows():
        title  = str(row.get(_n_title,  "") if _n_title  else "").lower()
        desc   = str(row.get(_n_desc,   "") if _n_desc   else "").strip()
        skills = str(row.get(_n_skills, "") if _n_skills else "").strip()
        jd_text = f"{desc} Required Skills: {skills}".strip() if skills else desc
        if len(jd_text) < 100:
            continue
        matched = None
        for kw, cat in TITLE_TO_CAT.items():
            if kw in title:
                matched = cat
                break
        if matched and len(jd_by_cat[matched]) < MAX_PER_CAT:
            jd_by_cat[matched].append(jd_text[:1200])
            added_naukri += 1
    log(f"Naukri added: {added_naukri} JDs | categories now: { {k: len(v) for k,v in jd_by_cat.items() if v} }")
else:
    log("Naukri dataset not found — add promptcloud/jobs-on-naukricom to kernel inputs for Indian JD vocabulary")

# Fallback: synthetic JD templates for categories without real JDs
SYNTHETIC_JDS = {
    "Data Science": [
        "We are looking for a Data Scientist to join our analytics team. Responsibilities include building predictive models using Python, TensorFlow, and PyTorch. You will work with large datasets, conduct statistical analysis, and collaborate with engineering teams. Requirements: 3+ years experience, strong knowledge of machine learning algorithms, SQL, pandas, scikit-learn. Experience with cloud platforms (AWS/GCP) is a plus.",
        "Senior Data Scientist needed to lead ML initiatives. Must have deep expertise in NLP, computer vision, or time-series forecasting. Stack: Python, Spark, Kafka, MLflow, Databricks. PhD preferred. You'll mentor junior data scientists and drive model deployment to production.",
    ],
    "Python Developer": [
        "Backend Python Developer for a fast-growing SaaS company. Build RESTful APIs with FastAPI/Django, manage PostgreSQL databases, deploy on AWS. Must know: Python 3.10+, Docker, Redis, Celery. Experience with microservices architecture required. 3-5 years experience.",
        "Python Engineer to develop data pipelines and backend services. Tech stack: Python, Flask, SQLAlchemy, AWS Lambda, DynamoDB. You'll work in an agile team on high-throughput systems. Strong understanding of OOP, design patterns, and testing required.",
    ],
    "Java Developer": [
        "Java Software Engineer to build enterprise applications. Must have: Java 17+, Spring Boot, Hibernate, Maven, REST APIs. Experience with Kubernetes, CI/CD pipelines, and microservices required. Banking or fintech domain experience preferred. 4+ years.",
        "Senior Java Developer for core banking platform. Requirements: Java, Spring Framework, Oracle DB, SOAP/REST, JUnit, SonarQube. Knowledge of design patterns, SOLID principles, and Agile methodology. Experience with high-availability systems.",
    ],
    "Web Designing": [
        "Frontend Developer / Web Designer for digital agency. Must know HTML5, CSS3, JavaScript (ES6+), React, Figma. Pixel-perfect implementation from design mockups. Experience with responsive design, accessibility (WCAG), and performance optimization.",
        "UI/UX Designer with coding skills. Create wireframes, prototypes, and high-fidelity designs in Figma. Implement in React/Next.js. Strong understanding of user-centered design, typography, color theory. Experience with design systems.",
    ],
    "DevOps Engineer": [
        "DevOps Engineer to manage cloud infrastructure on AWS. Must know: Terraform, Docker, Kubernetes, Jenkins, GitHub Actions. Experience with monitoring (Prometheus, Grafana), logging (ELK stack), and incident response. Linux administration required.",
        "Site Reliability Engineer (SRE) to maintain 99.99% uptime. Stack: GCP, Kubernetes, Helm, Ansible, Python scripting. Design CI/CD pipelines, manage secrets, implement security best practices. On-call rotation required.",
    ],
    "Sales": [
        "B2B Sales Representative to drive revenue growth. Manage full sales cycle: prospecting, demos, negotiation, closing. CRM: Salesforce. Must have 3+ years B2B sales experience, strong communication skills, and track record of quota attainment.",
        "Enterprise Account Executive for SaaS product. Responsibilities: territory planning, executive-level presentations, contract negotiation. Experience selling to Fortune 500 companies preferred. OTE: ₹25-40 LPA.",
    ],
    "HR": [
        "HR Manager to oversee talent acquisition, onboarding, and employee relations. Must have: 5+ years HR experience, knowledge of employment law, HRIS systems (Workday/SAP), and strong interpersonal skills. MBA HR preferred.",
        "Technical Recruiter to source and hire software engineers. Must have experience with technical sourcing, coding assessments, and employer branding. Tools: LinkedIn Recruiter, Greenhouse, HackerRank.",
    ],
    "Accountant": [
        "Senior Accountant for a manufacturing company. Responsibilities: financial reporting, GST filing, accounts payable/receivable, audit support. Must know: Tally, SAP, Advanced Excel. CA Inter or B.Com with 5+ years experience.",
        "Finance Manager to lead budgeting, forecasting, and FP&A. Must have CA qualification, experience with ERP systems, and strong analytical skills. Proficiency in financial modeling and stakeholder reporting required.",
    ],
    "Chef": [
        "Head Chef for upscale restaurant in Mumbai. Responsibilities: menu design, kitchen management, food cost control, team supervision. Must have 8+ years culinary experience, expertise in modern Indian or continental cuisine. ServSafe certification required.",
        "Sous Chef for a 5-star hotel. Responsibilities include preparation of continental dishes, maintaining food quality standards, training kitchen staff. HACCP knowledge required.",
    ],
    "Teacher": [
        "High School Mathematics Teacher for CBSE school. Responsibilities: lesson planning, teaching grades 9-12, conducting exams. B.Ed required, 3+ years teaching experience preferred. Strong communication and classroom management skills.",
        "Primary School Teacher for international school. IB curriculum experience preferred. Must create engaging lesson plans, assess student progress, and collaborate with parents. Passionate about child development.",
    ],
    "Advocate": [
        "Corporate Lawyer for a leading law firm. Specialization in M&A, contract drafting, and corporate governance. LLB/LLM required with 5+ years experience. Must have excellent drafting skills and knowledge of Companies Act.",
        "Litigation Advocate for district court practice. Experience in civil and criminal litigation, drafting petitions, and representing clients. Enrolled with Bar Council. 3+ years independent practice.",
    ],
    "Network Security": [
        "Cybersecurity Analyst to monitor and protect enterprise networks. Must have: SIEM tools (Splunk/QRadar), IDS/IPS, vulnerability scanning (Nessus, Qualys), incident response. CISSP or CEH certification preferred.",
        "Penetration Tester for a security consulting firm. Conduct network, web application, and mobile pen tests. Tools: Metasploit, Burp Suite, Nmap. OSCP required. Write detailed security reports for clients.",
    ],
    "PMO": [
        "Project Manager for large-scale IT transformation. PMP certification required. Must manage multiple workstreams, stakeholder communications, risk management, and budget tracking. Agile/Scrum experience essential.",
        "Program Manager for digital banking initiatives. Responsibilities: roadmap planning, resource allocation, cross-functional coordination, executive reporting. 8+ years project management experience. PgMP preferred.",
    ],
    "Business Analyst": [
        "Business Analyst for fintech startup. Gather business requirements, write user stories, create process flow diagrams, and work closely with developers. Must know: Jira, Confluence, SQL, Figma for wireframing.",
        "Senior BA for ERP implementation project. Experience with SAP or Oracle ERP required. Conduct gap analysis, stakeholder workshops, and UAT. Strong documentation and presentation skills.",
    ],
    "Database": [
        "Database Administrator (DBA) for Oracle and PostgreSQL environments. Responsibilities: performance tuning, backup/recovery, security patching, query optimization. 5+ years DBA experience. Oracle DBA certification preferred.",
        "Data Engineer to build and maintain data pipelines. Must know: SQL, Python, Apache Airflow, dbt, Snowflake or BigQuery. Experience with data modeling and warehouse design.",
    ],
    "Testing": [
        "QA Automation Engineer to build test frameworks. Must have: Selenium, TestNG/JUnit, Python/Java, Postman for API testing. CI/CD integration experience (Jenkins/GitLab). ISTQB certification preferred.",
        "Performance Test Engineer. Tools: JMeter, Gatling, k6. Must design load tests, analyze bottlenecks, and work with developers on optimization. Experience with cloud-based testing environments.",
    ],
    "Banking": [
        "Credit Analyst for a private sector bank. Evaluate loan applications, conduct financial analysis, assess creditworthiness. Must know: financial statement analysis, credit underwriting, RBI guidelines. CA or MBA Finance.",
        "Risk Manager for NBFC. Responsibilities: model risk governance, credit risk analytics, regulatory compliance (Basel III). Strong Excel/Python skills. FRM certification preferred.",
    ],
    "Mechanical Engineer": [
        "Mechanical Design Engineer for automotive components. Must have: SolidWorks, AutoCAD, GD&T, FEA analysis. Experience with DFMEA and PPAP documentation. 4+ years in automotive sector.",
        "Manufacturing Engineer for precision machining facility. Responsibilities: process planning, tooling selection, quality control, Lean manufacturing. Knowledge of CNC programming and ISO 9001.",
    ],
    "Electrical Engineering": [
        "Electrical Design Engineer for industrial automation. Must know: PLC programming (Siemens/Allen Bradley), SCADA, AutoCAD Electrical. Experience with panel design and motor control systems.",
        "Embedded Systems Engineer. Responsibilities: firmware development in C/C++, RTOS, hardware bring-up. Experience with ARM Cortex, CAN/SPI/I2C protocols. PCB schematic review ability required.",
    ],
    "Civil Engineer": [
        "Structural Engineer for high-rise residential projects. Must know: STAAD Pro, AutoCAD, IS codes, RCC design. Site supervision experience required. 5+ years in structural consultancy.",
        "Project Engineer for infrastructure construction. Responsibilities: planning, BOQ preparation, contractor coordination, quality checks. Experience with highways or metro rail projects preferred.",
    ],
    "Hadoop": [
        "Big Data Engineer to build distributed data processing pipelines. Must have: Hadoop, Spark, Hive, HBase, Kafka. Experience with YARN, Oozie, and cloud platforms (AWS EMR/Azure HDInsight). Python/Scala scripting.",
        "Data Platform Engineer. Responsibilities: manage data lake infrastructure, optimize Spark jobs, implement data quality frameworks. Experience with Delta Lake, Databricks preferred.",
    ],
    "ETL Developer": [
        "ETL Developer for data warehousing project. Must know: Informatica PowerCenter or Talend, SQL, stored procedures, dimensional modeling. Experience with OLAP cubes and BI tools (Tableau/Power BI).",
        "Data Integration Specialist. Build ETL pipelines using Apache NiFi, AWS Glue, and Python. Must understand data lineage, master data management, and CDC (Change Data Capture).",
    ],
    "Blockchain": [
        "Blockchain Developer for DeFi protocol. Must have: Solidity, Ethereum, Hardhat/Truffle, Web3.js/ethers.js, IPFS. Experience with smart contract security auditing and gas optimization.",
        "Backend Engineer for Web3 startup. Build blockchain indexers, subgraphs (The Graph), and REST APIs integrating with smart contracts. Knowledge of Layer 2 solutions (Polygon, Arbitrum). Rust or Go experience a plus.",
    ],
    "Arts": [
        "Graphic Designer for creative agency. Must have: Adobe Photoshop, Illustrator, InDesign, After Effects. Strong portfolio of brand identity, print, and digital design work. Motion graphics experience preferred.",
        "Visual Designer for D2C brand. Create social media content, product packaging, and marketing materials. Proficiency in Canva, Figma, and Adobe Creative Suite. Understanding of brand guidelines.",
    ],
    "Health and Fitness": [
        "Personal Trainer and Nutrition Coach for premium fitness studio. ACE or NASM certification required. Experience designing personalized workout and diet plans. Strong knowledge of anatomy, physiology, and injury prevention.",
        "Wellness Coach for corporate wellness program. Deliver group fitness classes, stress management workshops, and individual health consultations. CPR certified. Experience with corporate clients preferred.",
    ],
    "Aviation": [
        "Aircraft Maintenance Engineer (AME) for commercial airline. DGCA license required. Must have experience with Boeing 737 or Airbus A320 maintenance. Knowledge of AMOS, TRAX, or other MRO software.",
        "Aviation Safety Officer. Conduct safety audits, investigate incidents, and ensure regulatory compliance (DGCA/FAA). Experience with SMS (Safety Management System) implementation. Airline operations background preferred.",
    ],
}

# Fill jd_by_cat with synthetic JDs for missing categories
for cat, jds in SYNTHETIC_JDS.items():
    if cat not in jd_by_cat or not jd_by_cat[cat]:
        jd_by_cat[cat] = jds
    else:
        jd_by_cat[cat].extend(jds)

# ── Smart JD truncation ─────────────────────────────────────────────────────
# Kept identical to backend/app/services/text_utils.py:smart_truncate_jd — a
# mismatch between how job text gets truncated at train time vs. production
# inference time would just recreate a version of the exact bug this fixes.
# See that file's docstring for the full rationale (confirmed root cause: a
# real Google internship posting had its "Minimum qualifications:" section
# start at character 3,417, well past a naive 2,000-char cutoff).
_JD_SECTION_MARKERS = [
    "minimum qualifications", "preferred qualifications", "required qualifications",
    "basic qualifications", "requirements:", "responsibilities:", "key responsibilities",
    "what you'll do", "what you will do", "about the job", "about the role",
    "role overview", "job description", "your role", "what you bring",
    "skills required", "required skills", "must have", "qualifications:",
    "duties and responsibilities", "job summary", "position summary",
    "what we're looking for", "who you are", "the impact you'll have",
]

def smart_truncate_jd(text, max_chars=2000, head_reserve=250):
    if not text or len(text) <= max_chars:
        return text
    lower = text.lower()
    earliest_idx = None
    for marker in _JD_SECTION_MARKERS:
        idx = lower.find(marker)
        if idx != -1 and (earliest_idx is None or idx < earliest_idx):
            earliest_idx = idx
    if earliest_idx is None or earliest_idx <= head_reserve:
        return text[:max_chars]
    head = text[:head_reserve].rstrip()
    remaining_budget = max_chars - len(head) - 5
    body = text[earliest_idx:earliest_idx + remaining_budget]
    return f"{head}\n...\n{body}"


def sample_resume(cat, exclude=None):
    pool = [r for r in resume_by_cat.get(cat, []) if r != exclude]
    if not pool:
        return None
    return random.choice(pool)

# ── Skill-coverage ranking for perfect-vs-good differentiation ────────────────
# "perfect" and "good" both draw from the same category, so without an actual
# structural difference between them, a labeler has nothing real to distinguish —
# it's asking it to tell apart two draws from the same distribution. This ranks
# resumes within each category by how many of that category's core skills they
# mention, so "perfect" pairs get a resume that genuinely covers the role's core
# skills and "good" pairs get one that's missing some of them.
_resume_ranked_cache: dict = {}

def _keyword_score(text: str, keywords: list) -> int:
    t = text.lower()
    return sum(1 for kw in keywords if kw in t)

def _ranked_resume_pool(cat: str) -> list:
    if cat not in _resume_ranked_cache:
        kws = TECH_CATS.get(cat, [])
        pool = resume_by_cat.get(cat, [])
        if not kws or len(pool) < 4:
            _resume_ranked_cache[cat] = None  # too small to rank meaningfully
        else:
            _resume_ranked_cache[cat] = sorted(pool, key=lambda r: _keyword_score(r, kws), reverse=True)
    return _resume_ranked_cache[cat]

def sample_strong_resume(cat, exclude=None):
    """Resume from the top half of this category's skill-keyword coverage — for 'perfect' pairs."""
    ranked = _ranked_resume_pool(cat)
    if ranked is None:
        return sample_resume(cat, exclude)
    pool = [r for r in ranked if r != exclude]
    if len(pool) < 4:
        return sample_resume(cat, exclude)
    top_half = pool[: max(len(pool) // 2, 1)]
    return random.choice(top_half)

def sample_weak_resume(cat, exclude=None):
    """Resume from the bottom half of this category's skill-keyword coverage — for 'good' pairs
    (a genuine partial skill gap, not just a different random draw from the same pool)."""
    ranked = _ranked_resume_pool(cat)
    if ranked is None:
        return sample_resume(cat, exclude)
    pool = [r for r in ranked if r != exclude]
    if len(pool) < 4:
        return sample_resume(cat, exclude)
    bottom_half = pool[max(len(pool) // 2, 1):] or pool
    return random.choice(bottom_half)

def sample_jd(cat, exclude=None):
    pool = [j for j in jd_by_cat.get(cat, []) if j != exclude]
    if not pool:
        pool = SYNTHETIC_JDS.get(cat, [])
    if not pool:
        return None
    return random.choice(pool)

# ── JD-vs-resume overlap ranking for perfect-vs-good differentiation ──────────
# The category-keyword-based resume ranking above (sample_strong_resume/sample_weak_resume)
# creates a real, verified difference (measured directly: ~3x keyword coverage gap between
# tiers) but GPT-4o-mini still scored "good" higher than "perfect" against it — it isn't
# reliably using resume-vs-abstract-checklist matching as its basis for scoring. This ranks
# JDs by actual word overlap with the SPECIFIC resume being paired, which is a much more
# direct signal: both texts are shown to the labeler together in the same prompt, so a real
# overlap difference between the two documents it's already reading is far more likely to
# register than a difference against a 7-word list it never sees. Stacked on top of the
# resume-side differentiation rather than replacing it, so both signals reinforce each other.
_jd_words_cache: dict = {}

def _overlap_words(text: str) -> set:
    if text not in _jd_words_cache:
        _jd_words_cache[text] = set(re.findall(r"\b[a-z]{4,}\b", text.lower()))
    return _jd_words_cache[text]

def _ranked_jd_pool_for_resume(cat: str, resume_text: str):
    pool = jd_by_cat.get(cat, []) or SYNTHETIC_JDS.get(cat, [])
    if len(pool) < 4:
        return None
    rw = _overlap_words(resume_text)
    return sorted(pool, key=lambda j: len(rw & _overlap_words(j)), reverse=True)

def sample_matching_jd(cat, resume_text, exclude=None):
    """JD from the top half of word-overlap with this specific resume — for 'perfect' pairs."""
    ranked = _ranked_jd_pool_for_resume(cat, resume_text)
    if ranked is None:
        return sample_jd(cat, exclude)
    pool = [j for j in ranked if j != exclude]
    if len(pool) < 4:
        return sample_jd(cat, exclude)
    top_half = pool[: max(len(pool) // 2, 1)]
    return random.choice(top_half)

def sample_mismatched_jd(cat, resume_text, exclude=None):
    """JD from the bottom half of word-overlap with this specific resume — for 'good' pairs
    (a real, measurable partial fit gap against this resume, not just any same-category JD)."""
    ranked = _ranked_jd_pool_for_resume(cat, resume_text)
    if ranked is None:
        return sample_jd(cat, exclude)
    pool = [j for j in ranked if j != exclude]
    if len(pool) < 4:
        return sample_jd(cat, exclude)
    bottom_half = pool[max(len(pool) // 2, 1):] or pool
    return random.choice(bottom_half)

# ── GPT-4o-mini labeling ───────────────────────────────────────────────────────
LABEL_SYSTEM = """You are scoring resume-to-job fit with 5 integer scores (0-100 each).
All 5 scores must reflect the SAME overall match quality — do not score dimensions independently.
If the overall match is strong (same field, similar role), ALL 5 scores must be 65-90.
If the overall match is weak (different industry), ALL 5 scores must be 5-20.
Never give 80 on one dimension and 10 on another for the same pair."""

LABEL_PROMPT = """Score this resume against this job description. Output 5 scores.

TARGET RANGES — pick the range that best describes the match, apply it to ALL 5 scores:
- Same role, strong skill match (e.g. Python dev → Python/Django job, skills align): 75-92
- Same role, moderate skills (e.g. Python dev → Python job, some tools differ): 58-74
- Adjacent domain (e.g. Java dev → Python role, Data Analyst → ML Engineer): 38-57
- Same industry, different function (e.g. HR → Sales, Civil → Mechanical): 18-37
- Completely different fields (e.g. Chef → Software, Teacher → Finance): 2-17

RESUME:
{resume}

JOB DESCRIPTION:
{jd}

Return ONLY valid JSON with integer scores 0-100:
{{"ats_score": <int>, "technical_fit_score": <int>, "semantic_match_score": <int>, "recruiter_impression_score": <int>, "project_relevance_score": <int>}}"""

# ── Cost tracking ──────────────────────────────────────────────────────────────
COST_CAP_USD    = 1.50          # hard stop — covers all 5000 pairs at 3000/2000 context
_total_usd      = 0.0
_total_in_tok   = 0
_total_out_tok  = 0
# gpt-4o-mini pricing
_PRICE_IN   = 0.15  / 1_000_000   # $ per input token
_PRICE_OUT  = 0.60  / 1_000_000   # $ per output token

_last_api_call  = 0.0

def label_pair(resume: str, jd: str, retries: int = 3) -> dict | None:
    """Label one resume+JD pair using GPT-4o-mini. Returns 5 scores or None on failure."""
    global _last_api_call, _total_usd, _total_in_tok, _total_out_tok

    # Hard cost cap — stop before spending more than allowed
    if _total_usd >= COST_CAP_USD:
        return "COST_CAP"

    # Throttle to RPM_LIMIT
    elapsed = time.time() - _last_api_call
    gap = 60.0 / RPM_LIMIT
    if elapsed < gap:
        time.sleep(gap - elapsed)

    prompt = LABEL_PROMPT.format(
        resume=resume[:3000].replace("{","(").replace("}",")"),
        jd=smart_truncate_jd(jd, 2000).replace("{","(").replace("}",")")
    )

    for attempt in range(retries):
        try:
            _last_api_call = time.time()
            resp = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": LABEL_SYSTEM},
                    {"role": "user",   "content": prompt},
                ],
                temperature=0.1,
                max_tokens=120,
                response_format={"type": "json_object"},
            )
            # Track exact cost from API usage
            in_tok  = resp.usage.prompt_tokens
            out_tok = resp.usage.completion_tokens
            call_cost = in_tok * _PRICE_IN + out_tok * _PRICE_OUT
            _total_in_tok  += in_tok
            _total_out_tok += out_tok
            _total_usd     += call_cost

            raw  = resp.choices[0].message.content.strip()
            data = json.loads(raw)
            scores = {}
            for dim in DIMENSION_NAMES:
                v = data.get(dim, 50)
                scores[dim] = float(v) if isinstance(v, (int, float)) else 50.0
            if all(0 <= scores[d] <= 100 for d in DIMENSION_NAMES):
                return scores
        except Exception as e:
            err_str = str(e)
            if "rate_limit" in err_str.lower():
                time.sleep(5)
            elif attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                log(f"  API error (attempt {attempt+1}): {e}")
    return None

# ── Pair generation ────────────────────────────────────────────────────────────
print("\nGenerating pairs plan...")

all_cats = [c for c in TECH_CATS if resume_by_cat.get(c)]
print(f"Categories with resumes: {len(all_cats)}")

# Target counts per match type
n_perfect  = int(TARGET_PAIRS * DIST["perfect"])
n_good     = int(TARGET_PAIRS * DIST["good"])
n_partial  = int(TARGET_PAIRS * DIST["partial"])
n_poor     = int(TARGET_PAIRS * DIST["poor"])
n_none     = int(TARGET_PAIRS * DIST["none"])

print(f"Target: perfect={n_perfect}, good={n_good}, partial={n_partial}, poor={n_poor}, none={n_none}")

def build_pairs():
    pairs = []

    # 1. PERFECT match — strong-coverage resume (sample_strong_resume) PLUS the
    # JD from that category with the highest actual word-overlap against THIS
    # specific resume (sample_matching_jd). Two independent, stacked signals
    # instead of one — both texts are shown to the labeler side-by-side, so the
    # JD-vs-resume overlap is a much more direct cue than resume-vs-checklist alone.
    for _ in range(n_perfect):
        cat = random.choice(all_cats)
        r = sample_strong_resume(cat)
        j = sample_matching_jd(cat, r) if r else None
        if r and j:
            pairs.append({"resume": r, "jd": j, "expected_level": "perfect", "resume_cat": cat, "jd_cat": cat})

    # 2. GOOD match — weak-coverage resume (sample_weak_resume) PLUS the JD from
    # that category with the LOWEST word-overlap against this resume
    # (sample_mismatched_jd) — a real, measurable partial gap on both axes,
    # structurally distinct from "perfect" instead of a coin-flip label on an
    # identical draw.
    for _ in range(n_good):
        cat = random.choice(all_cats)
        r = sample_weak_resume(cat)
        j = sample_mismatched_jd(cat, r) if r else None
        if r and j:
            pairs.append({"resume": r, "jd": j, "expected_level": "good", "resume_cat": cat, "jd_cat": cat})

    # 3. PARTIAL match — adjacent categories
    for _ in range(n_partial):
        cat1 = random.choice(all_cats)
        adj  = get_adjacent(cat1)
        if not adj:
            continue
        cat2 = random.choice(adj)
        r = sample_resume(cat1)
        j = sample_jd(cat2)
        if r and j:
            pairs.append({"resume": r, "jd": j, "expected_level": "partial", "resume_cat": cat1, "jd_cat": cat2})

    # 4. POOR match — non-adjacent tech categories
    for _ in range(n_poor):
        cat1 = random.choice(all_cats)
        far_cats = [c for c in all_cats if c not in get_adjacent(cat1) and c != cat1]
        if not far_cats:
            continue
        cat2 = random.choice(far_cats[:10])
        r = sample_resume(cat1)
        j = sample_jd(cat2)
        if r and j:
            pairs.append({"resume": r, "jd": j, "expected_level": "poor", "resume_cat": cat1, "jd_cat": cat2})

    # 5. NO match — completely different fields
    tech_cats_set = {"Data Science","Python Developer","Java Developer","DevOps Engineer","Web Designing",
                     "Testing","Database","Hadoop","ETL Developer","Blockchain","Network Security"}
    non_tech_cats_set = {"Chef","Teacher","Advocate","Arts","Health and Fitness","Aviation",
                         "Accountant","Sales","HR"}

    for _ in range(n_none):
        tech_cat    = random.choice([c for c in all_cats if c in tech_cats_set] or all_cats)
        non_tech    = random.choice(list(non_tech_cats_set))
        # Mix: tech resume → non-tech JD OR non-tech resume → tech JD
        if random.random() < 0.5:
            r = sample_resume(tech_cat)
            j = sample_jd(non_tech)
            pairs.append({"resume": r, "jd": j, "expected_level": "none",
                          "resume_cat": tech_cat, "jd_cat": non_tech})
        else:
            r = sample_resume(non_tech) if resume_by_cat.get(non_tech) else sample_resume(tech_cat)
            j = sample_jd(tech_cat)
            pairs.append({"resume": r, "jd": j, "expected_level": "none",
                          "resume_cat": non_tech, "jd_cat": tech_cat})

    pairs = [p for p in pairs if p.get("resume") and p.get("jd")]
    random.shuffle(pairs)
    return pairs

pairs = build_pairs()
print(f"Pairs built: {len(pairs)}")

# ── Label with Groq (incremental save) ─────────────────────────────────────────
# Load already-labeled pairs to resume interrupted run
# Reject pairs where overall_score < 1 — these came from a bad prompt run (all zeros)
labeled = []
seen_hashes = set()
stale_skipped = 0

# Check input dataset cache first (uploaded from prior run), then working dir
_cache_sources = [p for p in [PAIRS_CACHE_INPUT, PAIRS_CACHE] if p.exists()]
for _cache_path in _cache_sources:
    _before = len(labeled)
    with open(_cache_path) as f:
        for line in f:
            try:
                rec = json.loads(line)
                # Reject stale pairs: wrong label strategy (v4/v3 bad labels) or near-zero score
                if rec.get("label_strategy", "") != "gpt4o-mini-calibrated-v5":
                    stale_skipped += 1
                    continue
                if rec.get("overall_score", 0) < 1.0:
                    stale_skipped += 1
                    continue
                h = hashlib.md5((rec["resume"][:100]+rec["jd"][:100]).encode()).hexdigest()
                if h not in seen_hashes:
                    seen_hashes.add(h)
                    labeled.append(rec)
            except:
                pass
    log(f"Cache {_cache_path.name}: loaded {len(labeled)-_before} pairs (total {len(labeled)}, {stale_skipped} stale skipped)")

cache_file = open(PAIRS_CACHE, "a")

est_minutes = len(pairs) / RPM_LIMIT
log(f"Labeling {len(pairs)} pairs with gpt-4o-mini  (~{est_minutes:.0f} min at {RPM_LIMIT} RPM)", sep=True)
log(f"Estimated cost: ~${len(pairs)*0.000266:.2f} USD  (~₹{len(pairs)*0.000266*84:.0f})")

t_label = time.time()
errors     = 0
attempted  = 0     # pairs we actually sent to Groq (not skipped)

# ── Per-10 log state ───────────────────────────────────────────────────────────
_window_errors = 0   # errors in last 10 calls

MAX_ERROR_RATE   = 0.30   # abort labeling if >30% of calls fail (Groq issue)
LOG_EVERY        = 10     # log every N new labels

for i, pair in enumerate(pairs):
    h = hashlib.md5((pair["resume"][:100]+pair["jd"][:100]).encode()).hexdigest()
    if h in seen_hashes:
        continue

    attempted += 1
    scores = label_pair(pair["resume"], pair["jd"])

    if scores == "COST_CAP":
        log(f"COST CAP ${COST_CAP_USD:.2f} reached — stopping labeling with {len(labeled)} pairs")
        log(f"Total spent: ${_total_usd:.4f} USD  (~₹{_total_usd*84:.1f})")
        break

    if scores is None:
        errors += 1
        _window_errors += 1
        # Abort early if too many consecutive errors — don't burn the session
        if attempted >= 20 and errors / attempted > MAX_ERROR_RATE:
            log(f"ERROR RATE TOO HIGH ({errors}/{attempted} = {errors/attempted:.0%}) — aborting labeling")
            log("Check your OPENAI_API_KEY secret in Add-ons → Secrets on Kaggle.")
            break
        continue

    _window_errors = 0   # reset window on success

    overall = round(
        scores["ats_score"]*0.20 +
        scores["technical_fit_score"]*0.25 +
        scores["semantic_match_score"]*0.25 +
        scores["recruiter_impression_score"]*0.20 +
        scores["project_relevance_score"]*0.10, 1
    )

    record = {
        "resume": pair["resume"],
        "jd": pair["jd"],
        "resume_cat": pair["resume_cat"],
        "jd_cat": pair["jd_cat"],
        "expected_level": pair["expected_level"],
        "source": "gpt4o-mini-v5",
        "label_strategy": "gpt4o-mini-calibrated-v5",
        **scores,
        "overall_score": overall,
    }
    labeled.append(record)
    seen_hashes.add(h)
    cache_file.write(json.dumps(record) + "\n")
    cache_file.flush()

    n = len(labeled)
    if n % LOG_EVERY == 0:
        overalls   = [r["overall_score"] for r in labeled]
        avg_score  = sum(overalls) / len(overalls)
        score_min  = min(overalls)
        score_max  = max(overalls)
        spread     = score_max - score_min
        eta        = eta_str(attempted, len(pairs), t_label)
        err_pct    = f"{errors/max(attempted,1):.0%}"

        # Distribution across expected levels so far
        by_level = defaultdict(int)
        for r in labeled:
            by_level[r["expected_level"]] += 1

        log(
            f"Pair {n:4d}/{len(pairs)} | "
            f"ok={n} err={errors}({err_pct}) | "
            f"avg={avg_score:.1f} min={score_min:.0f} max={score_max:.0f} spread={spread:.0f} | "
            f"cost=${_total_usd:.3f}/₹{_total_usd*84:.0f} | "
            f"ETA {eta} | "
            f"dist: " + " ".join(f"{k}={v}" for k,v in sorted(by_level.items()))
        )
        # Dual calibration check: absolute floor + relative ratio.
        # Absolute ≥18 catches total collapse; ratio ≥1.8 ensures good/perfect
        # score meaningfully higher than none/poor regardless of scale compression.
        gp_new = [r["overall_score"] for r in labeled
                  if r.get("label_strategy") == "gpt4o-mini-calibrated-v5"
                  and r.get("expected_level") in ["good", "perfect"]]
        np_new = [r["overall_score"] for r in labeled
                  if r.get("label_strategy") == "gpt4o-mini-calibrated-v5"
                  and r.get("expected_level") in ["none", "poor"]]
        if len(gp_new) >= 30 and len(np_new) >= 15:
            gp_avg = sum(gp_new) / len(gp_new)
            np_avg = sum(np_new) / len(np_new)
            ratio  = gp_avg / max(np_avg, 1.0)
            if gp_avg < 18 or ratio < 1.8:
                cache_file.close()
                raise RuntimeError(
                    f"CALIBRATION FAILED — good/perfect avg={gp_avg:.1f} "
                    f"none/poor avg={np_avg:.1f} ratio={ratio:.2f} "
                    f"(need avg≥18 AND ratio≥1.8). Cost so far: ${_total_usd:.3f}"
                )
        # good-vs-perfect check: the combined gp_avg/ratio check above can't see this —
        # it treats good+perfect as one bucket, so it stays silent even if perfect
        # scores no higher than good (exactly what happened in the run that produced
        # bucket_ordering_monotonic=False). Catch it here, early, instead of finding
        # out only after a full training run.
        good_new = [r["overall_score"] for r in labeled
                    if r.get("label_strategy") == "gpt4o-mini-calibrated-v5"
                    and r.get("expected_level") == "good"]
        perfect_new = [r["overall_score"] for r in labeled
                       if r.get("label_strategy") == "gpt4o-mini-calibrated-v5"
                       and r.get("expected_level") == "perfect"]
        if len(good_new) >= 30 and len(perfect_new) >= 30:
            good_avg = sum(good_new) / len(good_new)
            perfect_avg = sum(perfect_new) / len(perfect_new)
            log(f"  good avg={good_avg:.1f}  perfect avg={perfect_avg:.1f}  (perfect must be >good)")
            if perfect_avg <= good_avg:
                cache_file.close()
                raise RuntimeError(
                    f"CALIBRATION FAILED — perfect avg={perfect_avg:.1f} is not higher than "
                    f"good avg={good_avg:.1f}. The labeler isn't distinguishing these tiers. "
                    f"Cost so far: ${_total_usd:.3f}"
                )
        # Extra warning if scores look degenerate
        if n >= 50 and spread < 30:
            log(f"  ⚠ LOW SPREAD ({spread:.0f}pts) — model may be defaulting. Check prompt.")

    # Milestone banners every 250 pairs
    if n > 0 and n % 250 == 0:
        log(f"{'─'*55}", sep=False)
        log(f"MILESTONE: {n} pairs labeled in {elapsed_str(t_label)}")
        log(f"{'─'*55}", sep=False)

cache_file.close()
log(f"Labeling phase done in {elapsed_str(t_label)}  ({len(labeled)} labeled, {errors} errors)", sep=True)
log(f"OpenAI cost: ${_total_usd:.4f} USD  (~₹{_total_usd*84:.1f})  |  tokens: {_total_in_tok:,} in / {_total_out_tok:,} out")

# ── Score distribution check + quality gate ────────────────────────────────────
log(f"Final labeled count: {len(labeled)}", sep=True)
overalls = [r["overall_score"] for r in labeled]
buckets = {"0-20":0,"21-40":0,"41-60":0,"61-80":0,"81-100":0}
for s in overalls:
    if s <= 20: buckets["0-20"] += 1
    elif s <= 40: buckets["21-40"] += 1
    elif s <= 60: buckets["41-60"] += 1
    elif s <= 80: buckets["61-80"] += 1
    else: buckets["81-100"] += 1
log(f"Score buckets: {buckets}")
log(f"Overall: min={min(overalls):.1f}  max={max(overalls):.1f}  mean={sum(overalls)/len(overalls):.1f}  spread={max(overalls)-min(overalls):.1f}")

# Per-dimension stats
log("Per-dimension means:")
for dim in DIMENSION_NAMES:
    vals = [r[dim] for r in labeled]
    log(f"  {dim:<35s} mean={sum(vals)/len(vals):.1f}  min={min(vals):.0f}  max={max(vals):.0f}")

# ── QUALITY GATE — abort before wasting GPU time on bad data ──────────────────
GATE_MIN_PAIRS  = 200    # need at least 200 pairs
GATE_MIN_SPREAD = 55     # score range must be > 55 pts — with good labels expect 70+
GATE_MAX_MIDPILE = 0.65  # no more than 65% of scores in [35-65] band (means Groq defaulted)

quality_ok = True
spread = max(overalls) - min(overalls)
mid_pile = sum(1 for s in overalls if 35 <= s <= 65) / len(overalls)

if len(labeled) < GATE_MIN_PAIRS:
    log(f"QUALITY GATE FAIL: only {len(labeled)} pairs (need {GATE_MIN_PAIRS}). Aborting training.")
    log("Re-run to accumulate more data — pairs are cached and will resume.")
    quality_ok = False

if spread < GATE_MIN_SPREAD:
    log(f"QUALITY GATE FAIL: score spread is only {spread:.1f}pts (need >{GATE_MIN_SPREAD}).")
    log("Groq is likely defaulting to mid-range scores. Check the LABEL_PROMPT or retry.")
    quality_ok = False

if mid_pile > GATE_MAX_MIDPILE:
    log(f"QUALITY GATE FAIL: {mid_pile:.0%} of scores are clustered in [35-65] (max {GATE_MAX_MIDPILE:.0%}).")
    log("Calibration prompt did not produce enough score variation. Not training.")
    quality_ok = False

# Per-level sanity check — "perfect" must score higher than "none"
perfect_scores = [r["overall_score"] for r in labeled if r.get("expected_level") == "perfect"]
none_scores    = [r["overall_score"] for r in labeled if r.get("expected_level") == "none"]
if perfect_scores and none_scores:
    perf_avg = sum(perfect_scores) / len(perfect_scores)
    none_avg = sum(none_scores)    / len(none_scores)
    log(f"Per-level check: perfect avg={perf_avg:.1f}  none avg={none_avg:.1f}")
    # Use ratio-based gate — robust to scale compression from Indian-CV vs US-JD vocabulary mismatch.
    ratio_pn = perf_avg / max(none_avg, 1.0)
    log(f"perfect/none ratio: {ratio_pn:.2f}x")
    if perf_avg < 20:
        log(f"QUALITY GATE FAIL: 'perfect' pairs averaging only {perf_avg:.1f} (expected ≥20). Calibration incomplete.")
        quality_ok = False
    if none_avg > 35:
        log(f"QUALITY GATE FAIL: 'none' pairs averaging {none_avg:.1f} (expected ≤35). Model won't learn mismatches.")
        quality_ok = False
    if ratio_pn < 2.0:
        log(f"QUALITY GATE FAIL: perfect/none ratio only {ratio_pn:.2f}x (need ≥2.0x). Labels not discriminative enough.")
        quality_ok = False

if not quality_ok:
    raise RuntimeError("Quality gate failed — not training on bad data. See logs above.")

log(f"Quality gate PASSED  (spread={spread:.1f}pts, mid-pile={mid_pile:.0%}, n={len(labeled)})")

# ── Rescale labels to 0-100 ────────────────────────────────────────────────────
# GPT scores are compressed to 5-85 due to Indian-CV vs US-JD vocabulary mismatch.
# Linear rescale using dataset min/max so the model outputs the full 0-100 range
# in production. Relative ordering is fully preserved.
_all_dims = DIMENSION_NAMES + ["overall_score"]
# Use global min/max across ALL dimensions so no score goes negative
_all_scores = [r[d] for r in labeled for d in _all_dims]
_score_min  = min(_all_scores)
_score_max  = max(_all_scores)
if _score_max > _score_min:
    _range = _score_max - _score_min
    for r in labeled:
        for _d in _all_dims:
            r[_d] = round(max(0.0, min(100.0, (r[_d] - _score_min) / _range * 100)), 1)
    log(f"Labels rescaled: [{_score_min:.1f}, {_score_max:.1f}] → [0, 100]  (global across all dims)")
else:
    log("WARNING: score range is zero — skipping rescale")
# Refresh overalls list so metadata + quality reporting reflects rescaled values
overalls = [r["overall_score"] for r in labeled]

# ── Model architecture ─────────────────────────────────────────────────────────
EMB_DIM = 384   # all-MiniLM-L6-v2
HC_DIM  = 10
INP_DIM = EMB_DIM * 4 + HC_DIM  # 1546

class ResidualBlock(nn.Module):
    def __init__(self, dim, dropout=0.2):
        super().__init__()
        self.block = nn.Sequential(
            nn.Linear(dim, dim), nn.LayerNorm(dim), nn.GELU(), nn.Dropout(dropout),
            nn.Linear(dim, dim), nn.LayerNorm(dim),
        )
        self.act = nn.GELU()

    def forward(self, x):
        return self.act(x + self.block(x))


class JobSyncScorerV3(nn.Module):
    """
    MiniLM(384d) + cross-interaction + residual trunk + 5 independent heads.
    Input: 1546-dim interaction vector.
    Output: 5 scores in [0, 100].
    """
    def __init__(self):
        super().__init__()
        self.proj = nn.Sequential(
            nn.Linear(INP_DIM, 768), nn.LayerNorm(768), nn.GELU(), nn.Dropout(0.3),
        )
        self.trunk = nn.Sequential(
            ResidualBlock(768, dropout=0.25),
            nn.Linear(768, 512), nn.LayerNorm(512), nn.GELU(), nn.Dropout(0.2),
            ResidualBlock(512, dropout=0.2),
            nn.Linear(512, 256), nn.LayerNorm(256), nn.GELU(), nn.Dropout(0.15),
            ResidualBlock(256, dropout=0.15),
        )
        self.heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(256, 128), nn.GELU(), nn.Dropout(0.1),
                nn.Linear(128, 64), nn.GELU(),
                nn.Linear(64, 1), nn.Sigmoid(),
            ) for _ in range(5)
        ])

    def forward(self, x):
        x = self.proj(x)
        x = self.trunk(x)
        return torch.cat([h(x) * 100 for h in self.heads], dim=1)


# ── Handcrafted features (must match ai_scorer.py exactly) ────────────────────
SKILLS_SET = {
    # Global tech
    "python","java","javascript","typescript","react","sql","aws","docker",
    "kubernetes","tensorflow","pytorch","fastapi","django","golang","scala",
    "spark","kafka","redis","mongodb","postgresql","mysql","html","css",
    "spring","microservices","rest","api","git","linux","agile","scrum",
    # Indian market tech vocabulary
    "tally","erp","sap","gst","tds","mis","vba","excel","tableau","powerbi",
    "autocad","solidworks","catia","ansys","matlab","plc","scada","revit",
    "photoshop","illustrator","corel","figma","canva","wordpress","php","laravel",
    "dotnet","c#","angular","vue","jquery","bootstrap","selenium","appium",
    "oracle","sybase","db2","informatica","talend","pentaho","qlikview",
    "hadoop","hive","pig","mapreduce","nifi","airflow","mlflow","databricks",
    "azure","gcp","jenkins","ansible","terraform","puppet","chef","nagios",
    "nmap","metasploit","burpsuite","wireshark","splunk","qradar","nessus",
    "ipc","crpc","companies","rbi","sebi","rera","fema","gstin","audit",
    "haccp","fssai","iso","lean","sixsigma","kaizen","dmaic","pmbok","prince2",
}

def hc_features(r_emb, j_emb, res_txt, jd_txt):
    r = np.array(r_emb, dtype=np.float32)
    j = np.array(j_emb, dtype=np.float32)
    res_w = set(re.findall(r'\b\w+\b', res_txt.lower()))
    jd_w  = set(re.findall(r'\b\w+\b', jd_txt.lower()))
    res_s = res_w & SKILLS_SET
    jd_s  = jd_w  & SKILLS_SET
    cosine = float(np.dot(r, j) / (np.linalg.norm(r) * np.linalg.norm(j) + 1e-8))
    ov  = len(res_s & jd_s) / max(len(jd_s), 1) if jd_s else 0.0
    kd  = len({w for w in jd_w if len(w) > 4} & res_w) / max(len({w for w in jd_w if len(w) > 4}), 1)
    rl  = min(len(res_txt) / 3000, 1.0)
    jl  = min(len(jd_txt)  / 2000, 1.0)
    he  = float(any(k in res_txt.lower() for k in ["year", "years", "yr"]))
    edu = float(any(k in res_txt.lower() for k in ["bachelor", "master", "phd", "degree", "b.tech", "m.tech"]))
    ldr = float(any(k in res_txt.lower() for k in ["led", "managed", "director", "head", "founded"]))
    met = float(bool(re.search(r'\b\d+[%x]\b|\$\d+|₹\d+|\d+\s*(lpa|lakh|million|k\b)', res_txt.lower())))
    fw  = [w for w in (res_txt.strip().split('\n')[0] if res_txt.strip() else "").lower().split() if len(w) > 3]
    ta  = sum(1 for w in fw if w in jd_txt.lower()) / max(len(fw), 1)
    return np.array([cosine, ov, kd, rl, jl, he, edu, ldr, met, ta], dtype=np.float32)


def build_x(r_emb, j_emb, res_txt, jd_txt):
    import torch
    r = torch.tensor(r_emb, dtype=torch.float32)
    j = torch.tensor(j_emb, dtype=torch.float32)
    diff = (r - j).abs()
    prod = r * j
    hc   = torch.tensor(hc_features(r_emb, j_emb, res_txt, jd_txt))
    return torch.cat([r, j, diff, prod, hc])


# ── Dataset ────────────────────────────────────────────────────────────────────
log("Loading sentence-transformers encoder...", sep=True)
from sentence_transformers import SentenceTransformer
encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2").to(DEVICE)
encoder.eval()

class PairDataset(Dataset):
    def __init__(self, records, encoder):
        self.X = []
        self.y = []
        self.levels = []   # expected_level, kept in lockstep with X/y so skipped
                            # records never desync it from accuracy/bucket reports
        skipped = 0
        skip_errors: dict[str, int] = {}
        print(f"  Building dataset from {len(records)} records...")

        # Batch encode for speed
        batch_size = 512
        all_texts  = []
        for rec in records:
            all_texts.append(rec["resume"][:2000])
            all_texts.append(rec["jd"][:1500])

        print(f"  Encoding {len(all_texts)} texts in batches of {batch_size}...")
        all_embs = encoder.encode(
            all_texts, batch_size=batch_size,
            normalize_embeddings=True, show_progress_bar=True,
            device=DEVICE.type,
        )

        for i, rec in enumerate(records):
            try:
                r_emb = all_embs[i*2].tolist()
                j_emb = all_embs[i*2+1].tolist()
                x = build_x(r_emb, j_emb, rec["resume"], rec["jd"])
                y = torch.tensor([float(rec[d]) for d in DIMENSION_NAMES], dtype=torch.float32)
                self.X.append(x)
                self.y.append(y)
                self.levels.append(rec.get("expected_level", "unknown"))
            except Exception as e:
                skipped += 1
                err_key = f"{type(e).__name__}: {e}"
                skip_errors[err_key] = skip_errors.get(err_key, 0) + 1

        if skipped:
            print(f"  Skipped {skipped} records (encoding errors):")
            for err, count in sorted(skip_errors.items(), key=lambda kv: -kv[1])[:5]:
                print(f"    {count}x  {err}")
        print(f"  Dataset ready: {len(self.X)} samples")

    def __len__(self):  return len(self.X)
    def __getitem__(self, i): return self.X[i], self.y[i]


# ── Loss ───────────────────────────────────────────────────────────────────────
def focal_mse(pred, target, gamma=2.0):
    """MSE weighted by how far predictions are from targets (focus on hard examples)."""
    mse_per  = (pred - target) ** 2
    weight   = (mse_per.detach() / (mse_per.detach().mean() + 1e-8)).clamp(0, 5) ** gamma
    return (weight * mse_per).mean()


def ranking_loss(preds, targets, margin=5.0):
    """Vectorized pairwise ranking loss — O(n²) tensor ops instead of Python loops."""
    overall_p = preds.mean(dim=1)
    overall_t = targets.mean(dim=1)
    # diff[i,j] = t[i] - t[j];  mask[i,j]=True when i should rank higher than j
    diff_t = overall_t.unsqueeze(1) - overall_t.unsqueeze(0)
    diff_p = overall_p.unsqueeze(1) - overall_p.unsqueeze(0)
    mask   = diff_t > margin                                   # (n,n), asymmetric
    violation = torch.clamp(-diff_p + 1.0, min=0.0)           # penalise wrong ordering
    count  = mask.float().sum().clamp(min=1.0)
    return (violation * mask.float()).sum() / count


def combined_loss(pred, target):
    return focal_mse(pred, target) + 0.15 * ranking_loss(pred, target)


# ── Train ──────────────────────────────────────────────────────────────────────
random.shuffle(labeled)
split = int(len(labeled) * 0.9)
train_records = labeled[:split]
val_records   = labeled[split:]

log(f"Train/val split: {len(train_records)} train / {len(val_records)} val", sep=True)
t_enc = time.time()
log(f"Encoding train set ({len(train_records)} records)...")
train_ds = PairDataset(train_records, encoder)
log(f"Encoding val set ({len(val_records)} records)...")
val_ds   = PairDataset(val_records, encoder)
log(f"Encoding done in {elapsed_str(t_enc)}")

if len(train_ds) < 50 or len(val_ds) < 10:
    raise RuntimeError(
        f"Dataset too small after encoding — train={len(train_ds)} val={len(val_ds)} "
        f"(need train>=50, val>=10). Check the 'Skipped N records' log above for the "
        f"encoding errors that caused this."
    )

# Weighted sampler — upsample rare low/high scores
train_overalls = [
    float(sum(train_records[i][d] for d in DIMENSION_NAMES) / 5)
    for i in range(len(train_ds))
]
def score_weight(s):
    # After rescaling: none≈0-10, poor≈10-20, partial≈20-35, good≈35-55, perfect≈55-100
    if s < 15:  return 2.5   # none — upweight so model learns to predict low end
    if s < 35:  return 1.2   # poor/partial — common, baseline weight
    if s < 60:  return 1.0   # good — well-represented
    return 3.0               # perfect/high — rare after rescaling, needs emphasis

weights  = [score_weight(s) for s in train_overalls]
sampler  = WeightedRandomSampler(weights, num_samples=len(train_ds), replacement=True)

train_loader = DataLoader(train_ds, batch_size=SCORER_BATCH, sampler=sampler,  num_workers=0)
val_loader   = DataLoader(val_ds,   batch_size=SCORER_BATCH, shuffle=False, num_workers=0)

model = JobSyncScorerV3().to(DEVICE)
total_params = sum(p.numel() for p in model.parameters())
log(f"Model params: {total_params:,}  input_dim={INP_DIM}")

from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingWarmRestarts

optimizer = AdamW(model.parameters(), lr=SCORER_LR, weight_decay=WEIGHT_DECAY)
scheduler = CosineAnnealingWarmRestarts(optimizer, T_0=50, T_mult=2, eta_min=1e-6)

best_val_mae = float("inf")
patience = 40
no_improve = 0
history = []

log(f"Training for up to {SCORER_EPOCHS} epochs (early stop patience={patience})", sep=True)
log(f"Train samples: {len(train_ds)} | Val samples: {len(val_ds)} | Batch: {SCORER_BATCH}")
log(f"Optimizer: AdamW lr={SCORER_LR}  wd={WEIGHT_DECAY} | Warmup: {WARMUP_EPOCHS} epochs")
t_train = time.time()

# Log frequency: every epoch ≤10, every 5 ≤50, every 10 ≤100, every 20 thereafter
def should_log_epoch(e):
    if e <= 10:         return True
    if e <= 50:         return e % 5 == 0
    if e <= 100:        return e % 10 == 0
    return e % 20 == 0

for epoch in range(1, SCORER_EPOCHS + 1):
    # Warmup
    if epoch <= WARMUP_EPOCHS:
        for pg in optimizer.param_groups:
            pg["lr"] = SCORER_LR * (epoch / WARMUP_EPOCHS)

    model.train()
    train_loss = 0.0
    for X, y in train_loader:
        X, y = X.to(DEVICE), y.to(DEVICE)
        optimizer.zero_grad()
        pred = model(X)
        loss = combined_loss(pred, y)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        train_loss += loss.item()
    train_loss /= len(train_loader)

    if math.isnan(train_loss) or math.isinf(train_loss):
        log(f"TRAINING DIVERGED at epoch {epoch}: train_loss={train_loss} — aborting.", sep=True)
        log("Likely cause: learning rate too high, or a bad batch (check for NaN/inf in labels).")
        if epoch <= 5:
            log("Diverged in the first few epochs — check SCORER_LR and WARMUP_EPOCHS.")
        raise RuntimeError(f"Training diverged: loss={train_loss} at epoch {epoch}")

    if epoch > WARMUP_EPOCHS:
        scheduler.step()

    model.eval()
    val_mse = val_mae = 0.0
    val_preds_all = []
    val_tgts_all  = []
    with torch.no_grad():
        for X, y in val_loader:
            X, y = X.to(DEVICE), y.to(DEVICE)
            pred = model(X)
            val_mse += F.mse_loss(pred, y).item()
            val_mae += (pred - y).abs().mean().item()
            val_preds_all.append(pred.cpu())
            val_tgts_all.append(y.cpu())
    val_mse /= len(val_loader)
    val_mae /= len(val_loader)

    # Per-dimension MAE (detect if any head is stuck)
    all_p = torch.cat(val_preds_all)   # (N,5)
    all_t = torch.cat(val_tgts_all)
    dim_maes = (all_p - all_t).abs().mean(dim=0).tolist()  # 5 values

    history.append({
        "epoch": epoch,
        "train_loss": round(train_loss, 4),
        "val_mse": round(val_mse, 4),
        "val_mae": round(val_mae, 4),
        "dim_maes": [round(x, 3) for x in dim_maes],
    })

    improved = val_mae < best_val_mae
    if improved:
        best_val_mae = val_mae
        no_improve = 0
        torch.save(model.state_dict(), MODEL_OUT)
    else:
        no_improve += 1

    if should_log_epoch(epoch):
        cur_lr  = optimizer.param_groups[0]["lr"]
        eta     = eta_str(epoch, SCORER_EPOCHS, t_train)
        marker  = "★" if improved else " "
        log(
            f"{marker} Epoch {epoch:3d}/{SCORER_EPOCHS} | "
            f"loss={train_loss:.4f} val_mae={val_mae:.3f} best={best_val_mae:.3f} | "
            f"lr={cur_lr:.2e} | no_improve={no_improve}/{patience} | "
            f"ETA {eta} | elapsed {elapsed_str(t_train)}"
        )
        # Per-dimension MAE detail every 50 epochs (spot stuck heads early)
        if epoch % 50 == 0 or epoch <= 10:
            short_names = ["ats","tech","sem","rec","proj"]
            dim_str = "  ".join(f"{n}={v:.2f}" for n, v in zip(short_names, dim_maes))
            log(f"  dim MAEs: {dim_str}")

    # Plateau warning (don't wait for full patience to know training stalled)
    if no_improve == patience // 2 and epoch > WARMUP_EPOCHS + 20:
        log(f"  ⚠ No improvement for {no_improve} epochs (half patience) — watching closely")

    if no_improve >= patience and epoch > WARMUP_EPOCHS + patience:
        log(f"Early stopping at epoch {epoch} — no improvement for {patience} epochs")
        break

log(f"Training done in {elapsed_str(t_train)}  |  best val_mae: {best_val_mae:.4f}", sep=True)

# ── Final per-dimension error report ──────────────────────────────────────────
model.load_state_dict(torch.load(MODEL_OUT, map_location=DEVICE))
model.eval()
all_p_list, all_t_list = [], []
with torch.no_grad():
    for X, y in val_loader:
        all_p_list.append(model(X.to(DEVICE)).cpu())
        all_t_list.append(y)
all_p = torch.cat(all_p_list)
all_t = torch.cat(all_t_list)
log("Final val per-dimension MAE (best checkpoint):")
for i, dim in enumerate(DIMENSION_NAMES):
    mae_i = (all_p[:, i] - all_t[:, i]).abs().mean().item()
    log(f"  {dim:<35s} MAE={mae_i:.3f}")

# ── Accuracy report ──────────────────────────────────────────────────────────
# MAE alone doesn't tell you whether the model is "accurate" in a way a human can
# reason about, and it's not comparable across training runs with different label
# scales (a narrow/compressed label range trivially produces a lower MAE without the
# model actually being better — this is exactly what happened with the v3/groq run).
# These metrics answer three concrete questions instead:
#   1. Tolerance accuracy — if I trust this score, how often is it within N points
#      of what a human labeler would have said?
#   2. Correlation — does the model's ranking of resumes track the true ranking?
#   3. Bucket separation — does it actually tell none/poor/partial/good/perfect apart,
#      or did it collapse to predicting the same score for everything?
log("Computing accuracy metrics...", sep=True)

def _pearson_r(a: "torch.Tensor", b: "torch.Tensor") -> float:
    a = a - a.mean()
    b = b - b.mean()
    denom = (a.norm() * b.norm()).item()
    if denom < 1e-8:
        return 0.0
    return (a @ b).item() / denom

pred_overall = all_p.mean(dim=1)
tgt_overall  = all_t.mean(dim=1)

tolerance_report = {}
for tol in (5, 10, 15, 20):
    within = (pred_overall - tgt_overall).abs() <= tol
    tolerance_report[f"within_{tol}pts_pct"] = round(within.float().mean().item() * 100, 1)

overall_r = round(_pearson_r(pred_overall, tgt_overall), 3)
overall_mae_final = round((pred_overall - tgt_overall).abs().mean().item(), 2)

per_dim_accuracy = {}
for i, dim in enumerate(DIMENSION_NAMES):
    diffs = (all_p[:, i] - all_t[:, i]).abs()
    per_dim_accuracy[dim] = {
        "mae": round(diffs.mean().item(), 2),
        "within_10pts_pct": round((diffs <= 10).float().mean().item() * 100, 1),
    }

log(f"Overall MAE (mean of 5 dims): {overall_mae_final}")
log(f"Overall accuracy within ±5pts:  {tolerance_report['within_5pts_pct']}%")
log(f"Overall accuracy within ±10pts: {tolerance_report['within_10pts_pct']}%  <- headline accuracy metric")
log(f"Overall accuracy within ±15pts: {tolerance_report['within_15pts_pct']}%")
log(f"Overall accuracy within ±20pts: {tolerance_report['within_20pts_pct']}%")
log(f"Pearson correlation (predicted vs true overall score): r={overall_r}")
log("Per-dimension accuracy:")
for dim, stats in per_dim_accuracy.items():
    log(f"  {dim:<35s} MAE={stats['mae']:.2f}  within_10pts={stats['within_10pts_pct']}%")

# Bucket separation — uses val_ds.levels, which stays index-aligned with all_p/all_t
# even if some records were skipped during encoding (val_records would not be).
log("Per-level predicted overall (bucket separation check):", sep=True)
bucket_means: dict[str, float] = {}
bucket_counts: dict[str, int] = {}
val_levels = val_ds.levels
for level in ["none", "poor", "partial", "good", "perfect"]:
    idxs = [i for i, lv in enumerate(val_levels) if lv == level]
    if idxs:
        vals = pred_overall[idxs]
        bucket_means[level]  = round(vals.mean().item(), 1)
        bucket_counts[level] = len(idxs)
        log(f"  {level:<10s} n={len(idxs):4d}  predicted_mean={bucket_means[level]}")
    else:
        log(f"  {level:<10s} n=0  (no validation samples — can't check)")

level_order = ["none", "poor", "partial", "good", "perfect"]
present_levels = [lv for lv in level_order if lv in bucket_means]
monotonic = all(
    bucket_means[present_levels[i]] <= bucket_means[present_levels[i + 1]]
    for i in range(len(present_levels) - 1)
)
log(f"Bucket ordering monotonic (none<poor<partial<good<perfect): {monotonic}")
if not monotonic:
    log("  WARNING: model is not cleanly separating match-quality levels.")
    log("  This means scores won't reliably discriminate good resumes from bad ones —")
    log("  inspect label quality / quality gate results above before trusting this model.")

accuracy_report = {
    "headline_accuracy_pct": tolerance_report["within_10pts_pct"],
    "headline_definition": "% of validation predictions within ±10 points of the true label",
    "tolerance_accuracy": tolerance_report,
    "overall_mae": overall_mae_final,
    "pearson_r": overall_r,
    "per_dimension": per_dim_accuracy,
    "bucket_means": bucket_means,
    "bucket_counts": bucket_counts,
    "bucket_ordering_monotonic": monotonic,
}
log("="*55, sep=False)
log(f"HEADLINE ACCURACY: {accuracy_report['headline_accuracy_pct']}% "
    f"(predictions within ±10pts of true label)  |  r={overall_r}")
log("="*55, sep=False)

# ── Save tokenizer + metadata ──────────────────────────────────────────────────
tokenizer_meta = {
    "type": "minilm",
    "model_name": "sentence-transformers/all-MiniLM-L6-v2",
    "emb_dim": EMB_DIM,
    "input_dim": INP_DIM,
    "version": 5,
}
with open(TOKEN_OUT, "w") as f:
    json.dump(tokenizer_meta, f, indent=2)

model_meta = {
    "trained_at": datetime.utcnow().isoformat(),
    "version": 5,
    "encoder": "sentence-transformers/all-MiniLM-L6-v2 (frozen)",
    "architecture": f"MiniLM-L6(frozen,384d)+ScorerV5(residual,inp={INP_DIM})",
    "scorer": {
        "val_mse": round(best_val_mae**2, 4),
        "val_mae": round(best_val_mae, 4),
        "epochs": len(history),
        "total_params": total_params,
    },
    "data_source": "real-resumes+real-jds+gpt4o-mini-calibrated-labels",
    "label_strategy": "gpt4o-mini-calibrated-v5",
    "n_pairs": len(labeled),
    "pair_dist": {k: sum(1 for r in labeled if r.get("expected_level")==k) for k in DIST},
    "score_dist": {
        "min": round(min(overalls), 1),
        "max": round(max(overalls), 1),
        "mean": round(sum(overalls)/len(overalls), 1),
    },
    "accuracy": accuracy_report,
    "device": str(DEVICE),
    "history_tail": history[-5:],
}
with open(META_OUT, "w") as f:
    json.dump(model_meta, f, indent=2)

log("="*55, sep=False)
log("Training complete!")
log(f"  scorer.pt        → {MODEL_OUT}")
log(f"  tokenizer.json   → {TOKEN_OUT}")
log(f"  model_meta.json  → {META_OUT}")
log(f"  val_mae          : {best_val_mae:.4f}")
log(f"  accuracy (±10pt) : {accuracy_report['headline_accuracy_pct']}%")
log(f"  bucket separation: {'OK' if accuracy_report['bucket_ordering_monotonic'] else 'FAILED — see warning above'}")
log("  NOTE: val_mae is NOT comparable to older runs (v3 reported 5.68) — that run's")
log("  labels were compressed into a 0-85 range with mean 21, which trivially shrinks")
log("  MAE without the model being more accurate. Judge this run on accuracy% above,")
log("  not on whether val_mae looks smaller or larger than a previous run's number.")
log(f"  labeled pairs    : {len(labeled)}")
log(f"  total session    : {elapsed_str()}")
log("="*55, sep=False)
if not accuracy_report["bucket_ordering_monotonic"]:
    log("⚠ DO NOT DEPLOY THIS MODEL — bucket ordering failed, it can't reliably tell")
    log("  good resumes from bad ones. Re-check the labeling quality gate output above.")
elif accuracy_report["headline_accuracy_pct"] < 40:
    log("⚠ Headline accuracy is below 40% — review per-dimension MAE and bucket means")
    log("  above before deploying. Consider more training pairs or checking label quality.")
else:
    log("✓ Quality checks passed — safe to download and deploy.")
log("Next steps:")
log("  1. Download scorer.pt + tokenizer.json + model_meta.json from /kaggle/working")
log("  2. Replace all three files in backend/models/")
log("     (model_meta.json matters — its 'version' field controls whether the backend")
log("      applies the legacy score-stretch correction or trusts raw output directly)")
log("  3. Restart the backend — check startup logs for 'Neural scorer ready' with")
log("     headline_accuracy_pct matching what was printed above")
