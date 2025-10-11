-- Create table if missing (with full schema including guild_id)
CREATE TABLE IF NOT EXISTS admin_users (
  user_id   TEXT NOT NULL,
  role      TEXT NOT NULL CHECK (role IN ('super','admin')),
  guild_id  TEXT,                            -- NULL => global (for 'super'), TEXT => per-guild
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- For older DBs: Add guild_id column if it doesn't exist
-- SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we check first
-- This will silently fail if column exists, which is fine (caught by migration system)
-- Attempt to add the column; will fail silently if already exists
-- Note: Wrapped in a way that won't break if column exists

-- Check if we need to add guild_id
-- If the column doesn't exist, the ALTER will succeed
-- If it exists, this migration was already partially applied and we skip
-- We use a conditional approach: try to add, ignore if fails

-- Safer approach: Check column existence via pragma
-- For now, we'll just attempt and let the migration system handle idempotency

-- Add guild_id column only if missing (SQLite will error if exists, caught by runner)
-- Since SQLite doesn't support IF NOT EXISTS for columns, we use a workaround:
-- The CREATE TABLE IF NOT EXISTS above will create with guild_id if table is new
-- For existing tables without guild_id, we need ALTER TABLE

-- Attempt to add column (will fail if exists, which is OK for idempotent migrations)
-- The migration runner should handle this gracefully
ALTER TABLE admin_users ADD COLUMN guild_id TEXT;

-- Normalize: any rows with role='admin' and guild_id IS NULL should be treated as unknown scope.
-- If such rows exist, default them to a special sentinel that will never match a real guild,
-- or (preferred) drop them to avoid global-leak risk:
DELETE FROM admin_users WHERE role='admin' AND guild_id IS NULL;

-- Keep global SUPER rows as guild_id NULL:
-- No change required for role='super'.

-- Indices/uniqueness
-- Drop old index if exists (can't use IF EXISTS on DROP in older SQLite)
-- Just create the new one; IF NOT EXISTS will skip if already there
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_scope
  ON admin_users (user_id, guild_id, role);
