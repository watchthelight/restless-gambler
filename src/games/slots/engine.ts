import { RNG, cryptoRNG } from '../../util/rng.js';
import type { Grid, SlotsConfig, SpinResult, Symbol } from './types.js';

export const defaultConfig: SlotsConfig = {
  reels: [
    ['7', 'BAR', 'BELL', 'CHERRY', 'W', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'],
    ['7', 'BAR', 'BELL', 'CHERRY', 'W', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'],
    ['7', 'BAR', 'BELL', 'CHERRY', 'W', 'A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C'],
  ],
  paytable: {
    three: {
      '7': 100,
      BAR: 40,
      BELL: 20,
      CHERRY: 10,
      W: 0, // wild doesn't pay by itself
      A: 3,
      B: 3,
      C: 3,
    },
    anyTwoSevensWithWild: 15,
    anyThreeLow: 3,
  },
};

function spinReel(reel: Symbol[], rng: RNG): [Symbol, Symbol, Symbol] {
  const i = rng(reel.length);
  const a = reel[i];
  const b = reel[(i + 1) % reel.length];
  const c = reel[(i + 2) % reel.length];
  return [a, b, c];
}

export function spin(
  bet: number,
  config: SlotsConfig = defaultConfig,
  rng: RNG = cryptoRNG,
): SpinResult {
  if (bet <= 0) throw new Error('Bet must be positive');
  const cols = config.reels.map((reel: Symbol[]) => spinReel(reel, rng));
  const grid: Grid = [0, 1, 2].map((row) => [cols[0][row], cols[1][row], cols[2][row]]);
  const lines: SpinResult['lines'] = [];
  let payoutUnits = 0;

  for (let row = 0; row < 3; row++) {
    const line = grid[row];
    const [s1, s2, s3] = line;
    const wildCount = line.filter((s: Symbol) => s === 'W').length;
    const sevens = line.filter((s: Symbol) => s === '7').length;
    const nonWild = line.filter((s: Symbol) => s !== 'W');
    // three of a kind with wilds acting as matching symbol
    const target = nonWild.length > 0 ? nonWild[0] : 'W';
    const matches = line.every((s: Symbol) => s === target || s === 'W');
    if (matches && target !== 'W') {
      const mult = config.paytable.three[target] ?? 0;
      if (mult > 0) {
        payoutUnits += mult;
        lines.push({ row, kind: `3x${target}`, payout: mult * bet });
        continue;
      }
    }
    // any two 7s + one wild
    if (sevens === 2 && wildCount === 1) {
      payoutUnits += config.paytable.anyTwoSevensWithWild;
      lines.push({ row, kind: '2x7 + W', payout: config.paytable.anyTwoSevensWithWild * bet });
      continue;
    }
    // any 3-of-a-kind of low symbols A/B/C (no wilds)
    if (s1 === s2 && s2 === s3 && ['A', 'B', 'C'].includes(s1)) {
      payoutUnits += config.paytable.anyThreeLow;
      lines.push({ row, kind: '3xLOW', payout: config.paytable.anyThreeLow * bet });
      continue;
    }
  }

  const payout = payoutUnits * bet;
  return { grid, payout, lines };
}

export function renderGrid(grid: Grid): string {
  const map: Record<Symbol, string> = {
    '7': '7',
    BAR: 'B',
    BELL: '🔔',
    CHERRY: '🍒',
    W: '*',
    A: 'A',
    B: 'B',
    C: 'C',
  };
  const rows = grid.map((r) => r.map((s) => map[s]).join(' | '));
  return '```\n' + rows.join('\n') + '\n```';
}
