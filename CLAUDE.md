# JobSync — Developer Guide

## ⚠️ GCP Cost Rules — READ BEFORE BUILDING ANYTHING

**Hard cap: ₹15/month. Target: ₹0–10/month.**

### Rules Claude must follow:
1. **Always develop and test locally first.** Backend runs on `uvicorn` locally. Only deploy to Cloud Run when a feature is fully working.
2. **Max 2-3 deploys per day.** Each deploy = 1 Cloud Build job (~10 min). Free tier = 120 min/day. 3 builds/day = 30 min = ₹0. Never exceed this.
3. **Never push to `main` to test something.** Deploying to Cloud Run must be done manually via `./deploy.sh` only.
3. **Before suggesting any new GCP service** (Cloud Build, Vertex AI, GCS, Pub/Sub, etc.) — STOP and have a cost conversation first. Estimate the monthly cost in INR before writing any code.
4. **Cloud Build is off.** No CI/CD trigger exists. Manual deploy only via `gcloud run deploy`.
5. **Artifact Registry**: cleanup policy set (max 2 images, delete after 7 days). Never create repos in multiple regions.
6. **Cloud Run**: min-instances=0 always. No idle compute cost.
7. **No new GCP services without explicit approval.** Supabase (free), Groq (free), Vercel (free), ElevenLabs (free tier) are approved. Everything else needs discussion.

### Current monthly cost estimate: ~₹8–10 (just 1 Docker image in Artifact Registry)
### Budget alerts set: email at ₹5, ₹10, ₹15

## Project Overview
JobSync is an AI-powered career platform built with Next.js 16 + FastAPI.
It provides semantic ATS analysis, resume optimization, job scraping, and mentor discovery.

## Stack
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion
- **Backend**: FastAPI (Python 3.11), Groq LLM (free), sentence-transformers (local embeddings)
- **DB**: Supabase PostgreSQL + pgvector
- **Scraping**: Playwright + BeautifulSoup4
- **Auth**: Supabase Auth (JWT)

## Key Commands

### Frontend
```bash
cd frontend
npm install
npm run dev       # http://localhost:3000
npm run build
npm run type-check
```

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
uvicorn app.main:app --reload --port 8000
```

### Docker (full stack)
```bash
cp .env.example .env   # Fill in your keys
docker compose up
```

## Required Env Vars
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GROQ_API_KEY=              # Free at console.groq.com
SUPABASE_SERVICE_ROLE_KEY=
```

## Database Setup
Run `backend/app/db/migrations/001_initial_schema.sql` in Supabase SQL editor.
Create a `resumes` storage bucket (private) in Supabase Storage.

## Architecture
See ARCHITECTURE.md for full system design.

## Key Files
- `frontend/app/page.tsx` — Landing page
- `frontend/app/(dashboard)/` — All authenticated pages
- `frontend/components/analysis/` — ATS scoring components
- `backend/app/services/ats_engine.py` — Core scoring logic
- `backend/app/services/ai_feedback.py` — Groq LLM feedback
- `backend/app/services/job_scraper.py` — Playwright job scraper
- `backend/app/services/mentor_finder.py` — Mentor discovery
- `backend/app/db/migrations/001_initial_schema.sql` — Full DB schema

## API Docs
When running locally with DEBUG=True: http://localhost:8000/docs
