import Database from 'better-sqlite3';
import { ensureAdminAttached } from '../db/adminGlobal.js';

export type AdminRole = 'super' | 'admin';

function ensureAttached(db: Database.Database) {
  // Idempotent: safe to call repeatedly
  ensureAdminAttached(db);
}

function adminUsersHasRoleColumn(db: Database.Database): boolean {
  try {
    const cols = db.prepare("PRAGMA admin.table_info(admin_users)").all() as Array<{ name: string, notnull?: number }>;
    return cols.some(c => String(c.name).toLowerCase() === 'role');
  } catch {
    return false;
  }
}

export function getRole(db: Database.Database, userId: string): AdminRole | null {
  ensureAttached(db);
  // SUPER takes precedence
  const s = db.prepare(`SELECT 1 FROM admin.super_admins WHERE user_id = ? LIMIT 1`).get(userId) as any;
  if (s) return 'super';
  // Then admin_users; support legacy role column if present
  const hasRole = adminUsersHasRoleColumn(db);
  if (hasRole) {
    const row = db.prepare(`SELECT role FROM adminRNK.admin_users WHERE user_id = ?`).get(userId) as { role?: AdminRole } | undefined;
    return (row?.role as AdminRole) ?? null;
  } else {
    const row = db.prepare(`SELECT 1 FROM admin.admin_users WHERE user_id = ? LIMIT 1`).get(userId) as any;
    return row ? 'admin' : null;
  }
}

export function isAdmin(db: Database.Database, userId: string): boolean {
  const role = getRole(db, userId);
  return role === 'admin' || role === 'super';
}

export function isSuper(db: Database.Database, userId: string): boolean {
  return getRole(db, userId) === 'super';
}

// Overload declarations
export function addAdmin(db: Database.Database, userId: string, role: AdminRole): 'inserted' | 'updated' | 'same';
export function addAdmin(db: Database.Database, guildId: string, userId: string): void;
export function addAdmin(db: Database.Database, arg1: string, arg2: string, arg3?: AdminRole): 'inserted' | 'updated' | 'same' | void {
  ensureAttached(db);
  if (arg3 !== undefined) {
    // Old signature: (db, userId, role)
    const userId = arg1;
    const role = arg3;
    const current = getRole(db, userId);
    if (!current) {
      if (role === 'super') {
        db.prepare(`INSERT INTO admin.super_admins(user_id) VALUES(?)`).run(userId);
        return 'inserted';
      } else {
        const hasRole = adminUsersHasRoleColumn(db);
        if (hasRole) db.prepare(`INSERT INTO admin.admin_users(user_id, role) VALUES(?, 'admin')`).run(userId);
        else db.prepare(`INSERT INTO admin.admin_users(user_id) VALUES(?)`).run(userId);
        return 'inserted';
      }
    }
    if (current === role) return 'same';
    // Move between sets
    if (role === 'super') {
      // Demote from admin_users if present; then add to super_admins
      try { db.prepare(`DELETE FROM admin.admin_users WHERE user_id = ?`).run(userId); } catch { }
      db.prepare(`INSERT OR IGNORE INTO admin.super_admins(user_id) VALUES(?)`).run(userId);
      return 'updated';
    } else {
      // Remove from super_admins; add to admin_users
      try { db.prepare(`DELETE FROM admin.super_admins WHERE user_id = ?`).run(userId); } catch { }
      const hasRole = adminUsersHasRoleColumn(db);
      if (hasRole) db.prepare(`INSERT OR REPLACE INTO admin.admin_users(user_id, role) VALUES(?, 'admin')`).run(userId);
      else db.prepare(`INSERT OR IGNORE INTO admin.admin_users(user_id) VALUES(?)`).run(userId);
      return 'updated';
    }
  } else {
    // New signature: (db, guildId, userId)
    const guildId = arg1;
    const userId = arg2;
    db.prepare(
      `INSERT OR IGNORE INTO admin_users (user_id, role, guild_id) VALUES (?, 'admin', ?)`
    ).run(userId, guildId);
  }
}

export function removeAdmin(db: Database.Database, userId: string): number;
export function removeAdmin(db: Database.Database, guildId: string, userId: string): void;
export function removeAdmin(db: Database.Database, arg1: string, arg2?: string): number | void {
  ensureAttached(db);
  if (arg2 === undefined) {
    // Old signature: (db, userId)
    const userId = arg1;
    let changes = 0;
    try { const res = db.prepare(`DELETE FROM admin.admin_users WHERE user_id = ?`).run(userId); changes += Number(res.changes || 0); } catch { }
    try { const res = db.prepare(`DELETE FROM admin.super_admins WHERE user_id = ?`).run(userId); changes += Number(res.changes || 0); } catch { }
    return changes;
  } else {
    // New signature: (db, guildId, userId)
    const guildId = arg1;
    const userId = arg2;
    db.prepare(`DELETE FROM admin_users WHERE user_id = ? AND role = 'admin' AND guild_id = ?`)
      .run(userId, guildId);
  }
}

export function listAdmins(db: Database.Database): Array<{ user_id: string; role: AdminRole }> {
  ensureAttached(db);
  const hasRole = adminUsersHasRoleColumn(db);
  const admins = hasRole
    ? db.prepare(`SELECT user_id, role FROM admin.admin_users`).all() as Array<{ user_id: string; role: AdminRole }>
    : (db.prepare(`SELECT user_id, 'admin' AS role FROM admin.admin_users`).all() as Array<{ user_id: string; role: AdminRole }>);
  const supers = db.prepare(`SELECT user_id, 'super' AS role FROM admin.super_admins`).all() as Array<{ user_id: string; role: AdminRole }>;
  return [...supers, ...admins].sort((a, b) => (a.role === b.role ? a.user_id.localeCompare(b.user_id) : (a.role === 'super' ? -1 : 1)));
}

export function addGuildAdmin(db: Database.Database, guildId: string, userId: string): number {
  const result = db.prepare(
    `INSERT OR IGNORE INTO admin_users (user_id, role, guild_id) VALUES (?, 'admin', ?)`
  ).run(userId, guildId);
  return result.changes;
}

export function removeGuildAdmin(db: Database.Database, guildId: string, userId: string): number {
  const result = db.prepare(`DELETE FROM admin_users WHERE user_id = ? AND role = 'admin' AND guild_id = ?`)
    .run(userId, guildId);
  return result.changes;
}

export function listAdminsForGuild(db: Database.Database, guildId: string): { superIds: string[]; adminIds: string[] } {
  const superRows = db.prepare(`SELECT user_id FROM admin_users WHERE role='super' AND guild_id IS NULL`).all() as Array<{ user_id: string }>;
  const adminRows = db.prepare(`SELECT user_id FROM admin_users WHERE role='admin' AND guild_id = ?`).all(guildId) as Array<{ user_id: string }>;
  return {
    superIds: superRows.map(r => r.user_id),
    adminIds: adminRows.map(r => r.user_id),
  };
}

export function isAdminInGuild(db: Database.Database, guildId: string, userId: string): boolean {
  const row = db.prepare(
    `SELECT 1 FROM admin_users WHERE user_id = ? AND (role='super' AND guild_id IS NULL OR (role='admin' AND guild_id = ?)) LIMIT 1`
  ).get(userId, guildId);
  return !!row;
}
