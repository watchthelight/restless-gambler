import { RNG, cryptoRNG } from '../../util/rng.js';
import type { Bet, SpinOutcome } from './types.js';

const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export function spinWheel(rng: RNG = cryptoRNG): number {
  return rng(37); // 0..36
}

export function colorOf(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return REDS.has(n) ? 'red' : 'black';
}

export function resolveBets(outcome: number, bets: Bet[]): SpinOutcome {
  const color = colorOf(outcome);
  const results = bets.map((bet) => {
    const { amount } = bet;
    const winMult = getWinMultiplier(outcome, bet);
    const win = winMult > 0;
    const payout = win ? amount * winMult : 0;
    return { bet, win, payout };
  });
  const payout = results.reduce((acc, r) => acc + r.payout, 0);
  return { number: outcome, color, payout, results };
}

export function getWinMultiplier(outcome: number, bet: Bet): number {
  switch (bet.type) {
    case 'straight': {
      const n = parseInt(bet.selection, 10);
      return outcome === n ? 35 + 1 : 0; // 35:1 plus original stake
    }
    case 'split': {
      const nums = parseNums(bet.selection);
      if (nums.length !== 2) return 0;
      return nums.includes(outcome) ? 17 + 1 : 0;
    }
    case 'street': {
      const nums = parseNums(bet.selection);
      if (nums.length !== 3) return 0;
      return nums.includes(outcome) ? 11 + 1 : 0;
    }
    case 'corner': {
      const nums = parseNums(bet.selection);
      if (nums.length !== 4) return 0;
      return nums.includes(outcome) ? 8 + 1 : 0;
    }
    case 'line': {
      const nums = parseNums(bet.selection);
      if (nums.length !== 6) return 0;
      return nums.includes(outcome) ? 5 + 1 : 0;
    }
    case 'dozen': {
      const d = parseInt(bet.selection, 10);
      if (![1, 2, 3].includes(d)) return 0;
      const inDozen = outcome >= 1 + (d - 1) * 12 && outcome <= d * 12;
      return inDozen ? 2 + 1 : 0;
    }
    case 'column': {
      const c = parseInt(bet.selection, 10);
      if (![1, 2, 3].includes(c)) return 0;
      const inCol = outcome !== 0 && (outcome - c) % 3 === 0;
      return inCol ? 2 + 1 : 0;
    }
    case 'red':
      return outcome !== 0 && colorOf(outcome) === 'red' ? 1 + 1 : 0;
    case 'black':
      return outcome !== 0 && colorOf(outcome) === 'black' ? 1 + 1 : 0;
    case 'odd':
      return outcome !== 0 && outcome % 2 === 1 ? 1 + 1 : 0;
    case 'even':
      return outcome !== 0 && outcome % 2 === 0 ? 1 + 1 : 0;
    case 'low':
      return outcome >= 1 && outcome <= 18 ? 1 + 1 : 0;
    case 'high':
      return outcome >= 19 && outcome <= 36 ? 1 + 1 : 0;
    default:
      return 0;
  }
}

function parseNums(s: string): number[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n));
}
