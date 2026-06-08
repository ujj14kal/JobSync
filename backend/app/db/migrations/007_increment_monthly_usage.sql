-- ============================================================
-- Migration 007: increment_monthly_usage RPC + free resume counter
-- Run in Supabase SQL editor
-- ============================================================

-- Atomically upsert a user's monthly_usage row and increment counters.
-- Used by every AI call (Claude + Groq) so we never double-count.
CREATE OR REPLACE FUNCTION increment_monthly_usage(
  p_user_id    UUID,
  p_month      TEXT,
  p_feature_col TEXT,   -- e.g. 'resume_count', '' to skip
  p_tokens     INTEGER DEFAULT 0,
  p_cost_inr   NUMERIC  DEFAULT 0,
  p_chat_tokens INTEGER DEFAULT 0
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO monthly_usage (
    user_id, month,
    resume_count, ats_count, cover_count,
    interview_text_count, interview_voice_count,
    chat_tokens, total_tokens, total_cost_inr
  )
  VALUES (
    p_user_id, p_month,
    CASE WHEN p_feature_col = 'resume_count'          THEN 1 ELSE 0 END,
    CASE WHEN p_feature_col = 'ats_count'             THEN 1 ELSE 0 END,
    CASE WHEN p_feature_col = 'cover_count'           THEN 1 ELSE 0 END,
    CASE WHEN p_feature_col = 'interview_text_count'  THEN 1 ELSE 0 END,
    CASE WHEN p_feature_col = 'interview_voice_count' THEN 1 ELSE 0 END,
    p_chat_tokens,
    p_tokens,
    p_cost_inr
  )
  ON CONFLICT (user_id, month) DO UPDATE SET
    resume_count          = monthly_usage.resume_count
                            + CASE WHEN p_feature_col = 'resume_count'          THEN 1 ELSE 0 END,
    ats_count             = monthly_usage.ats_count
                            + CASE WHEN p_feature_col = 'ats_count'             THEN 1 ELSE 0 END,
    cover_count           = monthly_usage.cover_count
                            + CASE WHEN p_feature_col = 'cover_count'           THEN 1 ELSE 0 END,
    interview_text_count  = monthly_usage.interview_text_count
                            + CASE WHEN p_feature_col = 'interview_text_count'  THEN 1 ELSE 0 END,
    interview_voice_count = monthly_usage.interview_voice_count
                            + CASE WHEN p_feature_col = 'interview_voice_count' THEN 1 ELSE 0 END,
    chat_tokens           = monthly_usage.chat_tokens   + p_chat_tokens,
    total_tokens          = monthly_usage.total_tokens  + p_tokens,
    total_cost_inr        = monthly_usage.total_cost_inr + p_cost_inr;
END;
$$;
