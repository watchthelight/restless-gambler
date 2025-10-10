BEGIN;

CREATE TABLE IF NOT EXISTS holdem_tables(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  small_blind INTEGER NOT NULL,
  big_blind INTEGER NOT NULL,
  min_buyin INTEGER NOT NULL,
  max_buyin INTEGER NOT NULL,
  seats INTEGER NOT NULL DEFAULT 6,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_holdem_tables_chan ON holdem_tables(channel_id);

CREATE TABLE IF NOT EXISTS holdem_players(
  table_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  stack INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(table_id, user_id),
  FOREIGN KEY(table_id) REFERENCES holdem_tables(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_holdem_players_seat ON holdem_players(table_id, seat);

COMMIT;
