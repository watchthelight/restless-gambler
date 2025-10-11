// Idempotent migration runner with applied_migrations tracking.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type Database from 'better-sqlite3';
import { getDbPaths, getGuildDb } from './connection.js';
import { migrateLegacyToPerGuild } from './legacy-migrate.js';
import { migrateGuildDb } from './migrateGuild.js';
import { openAdminDb } from './openAdminDb.js';
import { ensureSuperAdminsSchema, superAdminInsertSQL } from './adminSchema.js';
import { ui } from '../cli/ui.js';



let MIGRATIONS_RAN = false;
let MIGRATE_LOGGED = false;

function ensureAppliedTable(db: Database.Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS applied_migrations(id TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));`);
}

function listMigrationFiles(dir: string): { id: string; path: string; kind: 'sql' | 'js' }[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => /^(\d+).*\.(sql|js|ts)$/.test(f)).sort();
  return files.map((f) => ({ id: f.replace(/\.(sql|js|ts)$/i, ''), path: path.join(dir, f), kind: f.endsWith('.sql') ? 'sql' : 'js' }));
}

function hasApplied(db: Database.Database, id: string): boolean {
  const row = db.prepare('SELECT 1 FROM applied_migrations WHERE id = ?').get(id) as any;
  return !!row;
}

async function runOne(db: Database.Database, mig: { id: string; path: string; kind: 'sql' | 'js' }) {
  if (hasApplied(db, mig.id)) return false;

  try {
    if (mig.kind === 'sql') {
      const sql = fs.readFileSync(mig.path, 'utf8');
      db.exec(sql);
    } else {
      // JS/TS migration: must export async function up(db)
      const mod: any = await import(pathToFileURL(mig.path).href);
      if (typeof mod.up === 'function') await mod.up(db);
    }
    db.prepare('INSERT OR IGNORE INTO applied_migrations(id) VALUES(?)').run(mig.id);
    return true;
  } catch (e: any) {
    const errorMsg = e.message || String(e);

    // Handle idempotent migration errors gracefully
    const isDuplicateColumn = errorMsg.includes('duplicate column');
    const isNoSuchTable = errorMsg.includes('no such table');

    if (isDuplicateColumn) {
      // Column already exists, mark migration as applied and continue
      db.prepare('INSERT OR IGNORE INTO applied_migrations(id) VALUES(?)').run(mig.id);
      if (process.env.VERBOSE) {
        console.log(JSON.stringify({ msg: 'migration_skipped_duplicate', id: mig.id, reason: 'column already exists' }));
      }
      return true;
    }

    if (isNoSuchTable && (mig.id.includes('000_admin_core') || mig.id.includes('001_admin_dedupe'))) {
      // Legacy table import failed (table doesn't exist), mark as applied and continue
      db.prepare('INSERT OR IGNORE INTO applied_migrations(id) VALUES(?)').run(mig.id);
      if (process.env.VERBOSE) {
        console.log(JSON.stringify({ msg: 'migration_skipped_legacy', id: mig.id, reason: 'legacy table not found' }));
      }
      return true;
    }

    // Log the error for debugging
    console.error(`Migration ${mig.id} failed:`, errorMsg);
    // Re-throw other errors
    throw e;
  }
}

async function runDirOnDb(db: Database.Database, dir: string): Promise<string[]> {
  ensureAppliedTable(db);
  const files = listMigrationFiles(dir);
  const applied: string[] = [];
  for (const f of files) {
    const did = await runOne(db, f);
    if (did) applied.push(f.id);
  }
  return applied;
}

export async function runMigrations() {
  const { data_dir, admin_global } = getDbPaths();
  if (!fs.existsSync(data_dir)) fs.mkdirSync(data_dir, { recursive: true });

  // 1) One-time legacy split to per-guild files (idempotent)
  const legacyMigrated = migrateLegacyToPerGuild();

  // 2) Global admin DB JS/SQL migrations
  const adminDb = openAdminDb(admin_global);
  ensureSuperAdminsSchema(adminDb, console);
  const { sql } = superAdminInsertSQL(adminDb);
  adminDb.prepare(sql).run("697169405422862417");
  const adminDir = path.resolve('migrations_admin');
  const adminApplied = await runDirOnDb(adminDb, adminDir);
  if (adminApplied.length && process.env.VERBOSE) console.log(JSON.stringify({ msg: 'migrations applied (admin)', applied: adminApplied }));

  // 3) For each guild DB, run guild migrations
  let guildCount = 0;
  let totalApplied = 0;
  if (fs.existsSync(data_dir)) {
    const files = fs.readdirSync(data_dir);
    const bar = ui.bar(files.filter((f) => f.endsWith('.db')).length || 0, 'Migrations');
    for (const f of files) {
      if (!f.endsWith('.db')) continue;
      const gid = path.basename(f, '.db');
      const db = getGuildDb(gid);
      const log = { info: (...args: any[]) => console.log(...args), warn: (...args: any[]) => console.warn(...args), error: (...args: any[]) => console.error(...args) };
      migrateGuildDb(db, gid, log);
      guildCount++;
      // Note: migrateGuildDb logs internally, so we don't count applied here
      bar.tick();
    }
    bar.stop();
  }
  if (!MIGRATE_LOGGED) {
    if (process.env.VERBOSE) {
      console.log('migrate done', { legacy: legacyMigrated, guilds: guildCount });
      try { console.log(JSON.stringify({ msg: 'migrate', event: 'done' })); } catch { }
    }
    MIGRATE_LOGGED = true;
  }
}

export async function runMigrationsOnce() {
  if (MIGRATIONS_RAN) return;
  MIGRATIONS_RAN = true;
  await runMigrations();
}

// CLI entry: run directly only if invoked as a script
if (process.argv[1] && /db[\/\\]migrate\.[cm]?js$/.test(process.argv[1])) {
  (async () => {
    try {
      await ui.timed('Applying migrations', async () => { await runMigrations(); });
      ui.say('Migrations applied', 'success');
    } catch (e) {
      ui.say('Migration failed: ' + String(e), 'error');
      // Do not call process.exit() to avoid sonic boom flush races
    }
  })();
}
