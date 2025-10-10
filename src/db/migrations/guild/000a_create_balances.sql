-- Ensure tables exist before any index migrations
CREATE TABLE IF NOT EXISTS balances(
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blackjack_sessions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  deck_json TEXT NOT NULL,
  player_json TEXT NOT NULL,
  dealer_json TEXT NOT NULL,
  bet INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS u_active_bj ON blackjack_sessions(channel_id,user_id) WHERE status='active';
CREATE TABLE IF NOT EXISTS holdem_tables(
  id INTEGER PRIMARY KEY,
  channel_id TEXT,
  thread_id TEXT,
  owner_id TEXT,
  small_blind INTEGER,
  buy_in_min INTEGER,
  buy_in_max INTEGER,
  status TEXT,
  state_json TEXT,
  updated_at INTEGER
);
