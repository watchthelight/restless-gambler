BEGIN TRANSACTION;
-- Ensure local admins table exists (idempotent). Global super_admins are
-- queried via attached schema "admin" at runtime; no cross-DB view is used.
CREATE TABLE IF NOT EXISTS guild_admins (
  user_id   TEXT PRIMARY KEY,
  added_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  added_by  TEXT
);
-- Optional index for faster lookups
CREATE INDEX IF NOT EXISTS idx_guild_admins_user ON guild_admins(user_id);
COMMIT;
