-- ─────────────────────────────────────────────────────────────
-- JobSync Initial Schema
-- Run this in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── User profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email         TEXT,
    full_name     TEXT,
    avatar_url    TEXT,
    career_stage  TEXT DEFAULT 'entry' CHECK (career_stage IN ('student', 'entry', 'mid', 'senior')),
    target_role   TEXT,
    target_company TEXT,
    industry      TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name, career_stage, target_role)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        COALESCE(NEW.raw_user_meta_data->>'career_stage', 'entry'),
        NEW.raw_user_meta_data->>'target_role'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ─── Resumes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resumes (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    file_name    TEXT NOT NULL,
    file_url     TEXT,
    file_size    INTEGER DEFAULT 0,
    raw_text     TEXT,
    parsed_data  JSONB DEFAULT '{}',
    embedding    vector(384),
    is_active    BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own resumes" ON public.resumes
    FOR ALL USING (auth.uid() = user_id);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS resumes_embedding_idx
    ON public.resumes USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);


-- ─── Job Descriptions ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_descriptions (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name       TEXT NOT NULL,
    job_title          TEXT NOT NULL,
    job_id_external    TEXT,
    source_url         TEXT,
    raw_text           TEXT,
    parsed_data        JSONB DEFAULT '{}',
    embedding          vector(384),
    scraped_at         TIMESTAMPTZ DEFAULT NOW(),
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Public read access (job descriptions are not user-specific)
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to job_descriptions" ON public.job_descriptions
    FOR SELECT USING (TRUE);
CREATE POLICY "Service role can insert job_descriptions" ON public.job_descriptions
    FOR INSERT WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS job_descriptions_embedding_idx
    ON public.job_descriptions USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Cache index
CREATE INDEX IF NOT EXISTS job_descriptions_cache_idx
    ON public.job_descriptions (company_name, job_title, scraped_at);


-- ─── Analyses ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analyses (
    id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                   UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    resume_id                 UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    job_id                    UUID NOT NULL REFERENCES public.job_descriptions(id),

    -- Scores (0-100)
    overall_score             INTEGER DEFAULT 0,
    ats_score                 INTEGER DEFAULT 0,
    technical_fit_score       INTEGER DEFAULT 0,
    semantic_match_score      INTEGER DEFAULT 0,
    recruiter_impression_score INTEGER DEFAULT 0,
    project_relevance_score   INTEGER DEFAULT 0,

    -- Feedback
    strengths                 JSONB DEFAULT '[]',
    weaknesses                JSONB DEFAULT '[]',
    missing_keywords          JSONB DEFAULT '[]',
    skill_gaps                JSONB DEFAULT '[]',
    improvement_suggestions   JSONB DEFAULT '[]',
    rewritten_bullets         JSONB DEFAULT '[]',
    recruiter_summary         TEXT,

    status                    TEXT DEFAULT 'pending' CHECK (
                                  status IN ('pending', 'processing', 'complete', 'failed')
                              ),
    error_message             TEXT,
    created_at                TIMESTAMPTZ DEFAULT NOW(),
    updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own analyses" ON public.analyses
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS analyses_user_id_idx ON public.analyses (user_id, created_at DESC);


-- ─── Mentors ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    title           TEXT,
    company         TEXT,
    platform        TEXT DEFAULT 'unstop' CHECK (platform IN ('unstop', 'adplist', 'linkedin', 'other')),
    profile_url     TEXT,
    avatar_url      TEXT,
    specializations TEXT[] DEFAULT '{}',
    industries      TEXT[] DEFAULT '{}',
    career_stages   TEXT[] DEFAULT '{}',
    availability    TEXT DEFAULT 'On request',
    session_format  TEXT DEFAULT '1:1 Video',
    bio             TEXT,
    rating          FLOAT,
    review_count    INTEGER DEFAULT 0,
    embedding       vector(384),
    is_verified     BOOLEAN DEFAULT FALSE,
    scraped_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to mentors" ON public.mentors
    FOR SELECT USING (TRUE);
CREATE POLICY "Service role can manage mentors" ON public.mentors
    FOR ALL WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS mentors_embedding_idx
    ON public.mentors USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);


-- ─── Mentor Recommendations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mentor_recommendations (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    analysis_id   UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
    mentor_id     UUID NOT NULL REFERENCES public.mentors(id),
    match_score   FLOAT DEFAULT 0,
    match_reasons JSONB DEFAULT '[]',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mentor_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own recommendations" ON public.mentor_recommendations
    FOR SELECT USING (auth.uid() = user_id);


-- ─── Career Insights Cache ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.career_insights (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role       TEXT NOT NULL,
    industry   TEXT,
    data       JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.career_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to insights" ON public.career_insights
    FOR SELECT USING (TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS career_insights_role_idx
    ON public.career_insights (role, industry);


-- ─── Storage bucket ──────────────────────────────────────────
-- Run in Supabase dashboard: Storage > New bucket > "resumes" > Private
-- INSERT INTO storage.buckets (id, name, public) VALUES ('resumes', 'resumes', false);
