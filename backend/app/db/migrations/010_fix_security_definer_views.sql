-- Migration 010: Fix CRITICAL security advisories — SECURITY DEFINER views
-- Supabase flagged application_funnel and user_credits_summary as running with
-- owner privileges instead of the caller's, bypassing RLS.
-- security_invoker = true makes them respect the caller's RLS policies.
-- Run in Supabase SQL editor.

ALTER VIEW public.application_funnel   SET (security_invoker = true);
ALTER VIEW public.user_credits_summary SET (security_invoker = true);
