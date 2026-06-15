-- Interview sessions history
-- Stores completed interview sessions so users can review past reports.

CREATE TABLE IF NOT EXISTS interview_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT        NOT NULL,
  company       TEXT        NOT NULL DEFAULT 'General',
  questions     JSONB       NOT NULL DEFAULT '[]',
  answers       JSONB       NOT NULL DEFAULT '[]',
  feedback      JSONB       NOT NULL DEFAULT '[]',
  report        JSONB,
  overall_score NUMERIC(4,2),
  interview_pct INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users can only see their own sessions
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interview_sessions_select_own"
  ON interview_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "interview_sessions_insert_own"
  ON interview_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "interview_sessions_delete_own"
  ON interview_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast per-user history lookups
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_created
  ON interview_sessions (user_id, created_at DESC);
