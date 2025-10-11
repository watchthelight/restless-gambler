BEGIN;
-- Per-guild user notification preferences for loan due reminders
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id   TEXT NOT NULL,
  guild_id  TEXT NOT NULL,
  loan_due_reminders INTEGER NOT NULL DEFAULT 1, -- 1=on, 0=off
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, guild_id)
);
COMMIT;

