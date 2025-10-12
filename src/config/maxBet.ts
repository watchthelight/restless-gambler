import type Database from 'better-sqlite3';
import { toBigInt } from '../utils/bigint.js';
import { parseHumanAmount as parseHumanAmountLib } from '../lib/amount.js';

export type MaxBet = { disabled: true } | { disabled: false; limit: bigint };

// accepts 1_000, 10k, 2.5m, 3b, plain ints
export function parseHumanAmount(input: string): bigint {
  const res = parseHumanAmountLib(input);
  if ('value' in res) return res.value;
  throw new Error(res.code);
}

export function getMaxBet(db: Database.Database): MaxBet {
  const row = db.prepare('SELECT value FROM guild_config WHERE key = ?').get('max_bet') as { value?: string } | undefined;
  if (!row || row.value === 'unlimited') return { disabled: true };
  return { disabled: false, limit: toBigInt(row.value!) };
}

export function setMaxBetDisabled(db: Database.Database): void {
  db.prepare(
    `INSERT INTO guild_config(key,value,updated_at) VALUES('max_bet','unlimited',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run();
}

export function setMaxBetValue(db: Database.Database, v: bigint): void {
  db.prepare(
    `INSERT INTO guild_config(key,value,updated_at) VALUES('max_bet',?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
  ).run(v.toString());
}

// Uniform guard for ALL games
export function assertWithinMaxBet(db: Database.Database, bet: bigint) {
  const max = getMaxBet(db);
  if (max.disabled) return; // unlimited
  if (bet > max.limit) {
    const msg = `Maximum bet is ${max.limit.toString()}.`;
    const err = new Error(msg) as Error & { code?: string };
    err.code = 'ERR_MAX_BET';
    throw err;
  }
}
