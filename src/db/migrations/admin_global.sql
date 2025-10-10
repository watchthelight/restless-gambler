CREATE TABLE IF NOT EXISTS super_admins(
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
-- Keep audit log in global DB (optional but useful)
CREATE TABLE IF NOT EXISTS admin_audit(
  id INTEGER PRIMARY KEY,
  actor_uid TEXT NOT NULL,
  action TEXT NOT NULL,
  target_uid TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_uid);
