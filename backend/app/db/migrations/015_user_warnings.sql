-- User warning system: admin sends warnings, users must acknowledge them

CREATE TABLE IF NOT EXISTS user_warnings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message          TEXT        NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at  TIMESTAMPTZ,
  warning_number   INTEGER     NOT NULL DEFAULT 1
);

ALTER TABLE user_warnings ENABLE ROW LEVEL SECURITY;

-- Users can read their own warnings
CREATE POLICY "warn_select_own"
  ON user_warnings FOR SELECT
  USING (auth.uid() = user_id);

-- Users can acknowledge (update) their own warnings
CREATE POLICY "warn_ack_own"
  ON user_warnings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Fast lookup: pending warnings for a user
CREATE INDEX IF NOT EXISTS idx_user_warnings_user
  ON user_warnings (user_id, acknowledged_at, sent_at DESC);
