-- Migration 009: Track scheduled yearly upgrades on user_subscriptions
-- Run in Supabase SQL editor

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS pending_yearly_sub_id  TEXT,
  ADD COLUMN IF NOT EXISTS upgrade_scheduled_for  TIMESTAMPTZ;
