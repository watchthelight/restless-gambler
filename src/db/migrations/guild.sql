CREATE TABLE IF NOT EXISTS users(
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS balances(
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS guild_settings(
  min_bet INTEGER NOT NULL DEFAULT 10,
  max_bet INTEGER NOT NULL DEFAULT 10000,
  faucet_limit INTEGER NOT NULL DEFAULT 100,
  public_results INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'midnight',
  cards_style TEXT NOT NULL DEFAULT 'unicode'
);
CREATE TABLE IF NOT EXISTS guild_admins(
  user_id TEXT PRIMARY KEY,
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
CREATE UNIQUE INDEX IF NOT EXISTS u_active_bj
  ON blackjack_sessions(channel_id,user_id)
  WHERE status='active';
-- History tables used by games (present in repo)
CREATE TABLE IF NOT EXISTS roulette_rounds (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  channel_id TEXT,
  bets_json TEXT,
  result INTEGER,
  payout_total INTEGER,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_roulette_rounds_user ON roulette_rounds(user_id);
CREATE TABLE IF NOT EXISTS slots_rounds (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  channel_id TEXT,
  bet INTEGER,
  grid_json TEXT,
  payout INTEGER,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_slots_rounds_user ON slots_rounds(user_id);
CREATE TABLE IF NOT EXISTS holdem_tables (
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
