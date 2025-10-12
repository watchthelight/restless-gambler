import type Database from 'better-sqlite3';
import { getGuildDb } from '../db/connection.js';

const KEY = 'economy.max_admin_grant';
const DEFAULT = 1_000_000_000n; // 1b
const MAX = 10_000_000_000_000_000_000n; // 10 quintillion

type CacheEntry = { value: bigint; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function now() { return Date.now(); }

function readRaw(db: Database.Database): string | null {
  try {
    const row = db.prepare('SELECT value FROM guild_config WHERE key = ?').get(KEY) as { value?: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function writeRaw(db: Database.Database, value: string): void {
  db.prepare(
    `INSERT INTO guild_config(key,value,updated_at) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(KEY, value);
}

export function getMaxAdminGrant(guildId: string): bigint {
  const c = cache.get(guildId);
  if (c && c.expires > now()) return c.value;
  const db = getGuildDb(guildId);
  const raw = readRaw(db);
  let v: bigint = DEFAULT;
  if (raw != null) {
    try {
      const n = BigInt(String(raw));
      if (n >= 0n && n <= MAX) v = n; // validate bounds on read
    } catch { /* ignore bad stored values; fall back to default */ }
  }
  cache.set(guildId, { value: v, expires: now() + TTL_MS });
  return v;
}

export function setMaxAdminGrant(guildId: string, v: bigint): void {
  if (v < 0n || v > MAX) throw new Error('out_of_range');
  const db = getGuildDb(guildId);
  writeRaw(db, v.toString());
  cache.set(guildId, { value: v, expires: now() + TTL_MS });
}

export function invalidateEconomyCache(guildId: string) {
  cache.delete(guildId);
}

export const ECONOMY_LIMITS = { DEFAULT, MAX } as const;

