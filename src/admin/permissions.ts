import type Database from 'better-sqlite3';
import path from 'node:path';
import { ensureAttached, isSuper as storeIsSuper, isGuildAdmin as storeIsGuildAdmin } from './adminStore.js';

function inferGuildId(db: Database.Database): string | null {
  try {
    const list = db.pragma('database_list', { simple: false }) as Array<{ name: string; file?: string }>;
    const main = Array.isArray(list) ? list.find(r => String(r?.name).toLowerCase() === 'main') : null;
    const file = (main as any)?.file as string | undefined;
    if (!file) return null;
    const base = path.basename(file);
    return base.endsWith('.db') ? base.slice(0, -3) : base;
  } catch { return null; }
}

export function isSuperAdmin(db: Database.Database, userId: string): boolean {
  try { ensureAttached(db as any); } catch { }
  return storeIsSuper(db as any, userId);
}

export function isGuildAdmin(db: Database.Database, userId: string): boolean {
  try { ensureAttached(db as any); } catch { }
  const gid = inferGuildId(db);
  if (!gid) return false;
  return storeIsGuildAdmin(db as any, gid, userId);
}

export function isAdmin(db: Database.Database, userId: string): boolean {
  try { ensureAttached(db as any); } catch { }
  const gid = inferGuildId(db);
  if (storeIsSuper(db as any, userId)) return true;
  if (gid) return storeIsGuildAdmin(db as any, gid, userId);
  return false;
}
