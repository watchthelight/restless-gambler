CREATE TABLE IF NOT EXISTS _migrations(
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_settings(
  id INTEGER PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guild_settings_key ON guild_settings(key);
CREATE TABLE IF NOT EXISTS guild_admins(
  user_id TEXT PRIMARY KEY,
  added_at INTEGER NOT NULL
);
