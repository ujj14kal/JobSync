-- Migration 008: Expand mentor platform constraint to include all supported platforms
-- The original CHECK only had 4 values; mentor_finder.py actively uses topmate, mentorcruise, toptal.
-- Inserting a mentor from those platforms was silently rejected by the DB constraint.

ALTER TABLE public.mentors
  DROP CONSTRAINT IF EXISTS mentors_platform_check;

ALTER TABLE public.mentors
  ADD CONSTRAINT mentors_platform_check
  CHECK (platform IN ('unstop', 'adplist', 'linkedin', 'mentorcruise', 'topmate', 'toptal', 'other'));
