// Amount parsing and formatting helpers
// - parseAmount: accepts integers with optional underscores and suffixes k/m/b/t/q
// - fmtCoins: wrapper around existing formatBalance to keep formatting consistent

import { formatBalance } from '../util/formatBalance.js';

const SUFFIX: Record<string, bigint> = {
  k: 1_000n,
  m: 1_000_000n,
  b: 1_000_000_000n,
  t: 1_000_000_000_000n,
  // q = quintillion (1e18)
  q: 1_000_000_000_000_000_000n,
};

export function parseAmount(input: string): bigint {
  const s = String(input ?? '').replace(/_/g, '').trim().toLowerCase();
  if (!s || !/^[0-9]+[kmbtq]?$/.test(s)) throw new Error('bad_amount');
  const suf = s.slice(-1);
  const hasSuf = Object.prototype.hasOwnProperty.call(SUFFIX, suf);
  const base = hasSuf ? s.slice(0, -1) : s;
  const mult = hasSuf ? SUFFIX[suf] : 1n;
  try {
    const n = BigInt(base);
    return n * mult;
  } catch {
    throw new Error('bad_amount');
  }
}

export function fmtCoins(v: bigint | number): string {
  return formatBalance(v as any);
}

