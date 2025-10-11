import type Database from 'better-sqlite3';
import { getGlobalAdminDb } from '../db/connection.js';

export function isSuperAdmin(db: Database.Database, userId: string): boolean {
  try {
    const row = db.prepare('SELECT 1 FROM admin.super_admins WHERE user_id = ? LIMIT 1').get(userId) as any;
    if (row) return true;
  } catch {
    // Fallback: use global DB directly if attach failed
    try {
      const adb = getGlobalAdminDb();
      const r = adb.prepare('SELECT 1 FROM super_admins WHERE user_id = ? LIMIT 1').get(userId) as any;
      return !!r;
    } catch { /* ignore */ }
  }
  return false;
}

export function isGuildAdmin(db: Database.Database, userId: string): boolean {
  try {
    const row = db.prepare('SELECT 1 FROM guild_admins WHERE user_id = ? LIMIT 1').get(userId) as any;
    return !!row;
  } catch {
    return false;
  }
}

export function isAdmin(db: Database.Database, userId: string): boolean {
  return isSuperAdmin(db, userId) || isGuildAdmin(db, userId);
}

