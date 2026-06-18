-- Migration 003: SaaS feature columns
-- Run in Supabase SQL editor

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS interview_prep JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS resume_completeness JSONB;
