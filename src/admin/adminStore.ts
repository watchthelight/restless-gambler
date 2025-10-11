import type { Database } from 'better-sqlite3';
import { attachAdmin } from '../db/adminGlobal.js';

export type AdminRole = 'super' | 'guild';

export function normalizeId(id: string | bigint | number | null | undefined): string {
  if (id == null) return '';
  // Always store & compare Snowflakes as raw strings
  return String(id);
}

export function ensureAttached(db: Database): Database {
  // idempotent attach; internal function already guards multi-attach
  return attachAdmin(db);
}

function hasAdminTable(db: Database, table: string): boolean {
  try { (db as any).prepare(`PRAGMA admin.table_info(${table})`).all(); return true; } catch { return false; }
}

function hasMainTable(db: Database, table: string): boolean {
  try {
    const rows = (db as any).prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).all(table) as any[];
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

export function isSuper(db: Database, userId: string | bigint | number): boolean {
  const uid = normalizeId(userId);
  // Prefer attached global table
  try {
    if (hasAdminTable(db, 'super_admins')) {
      const row = db.prepare(`SELECT 1 FROM admin.super_admins WHERE user_id = ? LIMIT 1`).get(uid);
      return !!row;
    }
  } catch { /* fall through */ }
  // Fallback: role-based table in main schema
  try {
    if (hasMainTable(db, 'admin_users')) {
      const row = db.prepare(`SELECT 1 FROM admin_users WHERE user_id = ? AND role='super' AND guild_id IS NULL LIMIT 1`).get(uid);
      return !!row;
    }
  } catch { }
  return false;
}

export function isGuildAdmin(db: Database, guildId: string, userId: string | bigint | number): boolean {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  // Prefer attached per-guild table
  try {
    if (hasAdminTable(db, 'guild_admins')) {
      const row = db.prepare(`SELECT 1 FROM admin.guild_admins WHERE guild_id = ? AND user_id = ? LIMIT 1`).get(gid, uid);
      return !!row;
    }
  } catch { /* fall back */ }
  // Fallback: role-scoped admin_users in main schema
  try {
    if (hasMainTable(db, 'admin_users')) {
      const row = db.prepare(`SELECT 1 FROM admin_users WHERE user_id = ? AND role='admin' AND guild_id = ? LIMIT 1`).get(uid, gid);
      return !!row;
    }
  } catch { }
  return false;
}

export function addGuildAdmin(db: Database, guildId: string, userId: string): void {
  const gid = normalizeId(guildId); const uid = normalizeId(userId);
  try {
    if (hasAdminTable(db, 'guild_admins')) {
      db.prepare(`INSERT OR IGNORE INTO admin.guild_admins (guild_id, user_id) VALUES (?, ?)`).run(gid, uid);
      return;
    }
  } catch { }
  // Fallback to main admin_users
  db.prepare(`INSERT OR IGNORE INTO admin_users (user_id, role, guild_id) VALUES (?, 'admin', ?)`)
    .run(uid, gid);
}

export function removeGuildAdmin(db: Database, guildId: string, userId: string): number {
  const gid = normalizeId(guildId); const uid = normalizeId(userId);
  try {
    if (hasAdminTable(db, 'guild_admins')) {
      const res = db.prepare(`DELETE FROM admin.guild_admins WHERE guild_id = ? AND user_id = ?`).run(gid, uid);
      return Number((res as any)?.changes || 0);
    }
  } catch { }
  const res = db.prepare(`DELETE FROM admin_users WHERE user_id = ? AND role='admin' AND guild_id = ?`).run(uid, gid);
  return Number((res as any)?.changes || 0);
}

export function getPerGuildAdmins(db: Database, guildId: string): Array<{user_id: string}> {
  const gid = normalizeId(guildId);
  try {
    if (hasAdminTable(db, 'guild_admins')) {
      return db.prepare(`SELECT user_id FROM admin.guild_admins WHERE guild_id = ? ORDER BY user_id`).all(gid) as any[];
    }
  } catch { }
  if (hasMainTable(db, 'admin_users')) {
    return db.prepare(`SELECT user_id FROM admin_users WHERE role='admin' AND guild_id = ? ORDER BY user_id`).all(gid) as any[];
  }
  return [] as any[];
}

export function getSupers(db: Database): Array<{user_id: string}> {
  try {
    if (hasAdminTable(db, 'super_admins')) {
      return db.prepare(`SELECT user_id FROM admin.super_admins ORDER BY user_id`).all() as any[];
    }
  } catch { }
  if (hasMainTable(db, 'admin_users')) {
    return db.prepare(`SELECT user_id FROM admin_users WHERE role='super' AND guild_id IS NULL ORDER BY user_id`).all() as any[];
  }
  return [] as any[];
}

export function isAdminInGuild(db: Database, guildId: string, userId: string): boolean {
  return isSuper(db, userId) || isGuildAdmin(db, guildId, userId);
}

export function listAdminsForGuild(db: Database, guildId: string): { superIds: string[]; adminIds: string[] } {
  const supers = getSupers(db).map(r => r.user_id);
  const admins = getPerGuildAdmins(db, guildId).map(r => r.user_id);
  return { superIds: supers, adminIds: admins };
}
