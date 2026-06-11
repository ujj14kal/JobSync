-- ============================================================
-- 013: FAQ community questions
-- Users post questions; only the admin account can answer them.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.faq_questions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question    TEXT        NOT NULL CHECK (char_length(question) BETWEEN 10 AND 1000),
  answer      TEXT,
  answered_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for listing by newest first
CREATE INDEX IF NOT EXISTS faq_questions_created_at_idx
  ON public.faq_questions (created_at DESC);

ALTER TABLE public.faq_questions ENABLE ROW LEVEL SECURITY;

-- Everyone (including anon) can read all questions
CREATE POLICY "Anyone can view faq questions" ON public.faq_questions
  FOR SELECT USING (true);

-- Authenticated users can post their own questions
CREATE POLICY "Users can post faq questions" ON public.faq_questions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Only the admin email can answer (UPDATE)
CREATE POLICY "Admin can answer faq questions" ON public.faq_questions
  FOR UPDATE
  USING  ((select auth.jwt() ->> 'email') = 'ujj.kalra10@gmail.com')
  WITH CHECK ((select auth.jwt() ->> 'email') = 'ujj.kalra10@gmail.com');
