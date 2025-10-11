import type Database from "better-sqlite3";
import path from "node:path";
import { ensureAdminAttached } from './adminGlobal.js';

type ColInfo = { name: string; notnull: 0 | 1; dflt_value: any };
function tableCols(db: Database.Database, table: string): ColInfo[] {
    return db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[];
}
function colNames(cols: ColInfo[]) { return new Set(cols.map(c => String(c.name))); }

export function ensureSuperAdminsSchema(db: Database.Database, log = console) {
    const has = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='super_admins'`).all().length > 0;
    if (!has) {
        db.exec(`CREATE TABLE super_admins(user_id TEXT PRIMARY KEY, added_at INTEGER);`);
        log.info?.({ msg: "admin_schema_created" });
        return;
    }
    const cols = tableCols(db, "super_admins");
    const names = colNames(cols);
    if (!names.has("added_at")) {
        db.exec(`ALTER TABLE super_admins ADD COLUMN added_at INTEGER;`);
        if (names.has("created_at")) {
            db.exec(`UPDATE super_admins SET added_at = created_at WHERE added_at IS NULL;`);
        } else {
            db.exec(`UPDATE super_admins SET added_at = strftime('%s','now') WHERE added_at IS NULL;`);
        }
        log.info?.({ msg: "admin_schema_upgraded", added_at: true });
    }
}

export function superAdminInsertSQL(db: Database.Database) {
    const cols = tableCols(db, "super_admins");
    const names = colNames(cols);
    const hasCreated = names.has("created_at");
    const hasAdded = names.has("added_at");
    const createdNotNull = cols.find(c => c.name === "created_at")?.notnull === 1;

    // Build column list and values to satisfy NOT NULL constraints
    const fields: string[] = ["user_id"];
    const values: string[] = ["?"];

    // Prefer added_at, but support legacy created_at for backward compat
    if (hasAdded) {
        // added_at has default, so we can rely on that or explicitly set it
        // No need to add to fields/values, default will handle it
    } else if (hasCreated && createdNotNull) {
        // Legacy created_at NOT NULL without default - must explicitly set
        fields.push("created_at");
        values.push("strftime('%s','now')");
    }

    const sql = `INSERT INTO super_admins(${fields.join(", ")}) VALUES(${values.join(", ")})
               ON CONFLICT(user_id) DO NOTHING`;
    return { sql };
}

export type EnsureAdminOpts = { quiet?: boolean; log?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; debug?: (...args: any[]) => void } };

export function ensureAdminSchema(
    db: Database.Database,
    paths: { adminDbPath: string; guildId: string; dbFilePath?: string },
    opts: EnsureAdminOpts = {}
) {
    const log = opts.log ?? console;
    // Idempotently attach the admin DB as schema 'admin' (debug-level logging only)
    try { ensureAdminAttached(db, log); } catch { }

    // Defensive: ensure global table exists on attached schema to avoid view creation errors
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS admin.super_admins(
          user_id TEXT PRIMARY KEY,
          added_at INTEGER DEFAULT (strftime('%s','now'))
        );`);
        // And ensure added_at column exists even if legacy table lacked it
        const cols = db.prepare("PRAGMA admin.table_info(super_admins)").all() as Array<{ name: string }>;
        const names = new Set(cols.map(c => String(c.name)));
        if (!names.has('added_at')) {
          db.exec(`ALTER TABLE admin.super_admins ADD COLUMN added_at INTEGER;`);
          // Try to backfill from legacy created_at if present
          if (names.has('created_at')) {
            db.exec(`UPDATE admin.super_admins SET added_at = created_at WHERE added_at IS NULL;`);
          } else {
            db.exec(`UPDATE admin.super_admins SET added_at = strftime('%s','now') WHERE added_at IS NULL;`);
          }
        }
    } catch { }

    // Ensure per-guild admin table exists in the guild DB
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS admin_users(
          user_id   TEXT NOT NULL,
          role      TEXT NOT NULL CHECK (role IN ('super','admin')),
          guild_id  TEXT,
          created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        );`);
        db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_scope ON admin_users(user_id, guild_id, role);`);
    } catch { }

    // No cross-DB view: union is performed in code.
}
