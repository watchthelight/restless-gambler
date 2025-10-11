import type { Database } from 'better-sqlite3';
import DatabaseBetter from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let firstAttachLogged = false;
const ATTACHED = new WeakSet<Database>();

export function getAdminDbPath(): string {
  return path.resolve('data', 'admin_global.db');
}

// Idempotently attach the admin DB as schema 'admin' to the given connection.
export function attachAdmin(db: Database): Database {
  if (ATTACHED.has(db)) return db;
  // If already attached under name 'admin', mark and return
  try {
    const list = (db as any).pragma?.('database_list', { simple: false }) as Array<{ name: string }> | undefined;
    if (Array.isArray(list) && list.some(r => String(r?.name).toLowerCase() === 'admin')) {
      ATTACHED.add(db);
      return db;
    }
  } catch { /* ignore */ }

  const p = getAdminDbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Attach as schema "admin"
  db.exec(`ATTACH DATABASE '${p.replace(/'/g, "''")}' AS admin;`);
  // Create tables if not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin.super_admins (user_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS admin.guild_admins (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (guild_id, user_id));
  `);
  // one-time info log only
  if (!firstAttachLogged) {
    console.debug({ msg: 'admin_db_attached', path: p });
    firstAttachLogged = true;
  }
  ATTACHED.add(db);
  return db;
}

// Back-compat wrappers for existing imports
export function ensureAdminAttached(db: Database, _logger?: { debug?: Function }): void {
  attachAdmin(db);
}

export function isAdminUser(_db: Database, _userId: string): boolean {
  // Deprecated helper; not used in new flow.
  // Keeping exported for compatibility; prefer store-based checks per guild.
  return false;
}
