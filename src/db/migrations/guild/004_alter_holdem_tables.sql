BEGIN;
-- Ensure holdem_tables has expected columns used by new engine
ALTER TABLE holdem_tables ADD COLUMN big_blind INTEGER;
ALTER TABLE holdem_tables ADD COLUMN min_buyin INTEGER;
ALTER TABLE holdem_tables ADD COLUMN max_buyin INTEGER;
ALTER TABLE holdem_tables ADD COLUMN seats INTEGER NOT NULL DEFAULT 6;
ALTER TABLE holdem_tables ADD COLUMN created_at INTEGER;
COMMIT;

