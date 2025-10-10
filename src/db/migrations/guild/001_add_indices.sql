-- Per-guild indices for performance and stability
CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_blackjack_sessions_status ON blackjack_sessions(status);
CREATE INDEX IF NOT EXISTS idx_blackjack_sessions_user ON blackjack_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_blackjack_sessions_updated ON blackjack_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_guild_admins_user ON guild_admins(user_id);
CREATE INDEX IF NOT EXISTS idx_holdem_tables_updated ON holdem_tables(updated_at);
