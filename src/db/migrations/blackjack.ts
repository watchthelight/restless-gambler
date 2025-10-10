import type Database from 'better-sqlite3';
import { VERBOSE, vlog } from '../../util/verbose.js';

let BJ_LOGGED_READY = false;

export function ensureBlackjackSchema(db: Database.Database): { added: string[] } {
  const added: string[] = [];
  const tableName = 'blackjack_sessions';
  const cols = new Map<string, any>();
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string }>;
    for (const r of rows) cols.set(r.name, true);
    if (VERBOSE) vlog({ msg: 'migrate', event: 'blackjack_schema_check', tableInfo: rows });
  } catch {}

  if (cols.size === 0) {
    // Create full schema as required (non-destructive if not exists)
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${tableName} (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        handState TEXT NOT NULL DEFAULT '[]',
        bet INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        PRIMARY KEY (guildId, userId)
      );`,
    );
    added.push('table');
    // Refresh cols map
    const rows = db.prepare(`PRAGMA table_info(${tableName});`).all() as Array<{ name: string }>;
    cols.clear();
    for (const r of rows) cols.set(r.name, true);
  }

  const want = [
    { name: 'guildId', sql: `ALTER TABLE ${tableName} ADD COLUMN guildId TEXT NOT NULL DEFAULT ''` },
    { name: 'userId', sql: `ALTER TABLE ${tableName} ADD COLUMN userId TEXT NOT NULL DEFAULT ''` },
    { name: 'handState', sql: `ALTER TABLE ${tableName} ADD COLUMN handState TEXT NOT NULL DEFAULT '[]'` },
    { name: 'bet', sql: `ALTER TABLE ${tableName} ADD COLUMN bet INTEGER NOT NULL DEFAULT 0` },
    { name: 'active', sql: `ALTER TABLE ${tableName} ADD COLUMN active INTEGER NOT NULL DEFAULT 1` },
    { name: 'createdAt', sql: `ALTER TABLE ${tableName} ADD COLUMN createdAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))` },
    { name: 'updatedAt', sql: `ALTER TABLE ${tableName} ADD COLUMN updatedAt INTEGER NOT NULL DEFAULT (strftime('%s','now'))` },
  ];
  const t0 = Date.now();
  for (const w of want) {
    if (!cols.has(w.name)) {
      try { db.exec(w.sql); added.push(w.name); } catch {}
    }
  }
  if (added.length && !BJ_LOGGED_READY) {
    BJ_LOGGED_READY = true;
    try { console.log(JSON.stringify({ msg: 'migrate', event: 'blackjack_schema_ready', added })); } catch {}
  }
  if (VERBOSE && added.length) vlog({ msg: 'migrate', event: 'blackjack_schema_alter', added, ms: Date.now() - t0 });
  return { added };
}
