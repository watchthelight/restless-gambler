-- Core admin schema (idempotent)
CREATE TABLE IF NOT EXISTS admin_users(
  user_id TEXT PRIMARY KEY,
  role TEXT CHECK(role IN ('super','admin')) NOT NULL
);

-- Import legacy super_admins into admin_users as super if table exists
-- Note: This will fail silently if super_admins doesn't exist, which is fine
-- The migration runner will catch and ignore the error
INSERT OR IGNORE INTO admin_users(user_id, role)
SELECT user_id, 'super'
FROM super_admins
WHERE NOT EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = super_admins.user_id);

-- Helpful index (redundant with PK but future-safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_user ON admin_users(user_id);

