CREATE TABLE IF NOT EXISTS cooldowns(
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  next_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_cooldowns_next ON cooldowns(next_at);

