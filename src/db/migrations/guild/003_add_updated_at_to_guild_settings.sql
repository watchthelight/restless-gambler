-- Add updated_at column to guild_settings if missing
-- This handles databases that were created before this column was added

-- SQLite requires a constant default value for ALTER TABLE ADD COLUMN with NOT NULL
-- We use 0 as the default, which will be updated on first write
ALTER TABLE guild_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
