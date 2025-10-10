import { seededRNG } from '../../../util/rng.js';
import { getWinMultiplier, resolveBets, spinWheel } from '../engine.js';

describe('roulette engine', () => {
  test('straight bet pays 35:1 + stake', () => {
    const mult = getWinMultiplier(17, { type: 'straight', amount: 10, selection: '17' });
    expect(mult).toBe(36);
  });

  test('even money loses on zero', () => {
    const mult = getWinMultiplier(0, { type: 'red', amount: 10, selection: '' });
    expect(mult).toBe(0);
  });

  test('deterministic spin with seed', () => {
    const rng = seededRNG(123);
    const a = spinWheel(rng);
    const b = spinWheel(seededRNG(123));
    expect(a).toBe(b);
  });

  test('resolve bets summary', () => {
    const res = resolveBets(1, [
      { type: 'red', amount: 10, selection: '' },
      { type: 'even', amount: 10, selection: '' },
    ]);
    expect(res.payout).toBeGreaterThan(0);
  });
});
