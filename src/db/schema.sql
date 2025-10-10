-- wallets table
CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  delta INTEGER,
  reason TEXT,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  max_bet INTEGER,
  min_bet INTEGER,
  faucet_limit INTEGER,
  public_results INTEGER,
  theme TEXT
);

-- Try to add theme column for existing deployments (ignore if already exists)
ALTER TABLE guild_settings ADD COLUMN theme TEXT;

CREATE TABLE IF NOT EXISTS holdem_tables (
  id INTEGER PRIMARY KEY,
  guild_id TEXT,
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
CREATE INDEX IF NOT EXISTS idx_holdem_tables_updated ON holdem_tables(updated_at);

CREATE TABLE IF NOT EXISTS blackjack_sessions (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  channel_id TEXT,
  state_json TEXT,
  updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_blackjack_sessions_user ON blackjack_sessions(user_id);

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
