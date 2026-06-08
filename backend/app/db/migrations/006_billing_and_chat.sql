-- ============================================================
-- Migration 006: Billing, token tracking, chat history
-- Run in Supabase SQL editor
-- ============================================================

-- ── User subscriptions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan                      TEXT NOT NULL DEFAULT 'free',     -- 'free' | 'pro'
  billing_cycle             TEXT DEFAULT NULL,                -- 'monthly' | 'yearly'
  status                    TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'cancelled' | 'expired'
  razorpay_subscription_id  TEXT,
  razorpay_customer_id      TEXT,
  current_period_start      TIMESTAMPTZ,
  current_period_end        TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ── One-time purchase credits ──────────────────────────────────────────────
-- Tracks pay-per-use credits (resume pack, cover letter, interview session)
CREATE TABLE IF NOT EXISTS user_credits (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_type      TEXT NOT NULL,  -- 'ats_deep'|'resume'|'cover_letter'|'interview_text'|'interview_voice'
  credits_total    INTEGER NOT NULL DEFAULT 0,
  credits_used     INTEGER NOT NULL DEFAULT 0,
  razorpay_order_id TEXT,
  purchased_at     TIMESTAMPTZ DEFAULT NOW(),
  expires_at       TIMESTAMPTZ  -- NULL = never
);

-- Helper view: credits_remaining
CREATE OR REPLACE VIEW user_credits_summary AS
  SELECT
    user_id,
    credit_type,
    SUM(credits_total - credits_used) AS credits_remaining
  FROM user_credits
  WHERE (expires_at IS NULL OR expires_at > NOW())
  GROUP BY user_id, credit_type;

-- ── Token usage (every Claude API call logged here) ────────────────────────
CREATE TABLE IF NOT EXISTS token_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feature        TEXT NOT NULL,  -- 'ats'|'resume'|'cover_letter'|'interview'|'chat'|'voice'
  model          TEXT NOT NULL DEFAULT 'claude-sonnet-4-5',
  tokens_input   INTEGER NOT NULL DEFAULT 0,
  tokens_output  INTEGER NOT NULL DEFAULT 0,
  tokens_total   INTEGER NOT NULL DEFAULT 0,
  cost_usd       NUMERIC(12, 8) NOT NULL DEFAULT 0,
  cost_inr       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_user_month
  ON token_usage (user_id, created_at);

-- ── Monthly usage summary (refreshed on every Claude call) ────────────────
CREATE TABLE IF NOT EXISTS monthly_usage (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  month                 TEXT NOT NULL,  -- 'YYYY-MM'
  ats_count             INTEGER DEFAULT 0,
  resume_count          INTEGER DEFAULT 0,
  cover_count           INTEGER DEFAULT 0,
  interview_text_count  INTEGER DEFAULT 0,
  interview_voice_count INTEGER DEFAULT 0,
  chat_tokens           INTEGER DEFAULT 0,
  total_tokens          INTEGER DEFAULT 0,
  total_cost_inr        NUMERIC(10,2) DEFAULT 0,
  UNIQUE (user_id, month)
);

-- ── Chat message history ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL DEFAULT gen_random_uuid(),
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session
  ON chat_messages (user_id, session_id, created_at);

-- ── Row-level security ─────────────────────────────────────────────────────
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits       ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage        ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_usage      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      ENABLE ROW LEVEL SECURITY;

-- Users can only read their own data; backend service-role bypasses RLS
CREATE POLICY "Users read own subscription" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own credits"      ON user_credits       FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own token usage"  ON token_usage        FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own monthly usage"ON monthly_usage      FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own chat"         ON chat_messages      FOR SELECT USING (auth.uid() = user_id);

-- ── Ensure every user has a subscription row (default free) ───────────────
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_billing ON auth.users;
CREATE TRIGGER on_auth_user_created_billing
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_subscription();
