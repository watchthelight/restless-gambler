-- Global admin DB indices
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit(actor_uid);
