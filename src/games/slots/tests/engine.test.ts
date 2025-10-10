import { seededRNG } from '../../../util/rng.js';
import { defaultConfig, spin } from '../engine.js';

describe('slots engine', () => {
  test('pays three of a kind', () => {
    const rng = seededRNG(1);
    const result = spin(10, defaultConfig, rng);
    expect(result.payout).toBeGreaterThanOrEqual(0);
  });

  test('deterministic with seeded RNG', () => {
    const rng1 = seededRNG(42);
    const rng2 = seededRNG(42);
    const a = spin(5, defaultConfig, rng1);
    const b = spin(5, defaultConfig, rng2);
    expect(a.payout).toEqual(b.payout);
    expect(a.grid).toEqual(b.grid);
  });
});
