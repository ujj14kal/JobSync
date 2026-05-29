-- ═══════════════════════════════════════════════════════════════
-- Migration 004: AI Scoring Feedback + Analysis AI Fields
-- ═══════════════════════════════════════════════════════════════

-- ─── Scoring Feedback table ───────────────────────────────────────────────────
-- Stores user-reported outcomes to train the calibration model
CREATE TABLE IF NOT EXISTS public.scoring_feedback (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    analysis_id      UUID REFERENCES public.analyses(id) ON DELETE SET NULL,
    outcome          TEXT NOT NULL,
    dimension_scores JSONB,           -- {ats_score, technical_fit_score, ...}
    accuracy_rating  INTEGER CHECK (accuracy_rating BETWEEN 1 AND 5),
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.scoring_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own feedback" ON public.scoring_feedback
    FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS scoring_feedback_analysis_idx ON public.scoring_feedback(analysis_id);
CREATE INDEX IF NOT EXISTS scoring_feedback_outcome_idx  ON public.scoring_feedback(outcome);

-- ─── AI reasoning columns on analyses table ────────────────────────────────
ALTER TABLE public.analyses
    ADD COLUMN IF NOT EXISTS ai_reasoning       JSONB,
    ADD COLUMN IF NOT EXISTS scored_by          TEXT DEFAULT 'rules',
    ADD COLUMN IF NOT EXISTS hire_recommendation TEXT,
    ADD COLUMN IF NOT EXISTS seniority_match    TEXT;
