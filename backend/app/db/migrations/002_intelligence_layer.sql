-- ═══════════════════════════════════════════════════════════════════════════
-- JobSync Intelligence Layer — Migration 002
-- Run after 001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Resume chunks (section-level embeddings) ─────────────────────────────────
-- Enables fine-grained semantic matching: skills section vs. job requirements,
-- experience bullets vs. responsibilities, projects vs. tech requirements.

CREATE TABLE IF NOT EXISTS public.resume_chunks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resume_id     UUID NOT NULL REFERENCES public.resumes(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    chunk_type    TEXT NOT NULL,   -- 'skills', 'experience_0', 'projects', 'summary', 'education'
    chunk_text    TEXT NOT NULL,
    embedding     vector(384),
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.resume_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own resume chunks" ON public.resume_chunks
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service can manage resume chunks" ON public.resume_chunks
    FOR ALL WITH CHECK (TRUE);

-- HNSW index for fast approximate nearest neighbor search
-- m=16: 16 neighbors per node (good balance of speed vs. recall)
-- ef_construction=200: more candidates during build → better recall
CREATE INDEX IF NOT EXISTS resume_chunks_embedding_hnsw
    ON public.resume_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS resume_chunks_resume_id_idx
    ON public.resume_chunks (resume_id, chunk_type);


-- ─── Job description chunks ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_chunks (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id        UUID NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
    chunk_type    TEXT NOT NULL,   -- 'core_requirements', 'responsibilities', 'preferred', 'culture'
    chunk_text    TEXT NOT NULL,
    embedding     vector(384),
    metadata      JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.job_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to job chunks" ON public.job_chunks
    FOR SELECT USING (TRUE);
CREATE POLICY "Service can manage job chunks" ON public.job_chunks
    FOR ALL WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS job_chunks_embedding_hnsw
    ON public.job_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS job_chunks_job_id_idx
    ON public.job_chunks (job_id, chunk_type);


-- ─── Skill embeddings (for skill graph vector operations) ─────────────────────

CREATE TABLE IF NOT EXISTS public.skill_embeddings (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_name    TEXT NOT NULL UNIQUE,
    category      TEXT,             -- 'languages', 'frontend', 'backend', 'cloud', etc.
    embedding     vector(384),
    demand_score  FLOAT DEFAULT 50,   -- 0-100 current market demand
    trend         TEXT DEFAULT 'stable' CHECK (trend IN ('rising', 'stable', 'declining')),
    yoy_change    FLOAT DEFAULT 0,    -- year-over-year demand change percentage
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.skill_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to skill embeddings" ON public.skill_embeddings
    FOR SELECT USING (TRUE);
CREATE POLICY "Service can manage skill embeddings" ON public.skill_embeddings
    FOR ALL WITH CHECK (TRUE);

CREATE INDEX IF NOT EXISTS skill_embeddings_hnsw
    ON public.skill_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

CREATE INDEX IF NOT EXISTS skill_embeddings_category_idx
    ON public.skill_embeddings (category);

CREATE INDEX IF NOT EXISTS skill_embeddings_demand_idx
    ON public.skill_embeddings (demand_score DESC);


-- ─── Application events (THE DATA MOAT) ──────────────────────────────────────
-- Every application outcome = a free labeled training example.
-- This table accumulates the intelligence that makes JobSync smarter over time.

CREATE TABLE IF NOT EXISTS public.application_events (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    resume_id             UUID REFERENCES public.resumes(id) ON DELETE SET NULL,
    job_id                UUID REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
    analysis_id           UUID REFERENCES public.analyses(id) ON DELETE SET NULL,

    -- Event classification
    event_type            TEXT NOT NULL CHECK (
                              event_type IN (
                                  'APPLIED', 'VIEWED', 'PHONE_SCREEN',
                                  'INTERVIEWED', 'OFFER', 'ACCEPTED',
                                  'REJECTED', 'GHOSTED', 'WITHDRAWN'
                              )
                          ),

    -- Context at time of event (for training data)
    company_name          TEXT,
    job_title             TEXT,
    role_category         TEXT,     -- 'software_engineer', 'ml_engineer', etc.
    career_stage          TEXT,     -- 'entry', 'mid', 'senior'

    -- Scores at time of application (TRAINING FEATURES)
    ats_score             INTEGER DEFAULT 0,
    semantic_score        INTEGER DEFAULT 0,
    technical_score       INTEGER DEFAULT 0,
    overall_score         INTEGER DEFAULT 0,
    interview_probability FLOAT DEFAULT 0,

    -- User-reported metadata
    source                TEXT DEFAULT 'user_reported',  -- 'user_reported' | 'email_tracking'
    metadata              JSONB DEFAULT '{}',

    occurred_at           TIMESTAMPTZ DEFAULT NOW(),
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own events" ON public.application_events
    FOR ALL USING (auth.uid() = user_id);

-- Analysis indexes
CREATE INDEX IF NOT EXISTS app_events_user_idx ON public.application_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS app_events_type_idx ON public.application_events (event_type, role_category);
CREATE INDEX IF NOT EXISTS app_events_analysis_idx ON public.application_events (analysis_id);

-- View: Interview conversion funnel (for analytics dashboard)
CREATE OR REPLACE VIEW public.application_funnel AS
    SELECT
        role_category,
        career_stage,
        COUNT(*) FILTER (WHERE event_type = 'APPLIED')     AS total_applied,
        COUNT(*) FILTER (WHERE event_type = 'INTERVIEWED') AS total_interviewed,
        COUNT(*) FILTER (WHERE event_type = 'OFFER')       AS total_offers,
        ROUND(
            COUNT(*) FILTER (WHERE event_type = 'INTERVIEWED')::NUMERIC /
            NULLIF(COUNT(*) FILTER (WHERE event_type = 'APPLIED'), 0) * 100, 1
        ) AS interview_rate_pct,
        AVG(overall_score) FILTER (WHERE event_type = 'INTERVIEWED') AS avg_score_interviewed,
        AVG(overall_score) FILTER (WHERE event_type = 'REJECTED')    AS avg_score_rejected
    FROM public.application_events
    GROUP BY role_category, career_stage;


-- ─── Keyword performance table ─────────────────────────────────────────────────
-- Tracks which keywords actually correlate with interview success.
-- "Adding 'LangChain' to ML Engineer resumes → 28% interview rate vs 12% baseline"

CREATE TABLE IF NOT EXISTS public.keyword_performance (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword             TEXT NOT NULL,
    role_category       TEXT NOT NULL,
    total_applications  INTEGER DEFAULT 0,
    total_interviews    INTEGER DEFAULT 0,
    interview_rate      FLOAT DEFAULT 0,   -- total_interviews / total_applications
    adoption_rate       FLOAT DEFAULT 0,   -- % of users who added this keyword when suggested
    avg_score_impact    FLOAT DEFAULT 0,   -- avg score improvement after adding keyword
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.keyword_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to keyword performance" ON public.keyword_performance
    FOR SELECT USING (TRUE);
CREATE POLICY "Service can manage keyword performance" ON public.keyword_performance
    FOR ALL WITH CHECK (TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS keyword_perf_unique_idx
    ON public.keyword_performance (keyword, role_category);

CREATE INDEX IF NOT EXISTS keyword_perf_rate_idx
    ON public.keyword_performance (interview_rate DESC)
    WHERE total_applications >= 10;  -- only statistically significant rows


-- ─── Keyword feedback (suggestion adoption) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.keyword_feedback (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id       UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    analysis_id   UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
    keyword       TEXT NOT NULL,
    action        TEXT NOT NULL CHECK (action IN ('ADDED', 'IGNORED')),
    job_title     TEXT,
    job_id        UUID REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
    occurred_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.keyword_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own keyword feedback" ON public.keyword_feedback
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS kw_feedback_keyword_idx ON public.keyword_feedback (keyword, action);


-- ─── Edit deltas (what did users change after our suggestions?) ────────────────

CREATE TABLE IF NOT EXISTS public.edit_deltas (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    analysis_id           UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
    version_before_hash   TEXT NOT NULL,   -- MD5 of resume text before editing
    version_after_hash    TEXT NOT NULL,   -- MD5 of resume text after editing
    keywords_added        JSONB DEFAULT '[]',
    keywords_removed      JSONB DEFAULT '[]',
    bullets_added         JSONB DEFAULT '[]',
    bullets_removed       JSONB DEFAULT '[]',
    score_before          JSONB DEFAULT '{}',
    score_after           JSONB DEFAULT '{}',   -- filled when user re-analyzes
    occurred_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.edit_deltas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own edit deltas" ON public.edit_deltas
    FOR ALL USING (auth.uid() = user_id);


-- ─── Cohort benchmarks ────────────────────────────────────────────────────────
-- "You're in the top 15% of React engineers applying to similar roles."

CREATE TABLE IF NOT EXISTS public.cohort_benchmarks (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_category     TEXT NOT NULL,
    career_stage      TEXT NOT NULL,
    sample_size       INTEGER DEFAULT 0,
    score_percentiles JSONB DEFAULT '{}',  -- {p10, p25, p50, p75, p90, mean}
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cohort_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to cohort benchmarks" ON public.cohort_benchmarks
    FOR SELECT USING (TRUE);
CREATE POLICY "Service can manage cohort benchmarks" ON public.cohort_benchmarks
    FOR ALL WITH CHECK (TRUE);

CREATE UNIQUE INDEX IF NOT EXISTS cohort_benchmarks_unique_idx
    ON public.cohort_benchmarks (role_category, career_stage);


-- ─── Enhanced analyses table (add new intelligence columns) ───────────────────
-- Add intelligence columns to existing analyses table

ALTER TABLE public.analyses
    ADD COLUMN IF NOT EXISTS interview_probability      FLOAT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS skill_gap_score            FLOAT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS recruiter_fit_tier         TEXT DEFAULT 'borderline',
    ADD COLUMN IF NOT EXISTS confidence_level           TEXT DEFAULT 'low',
    ADD COLUMN IF NOT EXISTS cohort_percentile          FLOAT DEFAULT 0.5,
    ADD COLUMN IF NOT EXISTS transferable_skills        JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS matched_concepts           JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS positive_signals           JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS negative_signals           JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS fit_explanation            TEXT,
    ADD COLUMN IF NOT EXISTS learning_roadmap           JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS processing_time_ms         INTEGER DEFAULT 0;


-- ─── Hybrid search function ───────────────────────────────────────────────────
-- Combines vector similarity + keyword relevance for better job discovery

CREATE OR REPLACE FUNCTION find_matching_jobs(
    resume_embedding     vector(384),
    keyword_query        TEXT,
    limit_n              INTEGER DEFAULT 20,
    vector_weight        FLOAT DEFAULT 0.65,
    keyword_weight       FLOAT DEFAULT 0.35
)
RETURNS TABLE (
    job_id        UUID,
    company_name  TEXT,
    job_title     TEXT,
    hybrid_score  FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.id,
        j.company_name,
        j.job_title,
        (
            vector_weight * (1.0 - (j.embedding <=> resume_embedding)) +
            keyword_weight * ts_rank(
                to_tsvector('english', COALESCE(j.raw_text, '')),
                plainto_tsquery('english', keyword_query)
            )
        ) AS hybrid_score
    FROM public.job_descriptions j
    WHERE j.embedding IS NOT NULL
    ORDER BY hybrid_score DESC
    LIMIT limit_n;
END;
$$;


-- ─── Resume ranking function ──────────────────────────────────────────────────
-- Find best resumes for a given job (recruiter-facing feature / future product)

CREATE OR REPLACE FUNCTION find_matching_resumes(
    job_embedding     vector(384),
    role_category     TEXT DEFAULT NULL,
    limit_n           INTEGER DEFAULT 50
)
RETURNS TABLE (
    resume_id       UUID,
    user_id         UUID,
    similarity      FLOAT,
    overall_score   INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id,
        r.user_id,
        1.0 - (r.embedding <=> job_embedding) AS similarity,
        COALESCE((
            SELECT a.overall_score
            FROM public.analyses a
            WHERE a.resume_id = r.id
            ORDER BY a.created_at DESC
            LIMIT 1
        ), 0) AS overall_score
    FROM public.resumes r
    WHERE r.embedding IS NOT NULL
      AND r.is_active = TRUE
    ORDER BY similarity DESC
    LIMIT limit_n;
END;
$$;
