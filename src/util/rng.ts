import { randomInt as cryptoRandomInt } from 'crypto';

export type RNG = (maxExclusive: number) => number;

export const cryptoRNG: RNG = (maxExclusive: number) => {
  if (maxExclusive <= 0) throw new Error('maxExclusive must be > 0');
  return cryptoRandomInt(0, maxExclusive);
};

// Deterministic PRNG for tests
export function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return (maxExclusive: number) => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    r = ((r ^ (r >>> 14)) >>> 0) / 4294967296; // 0..1
    return Math.floor(r * maxExclusive);
  };
}

export function seededRNG(seed: number): RNG {
  return mulberry32(seed);
}

export function pick<T>(arr: T[], rng: RNG = cryptoRNG): T {
  if (arr.length === 0) throw new Error('Cannot pick from empty array');
  return arr[rng(arr.length)];
}

