import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const ADMIN_DB_BASENAME = 'admin_global.db';
const ADMIN_SCHEMA = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS super_admins (
  user_id TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`;

export function ensureAdminGlobalDb(adminDbPath: string) {
  const first = !fs.existsSync(adminDbPath);
  const db = new (Database as any)(adminDbPath);
  if (first) db.exec(ADMIN_SCHEMA);
  else db.exec(`PRAGMA journal_mode=WAL;`);
  db.close();
}

// Where admin_global.db lives by default
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ADMIN_DB_PATH = path.join(DATA_DIR, ADMIN_DB_BASENAME);

// Per-connection cache so ATTACH happens once
const ATTACHED = new WeakSet<Database.Database>();

/**
 * Idempotently attach the global admin DB to a guild DB connection as schema "admin".
 * Safe to call many times across the codebase.
 */
export function ensureAdminAttached(db: Database.Database, logger?: { debug?: Function }): void {
  if (ATTACHED.has(db)) return;

  // If already attached (e.g., from a previous phase), mark and exit
  try {
    const list = db.pragma('database_list', { simple: false }) as Array<{ name: string }>;
    if (Array.isArray(list) && list.some(r => String(r?.name).toLowerCase() === 'admin')) {
      ATTACHED.add(db);
      logger?.debug?.({ msg: 'admin_db_attach_skipped_already_listed' });
      return;
    }
  } catch { /* ignore */ }

  // Ensure file exists
  if (!fs.existsSync(ADMIN_DB_PATH)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    // file will be created by SQLite on first write
  }

  try {
    // Use parameter binding; avoid string interpolation issues on Windows paths
    db.prepare('ATTACH DATABASE ? AS admin').run(ADMIN_DB_PATH);
    ATTACHED.add(db);
    logger?.debug?.({ msg: 'admin_db_attached', path: ADMIN_DB_PATH });
  } catch (err: any) {
    // If another path already attached or duplicate attach raced, mark and continue.
    if (typeof err?.message === 'string' && /already in use/i.test(err.message)) {
      ATTACHED.add(db);
      logger?.debug?.({ msg: 'admin_db_attach_already_in_use', note: 'treated as attached' });
      return;
    }
    throw err;
  }
}

/** Returns true if user is super admin OR admin user. Assumes ensureAdminAttached already called. */
export function isAdminUser(db: Database.Database, userId: string): boolean {
  const superRow = db.prepare(`SELECT 1 FROM admin.super_admins WHERE user_id = ?`).get(userId);
  if (superRow) return true;
  const adminRow = db.prepare(`SELECT 1 FROM admin.admin_users WHERE user_id = ?`).get(userId);
  return !!adminRow;
}
