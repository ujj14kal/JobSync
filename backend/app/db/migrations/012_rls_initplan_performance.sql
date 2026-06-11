-- ============================================================
-- 012: RLS initplan performance fix
-- Replace auth.uid() with (select auth.uid()) in all row-level
-- security policies.  The subselect form is evaluated once as an
-- initplan and cached for the entire query; the bare function call
-- is re-evaluated for every scanned row, which kills performance
-- on large tables.
-- ============================================================

-- ── analyses ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can CRUD own analyses" ON public.analyses;
CREATE POLICY "Users can CRUD own analyses" ON public.analyses
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── application_events ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can CRUD own events" ON public.application_events;
CREATE POLICY "Users can CRUD own events" ON public.application_events
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── chat_messages ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own chat" ON public.chat_messages;
CREATE POLICY "Users read own chat" ON public.chat_messages
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── edit_deltas ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can CRUD own edit deltas" ON public.edit_deltas;
CREATE POLICY "Users can CRUD own edit deltas" ON public.edit_deltas
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── gmail_connections ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own gmail connection" ON public.gmail_connections;
CREATE POLICY "Users can manage own gmail connection" ON public.gmail_connections
  FOR ALL USING (user_id = (select auth.uid()));

-- ── job_applications ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own applications" ON public.job_applications;
CREATE POLICY "Users manage own applications" ON public.job_applications
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── keyword_feedback ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can CRUD own keyword feedback" ON public.keyword_feedback;
CREATE POLICY "Users can CRUD own keyword feedback" ON public.keyword_feedback
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── mentor_recommendations ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own recommendations" ON public.mentor_recommendations;
CREATE POLICY "Users can view own recommendations" ON public.mentor_recommendations
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── monthly_usage ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own monthly usage" ON public.monthly_usage;
CREATE POLICY "Users read own monthly usage" ON public.monthly_usage
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── resume_chunks ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own resume chunks" ON public.resume_chunks;
CREATE POLICY "Users can view own resume chunks" ON public.resume_chunks
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── resumes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can CRUD own resumes" ON public.resumes;
CREATE POLICY "Users can CRUD own resumes" ON public.resumes
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── scoring_feedback ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own feedback" ON public.scoring_feedback;
CREATE POLICY "Users manage own feedback" ON public.scoring_feedback
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── token_usage ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own token usage" ON public.token_usage;
CREATE POLICY "Users read own token usage" ON public.token_usage
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── user_credits ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own credits" ON public.user_credits;
CREATE POLICY "Users read own credits" ON public.user_credits
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ── user_profiles (3 policies) ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.user_profiles;
CREATE POLICY "Users can insert own profile" ON public.user_profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- ── user_settings ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL USING ((select auth.uid()) = user_id);

-- ── user_subscriptions ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own subscription" ON public.user_subscriptions;
CREATE POLICY "Users read own subscription" ON public.user_subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);
