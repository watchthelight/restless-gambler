export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) throw new TypeError('Empty string cannot be converted to bigint');
    if (s.includes('.')) return BigInt(Math.trunc(Number(s)));
    return BigInt(s);
  }
  throw new TypeError(`Cannot convert type ${typeof value} to BigInt`);
}

export function bigintToDb(v: bigint): string { return v.toString(); }

export function dbToBigint(v: unknown): bigint {
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return toBigInt(v);
  throw new TypeError(`Unexpected DB bigint type: ${typeof v}`);
}

export function bigintToNumberSafe(v: bigint): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new RangeError('BigInt too large to convert to Number safely');
  return n;
}

