BEGIN;
CREATE TABLE IF NOT EXISTS guild_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO guild_config(key, value, updated_at)
VALUES ('max_bet', 'unlimited', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Lightweight per-guild audit log for JSON messages
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
COMMIT;

