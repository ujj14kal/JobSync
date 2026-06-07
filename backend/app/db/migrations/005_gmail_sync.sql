-- Gmail Sync — stores OAuth tokens for email-based job status tracking
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.gmail_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_email   TEXT NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry  TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE public.gmail_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own gmail connection"
  ON public.gmail_connections FOR ALL
  USING (user_id = auth.uid());
