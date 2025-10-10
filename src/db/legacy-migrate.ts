import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getDbPaths, getGuildDb, getGlobalAdminDb } from './connection.js';

type TableInfo = { name: string };

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name) as TableInfo | undefined;
  return !!row;
}

function columnExists(db: Database.Database, table: string, column: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table});`).all() as Array<{ name: string }>;
    return rows.some((r) => r.name === column);
  } catch {
    return false;
  }
}

export function migrateLegacyToPerGuild(): number {
  const { legacy_data } = getDbPaths();
  if (!fs.existsSync(legacy_data)) return 0;
  const legacy = new Database(legacy_data, { fileMustExist: true });

  // Detect multi-guild legacy by presence of guild_id columns
  const multiGuild =
    (tableExists(legacy, 'guild_settings') && columnExists(legacy, 'guild_settings', 'guild_id')) ||
    (tableExists(legacy, 'holdem_tables') && columnExists(legacy, 'holdem_tables', 'guild_id'));
  if (!multiGuild) {
    // Nothing to migrate safely; archive and return
    const archived = archiveLegacy(legacy_data);
    legacy.close();
    try { console.info(JSON.stringify({ msg: 'legacy_migrated', from: legacy_data, guilds: 0, archived })); } catch {}
    return 0;
  }

  const guildIds = new Set<string>();
  if (tableExists(legacy, 'guild_settings') && columnExists(legacy, 'guild_settings', 'guild_id')) {
    const rows = legacy.prepare('SELECT guild_id FROM guild_settings').all() as Array<{ guild_id: string }>;
    for (const r of rows) if (r.guild_id) guildIds.add(r.guild_id);
  }
  if (tableExists(legacy, 'holdem_tables') && columnExists(legacy, 'holdem_tables', 'guild_id')) {
    const rows = legacy.prepare('SELECT DISTINCT guild_id FROM holdem_tables').all() as Array<{ guild_id: string }>;
    for (const r of rows) if (r.guild_id) guildIds.add(r.guild_id);
  }

  const gids = Array.from(guildIds.values());
  for (const gid of gids) {
    const db = getGuildDb(gid);
    const now = Date.now();
    // guild_settings → guild DB (drop guild_id)
    if (tableExists(legacy, 'guild_settings')) {
      const row = legacy
        .prepare('SELECT max_bet, min_bet, faucet_limit, public_results, theme FROM guild_settings WHERE guild_id = ?')
        .get(gid) as any;
      if (row) {
        db.prepare(
          'INSERT INTO guild_settings(min_bet, max_bet, faucet_limit, public_results, theme) VALUES(?,?,?,?,?)'
        ).run(row.min_bet ?? 10, row.max_bet ?? 10000, row.faucet_limit ?? 100, row.public_results ?? 1, row.theme ?? 'midnight');
      }
    }
    // wallets -> balances (duplicate, since legacy had no guild separation)
    if (tableExists(legacy, 'wallets')) {
      const rows = legacy.prepare('SELECT user_id, balance, updated_at FROM wallets').all() as Array<any>;
      const up = db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance, updated_at=excluded.updated_at');
      for (const r of rows) up.run(r.user_id, r.balance ?? 0, r.updated_at ?? now);
    }
    // transactions (duplicate)
    if (tableExists(legacy, 'transactions')) {
      const rows = legacy.prepare('SELECT user_id, delta, reason, created_at FROM transactions').all() as Array<any>;
      const ins = db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES(?,?,?,?)');
      for (const r of rows) ins.run(r.user_id, r.delta, r.reason ?? null, r.created_at ?? now);
    }
    // user_cache -> users
    if (tableExists(legacy, 'user_cache')) {
      const rows = legacy.prepare('SELECT user_id, display_name, avatar_url, updated_at FROM user_cache').all() as Array<any>;
      const up = db.prepare('INSERT INTO users(user_id, display_name, avatar_url, updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, avatar_url=excluded.avatar_url, updated_at=excluded.updated_at');
      for (const r of rows) up.run(r.user_id, r.display_name ?? r.user_id, r.avatar_url ?? null, r.updated_at ?? now);
    }
    // holdem_tables (filter by guild_id; drop column)
    if (tableExists(legacy, 'holdem_tables') && columnExists(legacy, 'holdem_tables', 'guild_id')) {
      const rows = legacy
        .prepare(
          'SELECT channel_id, thread_id, owner_id, small_blind, buy_in_min, buy_in_max, status, state_json, updated_at FROM holdem_tables WHERE guild_id = ?'
        )
        .all(gid) as Array<any>;
      const ins = db.prepare(
        'INSERT INTO holdem_tables(channel_id, thread_id, owner_id, small_blind, buy_in_min, buy_in_max, status, state_json, updated_at) VALUES(?,?,?,?,?,?,?,?,?)'
      );
      for (const r of rows) ins.run(r.channel_id, r.thread_id ?? null, r.owner_id, r.small_blind, r.buy_in_min, r.buy_in_max, r.status, r.state_json ?? '{}', r.updated_at ?? now);
    }
    // blackjack_sessions legacy -> abandon; no safe mapping (legacy was per-user state). Leave empty.
    // roulette_rounds & slots_rounds (duplicate)
    for (const name of ['roulette_rounds', 'slots_rounds']) {
      if (tableExists(legacy, name)) {
        const rows = legacy.prepare(`SELECT * FROM ${name}`).all() as Array<any>;
        const cols = Object.keys(rows[0] || {});
        if (rows.length > 0) {
          const placeholders = cols.map(() => '?').join(',');
          const ins = db.prepare(`INSERT INTO ${name}(${cols.join(',')}) VALUES(${placeholders})`);
          for (const r of rows) ins.run(...cols.map((c) => (r as any)[c]));
        }
      }
    }
  }

  legacy.close();
  const archived = archiveLegacy(legacy_data);
  try { console.info(JSON.stringify({ msg: 'legacy_migrated', from: legacy_data, guilds: gids.length, archived })); } catch {}
  return gids.length;
}

function archiveLegacy(filePath: string): string {
  try {
    const dir = path.dirname(filePath);
    const archiveDir = path.join(dir, 'archive');
    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(archiveDir, `data-legacy-${ts}.db`);
    fs.renameSync(filePath, dest);
    return dest;
  } catch {
    return '';
  }
}

