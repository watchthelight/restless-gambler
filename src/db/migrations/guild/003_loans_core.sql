BEGIN;
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  principal INTEGER NOT NULL,         -- in bolts
  apr_bps INTEGER NOT NULL,           -- APR in basis points (e.g., 1250 = 12.50%)
  term_days INTEGER NOT NULL,
  start_ts INTEGER NOT NULL,
  due_ts INTEGER NOT NULL,
  accrued_interest INTEGER NOT NULL DEFAULT 0,
  paid_principal INTEGER NOT NULL DEFAULT 0,
  paid_interest INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',  -- active|paid|late|defaulted|forgiven
  last_accrual_ts INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS loans_user ON loans(user_id);
CREATE INDEX IF NOT EXISTS loans_status ON loans(status);

CREATE TABLE IF NOT EXISTS credit_scores (
  user_id TEXT PRIMARY KEY,
  score INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
COMMIT;

