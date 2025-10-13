-- Add updated_at column to guild_settings
ALTER TABLE guild_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
