-- Job Tracker Status History
-- Run in Supabase SQL Editor after 001_initial_schema.sql

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]';

-- Backfill existing rows with their initial status entry
UPDATE public.job_applications
SET status_history = jsonb_build_array(
  jsonb_build_object(
    'status',    status,
    'timestamp', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'note',      'Initial'
  )
)
WHERE (status_history IS NULL OR status_history = '[]'::jsonb);
