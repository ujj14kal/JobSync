# JobSync — System Architecture

> Production-grade AI career platform. Free-tier stack. Startup-ready.

---

## Overview

JobSync is a semantic-first career platform that bridges the gap between job seekers and recruiters using AI-powered ATS analysis, resume optimization, and intelligent mentor discovery.

---

## Tech Stack

| Layer           | Technology                                    | Rationale                            |
|-----------------|-----------------------------------------------|--------------------------------------|
| Frontend        | Next.js 14 (App Router), TypeScript           | SSR, RSC, production standard        |
| Styling         | Tailwind CSS v3 + shadcn/ui                   | Utility-first, consistent design     |
| Animation       | Framer Motion                                 | Smooth, purposeful interactions      |
| State           | Zustand + TanStack Query v5                   | Minimal, powerful                    |
| Backend         | FastAPI (Python 3.11+)                        | Async-first, auto-docs, fast         |
| Database        | Supabase PostgreSQL + pgvector                | Free tier, vector search built-in    |
| Auth            | Supabase Auth (JWT)                           | Free, OAuth support                  |
| File Storage    | Supabase Storage                              | Integrated with DB, free tier        |
| LLM             | Groq API (llama-3.3-70b-versatile)           | Free tier, ultra-fast inference      |
| Embeddings      | sentence-transformers (all-MiniLM-L6-v2)     | Local, no API cost                   |
| Resume Parsing  | pdfplumber + python-docx                      | Robust text extraction               |
| Web Scraping    | Playwright + BeautifulSoup4 + Crawl4AI        | Dynamic + static page handling       |
| Containerization| Docker + Docker Compose                       | Dev/prod parity                      |

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Next.js)                            │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Landing  │  │   Auth   │  │Dashboard │  │Analysis  │           │
│  │   Page   │  │  Pages   │  │  Page    │  │  Page    │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│                                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Resume   │  │ Mentors  │  │ Improve  │  │Insights  │           │
│  │  Upload  │  │Discovery │  │  Page    │  │  Page    │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP / REST + Server Components
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FASTAPI BACKEND                               │
│                                                                       │
│  /api/v1/                                                             │
│  ├── auth/          Supabase JWT validation                          │
│  ├── resume/        Upload, parse, store                             │
│  ├── jobs/          Scrape, extract, cache                           │
│  ├── analysis/      ATS engine, semantic scoring                     │
│  ├── improve/       AI bullet rewriting, gap analysis                │
│  ├── mentors/       Discovery, ranking, recommendations              │
│  └── insights/      Career trends, role analytics                    │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                     SERVICE LAYER                           │     │
│  │                                                             │     │
│  │  ResumeParser  │  ATSEngine  │  SemanticMatcher            │     │
│  │  JobScraper   │  AIFeedback │  MentorFinder                │     │
│  │  EmbeddingService          │  CareerInsights               │     │
│  └────────────────────────────────────────────────────────────┘     │
└──────────┬──────────────────────────┬──────────────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐      ┌──────────────────────────────────────────┐
│   Groq API       │      │          SUPABASE                        │
│   (Free LLM)     │      │                                          │
│   llama-3.3-70b  │      │  PostgreSQL + pgvector                   │
└──────────────────┘      │  ┌──────────────────────────────────┐   │
                           │  │ users │ resumes │ analyses       │   │
┌──────────────────┐      │  │ jobs  │ mentors │ embeddings     │   │
│ HuggingFace      │      │  └──────────────────────────────────┘   │
│ sentence-trans   │      │                                          │
│ (local embed.)   │      │  Supabase Storage (resume files)         │
└──────────────────┘      └──────────────────────────────────────────┘
```

---

## AI Pipeline Architecture

```
Resume Text ──┐
              ├──► EmbeddingService ──► Vector (384-dim)
Job Desc  ────┘                              │
                                             ▼
                                    pgvector cosine sim
                                             │
                                             ▼
                                   SemanticScore (0-100)
                                             │
              ┌──────────────────────────────┤
              ▼                              ▼
        ATSEngine                     Groq LLM Chain
        ├── keyword_match             ├── strengths_analysis
        ├── section_detection         ├── weakness_detection
        ├── format_score              ├── gap_identification
        └── technical_fit            ├── bullet_rewriting
                                      └── mentor_matching
```

---

## Database Schema

```sql
-- Users (managed by Supabase Auth)
users (
  id uuid PK,
  email text,
  full_name text,
  avatar_url text,
  career_stage text,     -- 'student' | 'entry' | 'mid' | 'senior'
  target_role text,
  target_company text,
  industry text,
  created_at timestamptz,
  updated_at timestamptz
)

-- Resume storage
resumes (
  id uuid PK,
  user_id uuid FK → users,
  file_name text,
  file_url text,          -- Supabase Storage URL
  raw_text text,          -- Extracted text
  parsed_data jsonb,      -- Structured: {skills, experience, education, ...}
  embedding vector(384),  -- sentence-transformers embedding
  is_active boolean,
  created_at timestamptz
)

-- Job descriptions (scraped + cached)
job_descriptions (
  id uuid PK,
  company_name text,
  job_title text,
  job_id_external text,  -- Company's internal job ID
  source_url text,
  raw_text text,
  parsed_data jsonb,     -- {requirements, skills, responsibilities, ...}
  embedding vector(384),
  scraped_at timestamptz,
  created_at timestamptz
)

-- ATS Analysis results
analyses (
  id uuid PK,
  user_id uuid FK → users,
  resume_id uuid FK → resumes,
  job_id uuid FK → job_descriptions,
  
  -- Scores (0-100)
  overall_score int,
  ats_score int,
  technical_fit_score int,
  semantic_match_score int,
  recruiter_impression_score int,
  project_relevance_score int,
  
  -- Detailed feedback
  strengths jsonb,          -- [{title, description}]
  weaknesses jsonb,         -- [{title, description, severity}]
  missing_keywords jsonb,   -- [{keyword, importance, context}]
  skill_gaps jsonb,         -- [{skill, importance, how_to_acquire}]
  improvement_suggestions jsonb,
  
  -- Rewritten content
  rewritten_bullets jsonb,  -- [{original, rewritten, improvement_reason}]
  
  status text,              -- 'pending' | 'processing' | 'complete' | 'failed'
  created_at timestamptz
)

-- Mentor recommendations
mentors (
  id uuid PK,
  name text,
  title text,
  company text,
  platform text,          -- 'unstop' | 'adplist' | 'linkedin'
  profile_url text,
  avatar_url text,
  specializations text[], -- array of skills/domains
  industries text[],
  career_stages text[],   -- who they mentor
  availability text,
  session_format text,
  bio text,
  rating float,
  review_count int,
  embedding vector(384),  -- embedded specializations for matching
  is_verified boolean,
  scraped_at timestamptz,
  created_at timestamptz
)

-- User ↔ Mentor recommendations
mentor_recommendations (
  id uuid PK,
  user_id uuid FK → users,
  analysis_id uuid FK → analyses,
  mentor_id uuid FK → mentors,
  match_score float,
  match_reasons jsonb,
  created_at timestamptz
)

-- Career insights cache
career_insights (
  id uuid PK,
  role text,
  industry text,
  data jsonb,             -- trending skills, salary ranges, etc.
  expires_at timestamptz,
  created_at timestamptz
)
```

---

## Web Scraping Pipeline

```
Input: company_name + (job_id OR job_title)
           │
           ▼
    ┌─────────────┐
    │ URL Builder │  → linkedin.com/jobs, indeed.com, company careers
    └─────────────┘
           │
           ▼
    ┌─────────────────────────────┐
    │     Playwright Browser      │
    │  (headless Chromium)        │
    │  - Navigate to search URL   │
    │  - Find job listings        │
    │  - Click target listing     │
    │  - Extract full page HTML   │
    └─────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────┐
    │   BeautifulSoup4 Parser     │
    │  - Clean HTML               │
    │  - Extract main content     │
    │  - Structure sections       │
    └─────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────┐
    │   Groq LLM Extractor        │
    │  - Parse requirements       │
    │  - Extract skills list      │
    │  - Identify responsibilities│
    │  - Extract qualifications   │
    └─────────────────────────────┘
           │
           ▼
    ┌─────────────────────────────┐
    │   Cache in Supabase         │
    │  (24hr TTL)                 │
    └─────────────────────────────┘
```

---

## ATS Scoring Breakdown

| Score Component        | Weight | Method                                      |
|------------------------|--------|---------------------------------------------|
| ATS Compatibility      | 20%    | Format, sections, keywords density          |
| Technical Fit          | 25%    | Skill overlap, tech stack alignment         |
| Semantic Match         | 25%    | Embedding cosine similarity                 |
| Recruiter Impression   | 20%    | Clarity, impact metrics, action verbs       |
| Project Relevance      | 10%    | Project tech stack vs job requirements      |

---

## Folder Structure

```
JobSync/
├── ARCHITECTURE.md
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── frontend/                          # Next.js 14 App
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── analysis/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── resume/page.tsx
│   │   │   ├── mentors/page.tsx
│   │   │   ├── improve/page.tsx
│   │   │   └── insights/page.tsx
│   │   ├── layout.tsx
│   │   └── page.tsx                   # Landing page
│   ├── components/
│   │   ├── ui/                        # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── navbar.tsx
│   │   │   ├── sidebar.tsx
│   │   │   └── footer.tsx
│   │   ├── landing/
│   │   │   ├── hero.tsx
│   │   │   ├── features.tsx
│   │   │   ├── how-it-works.tsx
│   │   │   └── cta.tsx
│   │   ├── resume/
│   │   │   ├── upload-zone.tsx
│   │   │   ├── resume-card.tsx
│   │   │   └── resume-preview.tsx
│   │   ├── analysis/
│   │   │   ├── score-ring.tsx
│   │   │   ├── score-breakdown.tsx
│   │   │   ├── strengths-panel.tsx
│   │   │   ├── weaknesses-panel.tsx
│   │   │   ├── keyword-gap.tsx
│   │   │   └── job-input-form.tsx
│   │   ├── mentors/
│   │   │   ├── mentor-card.tsx
│   │   │   └── mentor-filters.tsx
│   │   └── shared/
│   │       ├── loading-states.tsx
│   │       ├── error-boundary.tsx
│   │       └── animated-number.tsx
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── analysis.ts
│   │   │   ├── resume.ts
│   │   │   └── mentors.ts
│   │   ├── hooks/
│   │   │   ├── use-analysis.ts
│   │   │   └── use-resume.ts
│   │   ├── stores/
│   │   │   └── app-store.ts
│   │   ├── utils/
│   │   │   └── cn.ts
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── next.config.ts
│
└── backend/                           # FastAPI Python
    ├── app/
    │   ├── api/
    │   │   ├── v1/
    │   │   │   ├── routes/
    │   │   │   │   ├── auth.py
    │   │   │   │   ├── resume.py
    │   │   │   │   ├── jobs.py
    │   │   │   │   ├── analysis.py
    │   │   │   │   ├── improve.py
    │   │   │   │   ├── mentors.py
    │   │   │   │   └── insights.py
    │   │   │   └── router.py
    │   │   └── deps.py
    │   ├── core/
    │   │   ├── config.py
    │   │   └── security.py
    │   ├── services/
    │   │   ├── resume_parser.py
    │   │   ├── ats_engine.py
    │   │   ├── semantic_matcher.py
    │   │   ├── job_scraper.py
    │   │   ├── ai_feedback.py
    │   │   ├── mentor_finder.py
    │   │   ├── embedding_service.py
    │   │   └── career_insights.py
    │   ├── models/
    │   │   ├── resume.py
    │   │   ├── analysis.py
    │   │   ├── job.py
    │   │   └── mentor.py
    │   ├── db/
    │   │   ├── supabase_client.py
    │   │   └── migrations/
    │   │       └── 001_initial_schema.sql
    │   └── main.py
    ├── requirements.txt
    └── Dockerfile
```
