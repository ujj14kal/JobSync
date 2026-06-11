-- ============================================================
-- 011: Security function hardening
-- 1. Revoke EXECUTE from anon + authenticated on SECURITY DEFINER
--    functions that should never be called via REST/RPC.
-- 2. Lock search_path on functions flagged by the advisor
--    (prevents search-path injection attacks).
-- ============================================================

-- ── 1. Revoke EXECUTE on privileged RPC functions ────────────────────────────

-- anon can drain any user's credits by calling this directly
REVOKE EXECUTE ON FUNCTION public.consume_user_credit(uuid, text)
  FROM anon, authenticated;

-- anon can inflate any user's monthly usage counters
REVOKE EXECUTE ON FUNCTION public.increment_monthly_usage(uuid, text, text, integer, numeric, integer)
  FROM anon, authenticated;

-- trigger functions — should never be callable via REST
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_default_subscription()
  FROM anon, authenticated;

-- ── 2. Lock search_path ──────────────────────────────────────────────────────

-- These functions reference unqualified table names; locking to 'public'
-- prevents a rogue schema injected earlier in search_path from shadowing them.
ALTER FUNCTION public.consume_user_credit(uuid, text)
  SET search_path = 'public';

ALTER FUNCTION public.increment_monthly_usage(uuid, text, text, integer, numeric, integer)
  SET search_path = 'public';

-- These functions use fully-qualified names (public.table) so empty
-- search_path is safe and maximally restrictive.
ALTER FUNCTION public.update_job_applications_updated_at()
  SET search_path = '';

ALTER FUNCTION public.find_matching_jobs(vector, text, integer, double precision, double precision)
  SET search_path = '';

ALTER FUNCTION public.find_matching_resumes(vector, text, integer)
  SET search_path = '';

ALTER FUNCTION public.create_default_user_settings()
  SET search_path = '';
