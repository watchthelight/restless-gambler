BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS command_control (
  guild_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'normal',       -- 'normal' | 'whitelist'
  whitelist_json TEXT NOT NULL DEFAULT '[]', -- array of allowed command names (lowercase)
  snapshot_json TEXT NOT NULL DEFAULT '[]',  -- prior command set (for reference)
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
COMMIT;

