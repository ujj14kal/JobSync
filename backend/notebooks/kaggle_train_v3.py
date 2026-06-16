"""
JobSync AI Trainer v3 — Groq-Judged Labels + Real Kaggle Data
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
from datetime import datetime
from collections import defaultdict

# ── Paths ──────────────────────────────────────────────────────────────────────
OUTPUT_DIR   = Path("/kaggle/working")
PAIRS_CACHE  = OUTPUT_DIR / "labeled_pairs.jsonl"  # incremental save
MODEL_OUT    = OUTPUT_DIR / "scorer.pt"
TOKEN_OUT    = OUTPUT_DIR / "tokenizer.json"
META_OUT     = OUTPUT_DIR / "model_meta.json"

OUTPUT_DIR.mkdir(exist_ok=True)

print("=" * 65)
print("JobSync AI Trainer v3 — Groq-Judged Labels")
print("=" * 65)

# ── Deps ───────────────────────────────────────────────────────────────────────
os.system("pip install -q sentence-transformers pandas torch groq")

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import pandas as pd
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {DEVICE}")
if DEVICE.type == "cuda":
    print(f"GPU: {torch.cuda.get_device_name(0)}")

# ── Groq setup ─────────────────────────────────────────────────────────────────
from kaggle_secrets import UserSecretsClient
GROQ_API_KEY = UserSecretsClient().get_secret("GROQ_API_KEY")
from groq import Groq
groq_client = Groq(api_key=GROQ_API_KEY)

# ── Hyperparams ────────────────────────────────────────────────────────────────
TARGET_PAIRS   = 15_000   # total labeled pairs
LABEL_BATCH    = 20       # pairs per Groq call (one prompt = one pair)
GROQ_RPM_LIMIT = 28       # stay under 30 req/min free tier
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

resume_df = None
jd_df = None

for p in resume_paths:
    try:
        df = pd.read_csv(p)
        cols = [c.lower() for c in df.columns]
        if "category" in cols and any("resume" in c for c in cols):
            resume_df = df
            resume_df.columns = [c.lower() for c in resume_df.columns]
            if "resume_str" in resume_df.columns:
                resume_df["resume"] = resume_df["resume_str"]
            elif "resume" not in resume_df.columns:
                resume_col = [c for c in resume_df.columns if "resume" in c][0]
                resume_df["resume"] = resume_df[resume_col]
            print(f"Resume dataset: {p.name} — {len(resume_df)} rows, cats: {resume_df['category'].nunique()}")
        elif any(w in str(p).lower() for w in ["job", "posting", "linkedin"]):
            jd_df = df
            jd_df.columns = [c.lower() for c in jd_df.columns]
            print(f"JD dataset: {p.name} — {len(jd_df)} rows")
    except Exception as e:
        print(f"Skipped {p.name}: {e}")

if resume_df is None:
    raise RuntimeError("Resume dataset not found. Add snehaanbhawal/resume-dataset to kernel inputs.")

# Build resume index by category
resume_by_cat = defaultdict(list)
for _, row in resume_df.iterrows():
    cat = str(row.get("category", "")).strip()
    text = str(row.get("resume", "")).strip()
    if cat and text and len(text) > 200:
        resume_by_cat[cat].append(text)

print(f"\nResume categories: {dict((k, len(v)) for k,v in resume_by_cat.items())}")

# Build JD index — use LinkedIn postings or synthetic JDs
jd_by_cat = defaultdict(list)
if jd_df is not None:
    title_col = next((c for c in jd_df.columns if "title" in c), None)
    desc_col  = next((c for c in jd_df.columns if "description" in c or "desc" in c), None)
    if title_col and desc_col:
        for _, row in jd_df.iterrows():
            title = str(row.get(title_col, "")).lower()
            desc  = str(row.get(desc_col, "")).strip()
            if not desc or len(desc) < 100:
                continue
            for cat, keywords in TECH_CATS.items():
                if any(kw in title for kw in keywords[:3]) or cat.lower().split()[0] in title:
                    jd_by_cat[cat].append(desc[:1200])
                    break
    print(f"JD categories from LinkedIn: {dict((k,len(v)) for k,v in jd_by_cat.items() if v)}")

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

def sample_resume(cat, exclude=None):
    pool = [r for r in resume_by_cat.get(cat, []) if r != exclude]
    if not pool:
        return None
    return random.choice(pool)

def sample_jd(cat, exclude=None):
    pool = [j for j in jd_by_cat.get(cat, []) if j != exclude]
    if not pool:
        pool = SYNTHETIC_JDS.get(cat, [])
    if not pool:
        return None
    return random.choice(pool)

# ── Groq labeling ──────────────────────────────────────────────────────────────
LABEL_PROMPT = """You are a senior technical recruiter with 20 years at top companies.
Score how well this resume matches this job description. Be STRICT and REALISTIC.

SCORING RULES:
- If resume and job are completely different fields: all scores 0-15
- If tech stacks don't overlap: technical_fit_score 0-20, ats_score 20-40
- Only give 75+ when there is genuinely strong alignment
- Consider: actual skills match, experience level match, domain relevance
- ATS score: do resume keywords match JD keywords?
- Technical fit: do technical skills/tools match requirements?
- Semantic match: overall content alignment (writing style, domain language)
- Recruiter impression: would a recruiter shortlist this? (format, impact, relevance)
- Project relevance: do projects/past work relate to this role?

RESUME (truncated):
{resume}

JOB DESCRIPTION (truncated):
{jd}

Respond with JSON ONLY (no markdown, no explanation):
{{"ats_score":{{"value":0}},"technical_fit_score":{{"value":0}},"semantic_match_score":{{"value":0}},"recruiter_impression_score":{{"value":0}},"project_relevance_score":{{"value":0}}}}

Replace 0 with actual integer scores 0-100."""

_last_groq_call = 0.0

def groq_label(resume: str, jd: str, retries: int = 3) -> dict | None:
    global _last_groq_call
    # Rate limit
    elapsed = time.time() - _last_groq_call
    if elapsed < (60.0 / GROQ_RPM_LIMIT):
        time.sleep((60.0 / GROQ_RPM_LIMIT) - elapsed)

    prompt = LABEL_PROMPT.format(
        resume=resume[:900].replace("{","(").replace("}",")"),
        jd=jd[:700].replace("{","(").replace("}",")")
    )

    for attempt in range(retries):
        try:
            _last_groq_call = time.time()
            resp = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=200,
            )
            raw = resp.choices[0].message.content.strip()
            # Extract JSON
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            if not match:
                continue
            data = json.loads(match.group())
            scores = {}
            for dim in DIMENSION_NAMES:
                v = data.get(dim, {})
                if isinstance(v, dict):
                    scores[dim] = float(v.get("value", 50))
                elif isinstance(v, (int, float)):
                    scores[dim] = float(v)
                else:
                    scores[dim] = 50.0
            # Validate range
            if all(0 <= scores[d] <= 100 for d in DIMENSION_NAMES):
                return scores
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"  Groq error: {e}")
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

    # 1. PERFECT match — same category, same tech domain
    for _ in range(n_perfect):
        cat = random.choice(all_cats)
        r = sample_resume(cat)
        j = sample_jd(cat)
        if r and j:
            pairs.append({"resume": r, "jd": j, "expected_level": "perfect", "resume_cat": cat, "jd_cat": cat})

    # 2. GOOD match — same category different seniority / slight skill gap
    for _ in range(n_good):
        cat = random.choice(all_cats)
        r = sample_resume(cat)
        j = sample_jd(cat)
        if r and j and r != pairs[-1].get("resume"):
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
labeled = []
seen_hashes = set()

if PAIRS_CACHE.exists():
    with open(PAIRS_CACHE) as f:
        for line in f:
            try:
                rec = json.loads(line)
                h = hashlib.md5((rec["resume"][:100]+rec["jd"][:100]).encode()).hexdigest()
                seen_hashes.add(h)
                labeled.append(rec)
            except:
                pass
    print(f"Resumed: {len(labeled)} already labeled")

cache_file = open(PAIRS_CACHE, "a")

print(f"\nLabeling {len(pairs)} pairs with Groq (this takes ~{len(pairs)//GROQ_RPM_LIMIT} minutes)...")
t0 = time.time()
errors = 0

for i, pair in enumerate(pairs):
    h = hashlib.md5((pair["resume"][:100]+pair["jd"][:100]).encode()).hexdigest()
    if h in seen_hashes:
        continue

    scores = groq_label(pair["resume"], pair["jd"])
    if scores is None:
        errors += 1
        continue

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
        "source": "groq-llm-v3",
        "label_strategy": "groq-recruiter-judgment",
        **scores,
        "overall_score": overall,
    }
    labeled.append(record)
    seen_hashes.add(h)
    cache_file.write(json.dumps(record) + "\n")
    cache_file.flush()

    if (i+1) % 100 == 0:
        elapsed = time.time() - t0
        eta = elapsed / (i+1) * (len(pairs)-i-1)
        # Score distribution so far
        overalls = [r["overall_score"] for r in labeled]
        print(f"  [{i+1}/{len(pairs)}] labeled={len(labeled)} errors={errors} "
              f"avg={sum(overalls)/len(overalls):.1f} "
              f"min={min(overalls):.0f} max={max(overalls):.0f} "
              f"ETA={eta/60:.0f}m")

cache_file.close()

# Score distribution check
print(f"\nFinal labeled count: {len(labeled)}")
overalls = [r["overall_score"] for r in labeled]
buckets = {"0-20":0,"21-40":0,"41-60":0,"61-80":0,"81-100":0}
for s in overalls:
    if s <= 20: buckets["0-20"] += 1
    elif s <= 40: buckets["21-40"] += 1
    elif s <= 60: buckets["41-60"] += 1
    elif s <= 80: buckets["61-80"] += 1
    else: buckets["81-100"] += 1
print(f"Distribution: {buckets}")
print(f"Overall: min={min(overalls):.1f} max={max(overalls):.1f} mean={sum(overalls)/len(overalls):.1f}")

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
    "python","java","javascript","typescript","react","sql","aws","docker",
    "kubernetes","tensorflow","pytorch","fastapi","django","golang","scala",
    "spark","kafka","redis","mongodb","postgresql","mysql","html","css",
    "spring","microservices","rest","api","git","linux","agile","scrum",
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
print("\nLoading sentence-transformers encoder...")
from sentence_transformers import SentenceTransformer
encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2").to(DEVICE)
encoder.eval()

class PairDataset(Dataset):
    def __init__(self, records, encoder):
        self.X = []
        self.y = []
        skipped = 0
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
            except Exception as e:
                skipped += 1

        if skipped:
            print(f"  Skipped {skipped} records (encoding errors)")
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
    overall_p = preds.mean(dim=1)
    overall_t = targets.mean(dim=1)
    n = len(overall_p)
    loss = torch.zeros(1, device=preds.device)
    count = 0
    for i in range(n):
        for j in range(i+1, n):
            if overall_t[i] > overall_t[j] + margin:
                loss += torch.clamp(overall_p[j] - overall_p[i] + 1.0, min=0.0)
                count += 1
            elif overall_t[j] > overall_t[i] + margin:
                loss += torch.clamp(overall_p[i] - overall_p[j] + 1.0, min=0.0)
                count += 1
    return loss / max(count, 1)


def combined_loss(pred, target):
    return focal_mse(pred, target) + 0.15 * ranking_loss(pred, target)


# ── Train ──────────────────────────────────────────────────────────────────────
random.shuffle(labeled)
split = int(len(labeled) * 0.9)
train_records = labeled[:split]
val_records   = labeled[split:]

print(f"\nBuilding train dataset ({len(train_records)} records)...")
train_ds = PairDataset(train_records, encoder)
print(f"Building val dataset ({len(val_records)} records)...")
val_ds   = PairDataset(val_records, encoder)

# Weighted sampler — upsample rare low/high scores
train_overalls = [
    float(sum(train_records[i][d] for d in DIMENSION_NAMES) / 5)
    for i in range(len(train_ds))
]
def score_weight(s):
    if s < 25: return 3.0    # rare low scores
    if s < 40: return 2.0
    if s < 60: return 1.0
    if s < 80: return 1.2
    return 2.5                # rare high scores

weights  = [score_weight(s) for s in train_overalls]
sampler  = WeightedRandomSampler(weights, num_samples=len(train_ds), replacement=True)

train_loader = DataLoader(train_ds, batch_size=SCORER_BATCH, sampler=sampler,  num_workers=0)
val_loader   = DataLoader(val_ds,   batch_size=SCORER_BATCH, shuffle=False, num_workers=0)

model = JobSyncScorerV3().to(DEVICE)
total_params = sum(p.numel() for p in model.parameters())
print(f"\nModel params: {total_params:,}")

from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingWarmRestarts

optimizer = AdamW(model.parameters(), lr=SCORER_LR, weight_decay=WEIGHT_DECAY)
scheduler = CosineAnnealingWarmRestarts(optimizer, T_0=50, T_mult=2, eta_min=1e-6)

best_val_mae = float("inf")
patience = 40
no_improve = 0
history = []

print(f"\nTraining for up to {SCORER_EPOCHS} epochs (early stop patience={patience})...")
t0 = time.time()

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

    if epoch > WARMUP_EPOCHS:
        scheduler.step()

    model.eval()
    val_mse = val_mae = 0.0
    with torch.no_grad():
        for X, y in val_loader:
            X, y = X.to(DEVICE), y.to(DEVICE)
            pred = model(X)
            val_mse += F.mse_loss(pred, y).item()
            val_mae += (pred - y).abs().mean().item()
    val_mse /= len(val_loader)
    val_mae /= len(val_loader)

    history.append({"epoch": epoch, "train_loss": round(train_loss, 4),
                     "val_mse": round(val_mse, 4), "val_mae": round(val_mae, 4)})

    if val_mae < best_val_mae:
        best_val_mae = val_mae
        no_improve = 0
        torch.save(model.state_dict(), MODEL_OUT)
    else:
        no_improve += 1

    if epoch % 20 == 0 or epoch <= 5:
        elapsed = time.time() - t0
        print(f"  Epoch {epoch:3d}/{SCORER_EPOCHS} | train_loss={train_loss:.4f} "
              f"val_mae={val_mae:.3f} best={best_val_mae:.3f} "
              f"lr={optimizer.param_groups[0]['lr']:.2e} [{elapsed/60:.1f}m]")

    if no_improve >= patience and epoch > WARMUP_EPOCHS + patience:
        print(f"\nEarly stopping at epoch {epoch} (no improvement for {patience} epochs)")
        break

print(f"\nBest val_mae: {best_val_mae:.4f}")

# ── Save tokenizer + metadata ──────────────────────────────────────────────────
tokenizer_meta = {
    "type": "minilm",
    "model_name": "sentence-transformers/all-MiniLM-L6-v2",
    "emb_dim": EMB_DIM,
    "input_dim": INP_DIM,
    "version": 3,
}
with open(TOKEN_OUT, "w") as f:
    json.dump(tokenizer_meta, f, indent=2)

model_meta = {
    "trained_at": datetime.utcnow().isoformat(),
    "version": 3,
    "encoder": "sentence-transformers/all-MiniLM-L6-v2 (frozen)",
    "architecture": f"MiniLM-L6(frozen,384d)+ScorerV3(residual,inp={INP_DIM})",
    "scorer": {
        "val_mse": round(best_val_mae**2, 4),
        "val_mae": round(best_val_mae, 4),
        "epochs": len(history),
        "total_params": total_params,
    },
    "data_source": "real-kaggle-datasets+groq-judgment-labels",
    "label_strategy": "groq-recruiter-judgment-v3",
    "n_pairs": len(labeled),
    "pair_dist": {k: sum(1 for r in labeled if r.get("expected_level")==k) for k in DIST},
    "score_dist": {
        "min": round(min(overalls), 1),
        "max": round(max(overalls), 1),
        "mean": round(sum(overalls)/len(overalls), 1),
    },
    "device": str(DEVICE),
    "history_tail": history[-5:],
}
with open(META_OUT, "w") as f:
    json.dump(model_meta, f, indent=2)

print("\n" + "="*65)
print("Training complete!")
print(f"  scorer.pt     → {MODEL_OUT}")
print(f"  tokenizer.json → {TOKEN_OUT}")
print(f"  model_meta.json → {META_OUT}")
print(f"  val_mae: {best_val_mae:.4f} (was 0.53 in v2)")
print(f"  labeled pairs: {len(labeled)}")
print(f"  label strategy: groq-recruiter-judgment (NOT cosine-based)")
print("="*65)
print("\nNext steps:")
print("  1. Download scorer.pt + tokenizer.json from /kaggle/working")
print("  2. Replace backend/models/scorer.pt + tokenizer.json")
print("  3. Restart the backend")
