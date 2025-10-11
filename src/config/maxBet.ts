import type Database from 'better-sqlite3';
import { toBigInt } from '../utils/bigint.js';

export type MaxBet = { disabled: true } | { disabled: false; limit: bigint };

// accepts 1_000, 10k, 2.5m, 3b, plain ints
export function parseHumanAmount(input: string): bigint {
  const s = input.trim().toLowerCase().replace(/_/g, '');
  if (!s) throw new Error('empty amount');
  const match = s.match(/^([0-9]+(?:\.[0-9]+)?)([kmbt])?$/); // k=1e3, m=1e6, b=1e9, t=1e12
  let num = s;
  if (match) {
    const [, n, suf] = match;
    const mult = suf ? ({ k: 1e3, m: 1e6, b: 1e9, t: 1e12 } as any)[suf] : 1;
    num = (Number(n) * mult).toString();
  }
  if (!/^\d+$/.test(num)) throw new Error('invalid amount');
  return toBigInt(num);
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

