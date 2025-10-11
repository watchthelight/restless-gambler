BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS balances_new (
  user_id TEXT PRIMARY KEY,
  balance TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO balances_new (user_id, balance, updated_at)
SELECT user_id, CAST(balance AS TEXT), COALESCE(updated_at, strftime('%s','now'))
FROM balances;

DROP TABLE IF EXISTS balances;
ALTER TABLE balances_new RENAME TO balances;

CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);

COMMIT;

