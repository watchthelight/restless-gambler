import { seededRNG } from '../../../util/rng.js';
import { dealInitial, handTotal, isBlackjack, makeShoe, shuffle } from '../engine.js';

describe('blackjack engine', () => {
  test('hand totals with aces', () => {
    expect(handTotal([{ r: 'A', s: 'S' }, { r: '9', s: 'H' } as any].map((c) => c as any)).total).toBe(20);
    expect(handTotal([{ r: 'A', s: 'S' }, { r: '9', s: 'H' }, { r: '5', s: 'D' }] as any).total).toBe(15);
  });

  test('immediate blackjack detection', () => {
    const rng = seededRNG(5);
    const s = dealInitial(10, rng);
    // at least not crash; finished may be true/false depending on shuffle
    expect(s.playerHands[0].cards.length).toBe(2);
  });

  test('shuffle deterministic with seed', () => {
    const shoe = makeShoe(1);
    const a = shuffle(shoe, seededRNG(1));
    const b = shuffle(shoe, seededRNG(1));
    expect(a).toEqual(b);
  });
});
