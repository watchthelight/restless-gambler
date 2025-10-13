-- Migration: Convert all numeric amounts to HugeDecimal JSON format
-- This ensures exact precision for all values and eliminates BigInt/number mixing

-- Step 1: Migrate balances to HugeDecimal JSON format
-- For existing TEXT balances, we need to convert plain numbers to JSON format
-- Format: {"t":"hd","s":1,"m":"mantissa","sc":"0","e":"0"}

CREATE TABLE IF NOT EXISTS balances_huge (
  user_id TEXT PRIMARY KEY,
  balance TEXT NOT NULL DEFAULT '{"t":"hd","s":0,"m":"0","sc":"0","e":"0"}',
  updated_at INTEGER NOT NULL
);

-- Migrate existing balances
-- Note: This handles both old INTEGER values and TEXT values
INSERT INTO balances_huge (user_id, balance, updated_at)
SELECT
  user_id,
  CASE
    -- If balance is already JSON (starts with {), keep it
    WHEN balance LIKE '{%' THEN balance
    -- Otherwise, convert plain number to JSON
    ELSE '{"t":"hd","s":' ||
      CASE WHEN CAST(balance AS INTEGER) < 0 THEN '-1' ELSE CASE WHEN CAST(balance AS INTEGER) = 0 THEN '0' ELSE '1' END END ||
      ',"m":"' || ABS(CAST(balance AS INTEGER)) || '","sc":"0","e":"0"}'
  END as balance,
  COALESCE(updated_at, strftime('%s','now')) as updated_at
FROM balances;

DROP TABLE IF EXISTS balances;
ALTER TABLE balances_huge RENAME TO balances;

CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);

-- Step 2: Ensure user_ranks table uses TEXT for xp (create if doesn't exist)
CREATE TABLE IF NOT EXISTS user_ranks (
  user_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  xp TEXT NOT NULL DEFAULT '{"t":"hd","s":0,"m":"0","sc":"0","e":"0"}',
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Step 3: Migrate bet amounts in game session tables
-- blackjack_sessions
CREATE TABLE IF NOT EXISTS blackjack_sessions_huge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  deck_json TEXT NOT NULL,
  player_json TEXT NOT NULL,
  dealer_json TEXT NOT NULL,
  bet TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO blackjack_sessions_huge
SELECT
  id, channel_id, user_id, deck_json, player_json, dealer_json,
  CASE
    WHEN bet LIKE '{%' THEN bet
    ELSE '{"t":"hd","s":1,"m":"' || ABS(CAST(bet AS INTEGER)) || '","sc":"0","e":"0"}'
  END as bet,
  status, created_at, updated_at
FROM blackjack_sessions
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='blackjack_sessions');

DROP TABLE IF EXISTS blackjack_sessions;
ALTER TABLE blackjack_sessions_huge RENAME TO blackjack_sessions;

CREATE UNIQUE INDEX IF NOT EXISTS u_active_bj ON blackjack_sessions(channel_id,user_id) WHERE status='active';

-- Step 4: Migrate holdem_tables
CREATE TABLE IF NOT EXISTS holdem_tables_huge (
  id INTEGER PRIMARY KEY,
  channel_id TEXT,
  thread_id TEXT,
  owner_id TEXT,
  small_blind TEXT,
  buy_in_min TEXT,
  buy_in_max TEXT,
  status TEXT,
  state_json TEXT,
  updated_at INTEGER
);

INSERT INTO holdem_tables_huge
SELECT
  id, channel_id, thread_id, owner_id,
  CASE
    WHEN small_blind LIKE '{%' THEN small_blind
    ELSE '{"t":"hd","s":1,"m":"' || ABS(CAST(small_blind AS INTEGER)) || '","sc":"0","e":"0"}'
  END as small_blind,
  CASE
    WHEN buy_in_min LIKE '{%' THEN buy_in_min
    ELSE '{"t":"hd","s":1,"m":"' || ABS(CAST(buy_in_min AS INTEGER)) || '","sc":"0","e":"0"}'
  END as buy_in_min,
  CASE
    WHEN buy_in_max LIKE '{%' THEN buy_in_max
    ELSE '{"t":"hd","s":1,"m":"' || ABS(CAST(buy_in_max AS INTEGER)) || '","sc":"0","e":"0"}'
  END as buy_in_max,
  status, state_json, updated_at
FROM holdem_tables
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='holdem_tables');

DROP TABLE IF EXISTS holdem_tables;
ALTER TABLE holdem_tables_huge RENAME TO holdem_tables;

-- Step 5: Migrate game history tables (roulette, slots)
CREATE TABLE IF NOT EXISTS roulette_rounds_huge (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  channel_id TEXT,
  bets_json TEXT,
  result INTEGER,
  payout_total TEXT,
  created_at INTEGER
);

INSERT INTO roulette_rounds_huge
SELECT
  id, user_id, channel_id, bets_json, result,
  CASE
    WHEN payout_total LIKE '{%' THEN payout_total
    ELSE '{"t":"hd","s":' ||
      CASE WHEN CAST(payout_total AS INTEGER) < 0 THEN '-1' ELSE CASE WHEN CAST(payout_total AS INTEGER) = 0 THEN '0' ELSE '1' END END ||
      ',"m":"' || ABS(CAST(payout_total AS INTEGER)) || '","sc":"0","e":"0"}'
  END as payout_total,
  created_at
FROM roulette_rounds
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='roulette_rounds');

DROP TABLE IF EXISTS roulette_rounds;
ALTER TABLE roulette_rounds_huge RENAME TO roulette_rounds;

CREATE INDEX IF NOT EXISTS idx_roulette_rounds_user ON roulette_rounds(user_id);

-- Slots rounds
CREATE TABLE IF NOT EXISTS slots_rounds_huge (
  id INTEGER PRIMARY KEY,
  user_id TEXT,
  channel_id TEXT,
  bet TEXT,
  grid_json TEXT,
  payout TEXT,
  created_at INTEGER
);

INSERT INTO slots_rounds_huge
SELECT
  id, user_id, channel_id,
  CASE
    WHEN bet LIKE '{%' THEN bet
    ELSE '{"t":"hd","s":1,"m":"' || ABS(CAST(bet AS INTEGER)) || '","sc":"0","e":"0"}'
  END as bet,
  grid_json,
  CASE
    WHEN payout LIKE '{%' THEN payout
    ELSE '{"t":"hd","s":' ||
      CASE WHEN CAST(payout AS INTEGER) < 0 THEN '-1' ELSE CASE WHEN CAST(payout AS INTEGER) = 0 THEN '0' ELSE '1' END END ||
      ',"m":"' || ABS(CAST(payout AS INTEGER)) || '","sc":"0","e":"0"}'
  END as payout,
  created_at
FROM slots_rounds
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='slots_rounds');

DROP TABLE IF EXISTS slots_rounds;
ALTER TABLE slots_rounds_huge RENAME TO slots_rounds;

CREATE INDEX IF NOT EXISTS idx_slots_rounds_user ON slots_rounds(user_id);

-- Step 6: Migrate loans tables if they exist
CREATE TABLE IF NOT EXISTS loans_huge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  amount TEXT NOT NULL,
  interest_bps INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO loans_huge
SELECT
  id, user_id,
  CASE
    WHEN amount LIKE '{%' THEN amount
    ELSE '{"t":"hd","s":1,"m":"' || ABS(CAST(amount AS INTEGER)) || '","sc":"0","e":"0"}'
  END as amount,
  interest_bps, due_at, status, created_at, updated_at
FROM loans
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='loans');

DROP TABLE IF EXISTS loans;
ALTER TABLE loans_huge RENAME TO loans;

CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
