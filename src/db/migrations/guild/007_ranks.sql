-- Rank & XP system
CREATE TABLE IF NOT EXISTS user_ranks (
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Luck buffs
CREATE TABLE IF NOT EXISTS user_buffs (
  user_id TEXT PRIMARY KEY,
  luck_bps INTEGER NOT NULL,
  granted_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_ranks_level ON user_ranks(level DESC);
CREATE INDEX IF NOT EXISTS idx_user_ranks_updated ON user_ranks(updated_at);
CREATE INDEX IF NOT EXISTS idx_user_buffs_expires ON user_buffs(expires_at);
