-- ═══════════════════════════════════════════════════════════════
-- Migration 003: Job Tracker, User Settings, Mentor Pricing
-- ═══════════════════════════════════════════════════════════════

-- ─── Mentor Pricing Columns ──────────────────────────────────────────────────
ALTER TABLE public.mentors
    ADD COLUMN IF NOT EXISTS is_free         BOOLEAN       DEFAULT true,
    ADD COLUMN IF NOT EXISTS price_per_session DECIMAL(10,2),
    ADD COLUMN IF NOT EXISTS currency        TEXT          DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS pricing_model   TEXT          DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS price_display   TEXT          DEFAULT 'Free';

-- Update platform constraint to include mentorcruise
ALTER TABLE public.mentors
    DROP CONSTRAINT IF EXISTS mentors_platform_check;
ALTER TABLE public.mentors
    ADD CONSTRAINT mentors_platform_check
    CHECK (platform IN ('unstop', 'adplist', 'linkedin', 'mentorcruise', 'toptal', 'other'));

-- Add unique constraint for upsert
ALTER TABLE public.mentors
    DROP CONSTRAINT IF EXISTS mentors_name_platform_key;
ALTER TABLE public.mentors
    ADD CONSTRAINT mentors_name_platform_key UNIQUE (name, platform);

-- ─── Job Applications Tracker ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    job_title       TEXT NOT NULL,
    company         TEXT NOT NULL,
    job_url         TEXT,
    job_id          UUID REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
    analysis_id     UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'saved'
                        CHECK (status IN ('saved','applied','screening','interviewing','offer','rejected','withdrawn')),
    applied_date    TIMESTAMPTZ,
    notes           TEXT,
    salary_min      INTEGER,
    salary_max      INTEGER,
    currency        TEXT DEFAULT 'USD',
    location        TEXT,
    job_type        TEXT DEFAULT 'full-time'
                        CHECK (job_type IN ('full-time','part-time','contract','internship','freelance')),
    work_mode       TEXT DEFAULT 'onsite'
                        CHECK (work_mode IN ('remote','hybrid','onsite')),
    priority        TEXT DEFAULT 'medium'
                        CHECK (priority IN ('low','medium','high')),
    ats_score       INTEGER,
    follow_up_date  TIMESTAMPTZ,
    rejection_reason TEXT,
    offer_amount    INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.job_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own applications" ON public.job_applications
    FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS job_applications_user_id_idx ON public.job_applications(user_id);
CREATE INDEX IF NOT EXISTS job_applications_status_idx  ON public.job_applications(status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_job_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER job_applications_updated_at
    BEFORE UPDATE ON public.job_applications
    FOR EACH ROW EXECUTE FUNCTION update_job_applications_updated_at();

-- ─── User Settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id                 UUID PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    -- Notifications
    email_notifications     BOOLEAN DEFAULT true,
    analysis_notifications  BOOLEAN DEFAULT true,
    mentor_notifications    BOOLEAN DEFAULT true,
    weekly_digest           BOOLEAN DEFAULT false,
    marketing_emails        BOOLEAN DEFAULT false,
    -- Defaults
    default_resume_id       UUID,
    -- Career preferences
    career_stage            TEXT DEFAULT 'mid',
    target_roles            TEXT[] DEFAULT ARRAY[]::TEXT[],
    target_companies        TEXT[] DEFAULT ARRAY[]::TEXT[],
    preferred_job_types     TEXT[] DEFAULT ARRAY['full-time']::TEXT[],
    preferred_work_modes    TEXT[] DEFAULT ARRAY['remote','hybrid']::TEXT[],
    preferred_locations     TEXT[] DEFAULT ARRAY[]::TEXT[],
    salary_expectation_min  INTEGER,
    salary_expectation_max  INTEGER,
    salary_currency         TEXT DEFAULT 'USD',
    -- AI scoring preferences
    scoring_weights         JSONB DEFAULT '{
        "ats": 0.20,
        "technical": 0.25,
        "semantic": 0.25,
        "recruiter": 0.20,
        "projects": 0.10
    }'::JSONB,
    -- Privacy
    profile_public          BOOLEAN DEFAULT false,
    share_analytics         BOOLEAN DEFAULT true,
    -- App preferences
    theme                   TEXT DEFAULT 'dark',
    language                TEXT DEFAULT 'en',
    timezone                TEXT DEFAULT 'UTC',
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings" ON public.user_settings
    FOR ALL USING (auth.uid() = user_id);

-- Auto-create settings row when user_profile is inserted
CREATE OR REPLACE FUNCTION create_default_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_create_user_settings
    AFTER INSERT ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION create_default_user_settings();
