BEGIN;
-- Loan reminder metadata on each loan
ALTER TABLE loans ADD COLUMN last_reminder_ts INTEGER DEFAULT NULL;
ALTER TABLE loans ADD COLUMN reminder_count INTEGER NOT NULL DEFAULT 0;

-- Per-user reminder preferences
CREATE TABLE IF NOT EXISTS loan_user_prefs (
  user_id TEXT PRIMARY KEY,
  remind INTEGER NOT NULL DEFAULT 1,        -- 1 = on, 0 = off
  snooze_until_ts INTEGER DEFAULT NULL,
  updated_at INTEGER NOT NULL
);

-- Optional: stash a guild channel for reminders in guild_settings as KV
-- If your schema is key/value, no extra migration is required beyond using the key below:
--   key = 'loan_reminder_channel_id', value = <channelId>
COMMIT;

