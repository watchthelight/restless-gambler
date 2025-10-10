import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { VERBOSE, vlog } from "../util/verbose.js";
import { migrateGuildDb } from "./migrateGuild.js";
import { ensureSuperAdminsSchema, superAdminInsertSQL } from "./adminSchema.js";
import { ensureBlackjackSessionsSchema } from "../game/blackjack/sessionStore.js";

// New per-guild DB manager. Keeps backward exports minimally for legacy callers.

type DBKind = "data" | "admin";

const defaults = {
  legacyData: process.env.DATA_DB_PATH ?? "./data/data.db",
  legacyAdmin: process.env.ADMIN_DB_PATH ?? "./data/admin.db",
  dataDir: process.env.DATA_DIR ?? "./data/guilds",
  adminGlobal: process.env.ADMIN_GLOBAL_DB_PATH ?? "./data/admin_global.db",
};

const guildCache = new Map<string, Database.Database>();
let adminGlobalDb: Database.Database | null = null;

function ensureDirExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function openDb(filePath: string): Database.Database {
  ensureDirExists(path.dirname(filePath));
  const db = new Database(filePath, { fileMustExist: false });
  db.pragma("journal_mode = WAL");
  // Lightweight SQL tracing
  if (VERBOSE && (Database as any)?.prototype?.prepare && !(db as any).__tracePatched) {
    (db as any).__tracePatched = true;
    const proto = (db as any).__proto__ || (Database as any).prototype;
    const origPrepare = proto.prepare.bind(db);
    proto.prepare = function (sql: string) {
      const stmt = origPrepare(sql);
      if (!VERBOSE || !stmt) return stmt;
      const wrap = (method: 'run' | 'get' | 'all') => {
        const orig = (stmt as any)[method];
        if (typeof orig !== 'function') return;
        (stmt as any)[method] = function (...params: any[]) {
          const t0 = Date.now();
          try {
            const out = orig.apply(this, params);
            const ms = Date.now() - t0;
            let rows: any = undefined;
            if (method === 'run') rows = out?.changes;
            else if (method === 'get') rows = out ? 1 : 0;
            else if (method === 'all') rows = Array.isArray(out) ? out.length : 0;
            vlog({ msg: 'sql', op: method, sql: String(sql).trim().slice(0, 240), params, ms, rows });
            return out;
          } catch (e: any) {
            const ms = Date.now() - t0;
            vlog({ msg: 'sql', op: method, sql: String(sql).trim().slice(0, 240), params, ms, error: String(e?.message || e) });
            throw e;
          }
        };
      };
      wrap('run'); wrap('get'); wrap('all');
      return stmt;
    };
  }
  return db;
}

function sqlFrom(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

import { ensureCompatViews } from './compat.js';

function migrateGlobalAdminDb(db: Database.Database) {
  const sql = sqlFrom(path.resolve("src/db/migrations/admin_global.sql"));
  if (sql) db.exec(sql);
  // Ensure schema and seed super admin adaptively
  ensureSuperAdminsSchema(db, console);
  const { sql: insertSql } = superAdminInsertSQL(db);
  db.prepare(insertSql).run("697169405422862417");
}

export function getGuildDb(guildId: string): Database.Database {
  const cached = guildCache.get(guildId);
  if (cached) return cached;
  const absDir = path.resolve(defaults.dataDir);
  ensureDirExists(absDir);
  const file = path.join(absDir, `${guildId}.db`);
  const db = openDb(file);
  migrateGuildDb(db, guildId, console);
  ensureBlackjackSessionsSchema(db, console);
  // Seed blackjack/roulette defaults if missing
  db.exec(`
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'blackjack.min_bet','10', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='blackjack.min_bet');
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'blackjack.max_bet','1000', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='blackjack.max_bet');
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'blackjack.timeout_s','2', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='blackjack.timeout_s');
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'roulette.min_bet','10', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='roulette.min_bet');
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'roulette.max_bet','1000', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='roulette.max_bet');
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'slots.min_bet','10', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='slots.min_bet');
    INSERT INTO guild_settings(key,value,updated_at)
    SELECT 'slots.max_bet','1000', strftime('%s','now')
    WHERE NOT EXISTS (SELECT 1 FROM guild_settings WHERE key='slots.max_bet');
  `);
  ensureCompatViews(db);
  try {
    console.info(JSON.stringify({ msg: "guild_db_open", guildId, path: file }));
  } catch { }
  guildCache.set(guildId, db);
  return db;
}

export function getGlobalAdminDb(): Database.Database {
  if (adminGlobalDb) return adminGlobalDb;
  const file = defaults.adminGlobal === ':memory:' ? ':memory:' : path.resolve(defaults.adminGlobal);
  adminGlobalDb = openDb(file);
  migrateGlobalAdminDb(adminGlobalDb);
  return adminGlobalDb;
}

// Legacy bridge for callers not yet migrated. getDB('data')/getDB('admin')
export function getDB(kind: DBKind): Database.Database {
  if (kind === "admin") return getGlobalAdminDb();
  // For 'data' without guild context, open or create legacy mono DB path (used only by tests/leftovers)
  const db = openDb(path.resolve(defaults.legacyData));
  return db;
}

export function closeAll() {
  for (const db of guildCache.values()) db.close();
  guildCache.clear();
  if (adminGlobalDb) {
    adminGlobalDb.close();
    adminGlobalDb = null;
  }
}

export default { getGuildDb, getGlobalAdminDb, closeAll, getDB };

export function getDbPaths() {
  return {
    data_dir: path.resolve(defaults.dataDir),
    admin_global: path.resolve(defaults.adminGlobal),
    legacy_data: path.resolve(defaults.legacyData),
  };
}
