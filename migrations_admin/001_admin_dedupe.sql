-- Deduplicate by user_id retaining strongest role (super > admin)
-- If a legacy table with duplicates exists, merge into primary table.

-- Merge from legacy table if present
INSERT OR REPLACE INTO admin_users(user_id, role)
SELECT user_id,
       CASE WHEN INSTR(GROUP_CONCAT(role), 'super') > 0 THEN 'super' ELSE 'admin' END AS role
FROM (
  SELECT au.user_id AS user_id, au.role AS role
  FROM admin_users au
  UNION ALL
  SELECT l.user_id AS user_id, l.role AS role
  FROM sqlite_master sm
  JOIN admin_users_legacy l ON sm.name = 'admin_users_legacy'
)
GROUP BY user_id;

-- Drop legacy table if it exists
DROP TABLE IF EXISTS admin_users_legacy;

