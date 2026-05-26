# JobSync — AI Career Platform

> Land your dream job with AI precision. Semantic ATS analysis, recruiter-grade feedback, and intelligent mentor matching.

![JobSync](https://img.shields.io/badge/stack-Next.js%2016%20%2B%20FastAPI-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![LLM](https://img.shields.io/badge/LLM-Groq%20Llama%203.3%2070B-orange)
![Free](https://img.shields.io/badge/cost-100%25%20free%20stack-brightgreen)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🧠 **Semantic ATS Scoring** | 5-dimension AI scoring using sentence-transformers embeddings |
| 🔍 **Auto Job Scraping** | Playwright scrapes real job listings from company pages & job boards |
| 📝 **Recruiter Feedback** | Llama 3.3 70B generates honest, role-specific feedback |
| 🎯 **Skill Gap Analysis** | Identifies every gap with learning paths and resources |
| ✨ **Bullet Rewriter** | AI rewrites weak bullets with metrics and action verbs |
| 👥 **Mentor Discovery** | Semantic matching with Unstop/ADPList mentors |
| 📊 **Career Insights** | Market data, salary ranges, trending skills |

---

## 🏗️ Architecture

```
Next.js 16 ←→ FastAPI ←→ Supabase PostgreSQL + pgvector
                ↓
         Groq (free LLM)
         sentence-transformers (local)
         Playwright (job scraping)
```

**5 ATS Scoring Dimensions:**
- **ATS Compatibility** (20%) — Format, sections, keyword density
- **Technical Fit** (25%) — Skill overlap with requirements
- **Semantic Match** (25%) — Embedding cosine similarity
- **Recruiter Impression** (20%) — Action verbs, metrics, clarity
- **Project Relevance** (10%) — Project tech vs job requirements

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- A [Supabase](https://supabase.com) project (free)
- A [Groq](https://console.groq.com) API key (free)

### 1. Clone and configure

```bash
git clone https://github.com/yourname/jobsync.git
cd jobsync
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, GROQ_API_KEY
```

### 2. Set up database

In Supabase SQL Editor, run:
```sql
-- Copy and run: backend/app/db/migrations/001_initial_schema.sql
```

Create a `resumes` storage bucket (private) in Supabase Storage.

### 3. Start backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8000
```

### 4. Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Docker (recommended for production)

```bash
docker compose up --build
```

---

## 📁 Project Structure

```
JobSync/
├── frontend/               # Next.js 16 app
│   ├── app/
│   │   ├── page.tsx        # Landing page
│   │   ├── (auth)/         # Login / Signup
│   │   └── (dashboard)/    # All app pages
│   ├── components/
│   │   ├── landing/        # Landing page components
│   │   ├── analysis/       # ATS scoring UI
│   │   ├── resume/         # Resume upload
│   │   └── mentors/        # Mentor cards
│   └── lib/
│       ├── api/            # API client functions
│       ├── types/          # TypeScript types
│       └── stores/         # Zustand state
│
└── backend/                # FastAPI Python
    └── app/
        ├── api/v1/routes/  # REST endpoints
        ├── services/
        │   ├── ats_engine.py       # Core scoring
        │   ├── ai_feedback.py      # Groq LLM
        │   ├── job_scraper.py      # Playwright
        │   ├── resume_parser.py    # PDF/DOCX parser
        │   ├── mentor_finder.py    # Unstop scraper
        │   └── embedding_service.py # sentence-transformers
        └── db/
            └── migrations/         # SQL schema
```

---

## 🔑 Environment Variables

| Variable | Description | Where to get |
|----------|-------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | Supabase dashboard |
| `GROQ_API_KEY` | Groq API key (free) | console.groq.com |

---

## 🤖 AI Stack (All Free)

| Component | Technology | Cost |
|-----------|------------|------|
| LLM | Groq (llama-3.3-70b-versatile) | Free tier |
| Embeddings | sentence-transformers/all-MiniLM-L6-v2 | Local, free |
| Vector DB | Supabase pgvector | Free tier |
| Scraping | Playwright + BeautifulSoup4 | Free, open-source |
| Auth/DB | Supabase | Free tier |

---

## 📄 License

MIT — build on top of this freely.
