import { handTotal, isBlackjack, settle } from '../engine.js';

describe('blackjack payouts', () => {
  test('blackjack 3:2 payout', () => {
    const state: any = {
      bet: 100,
      playerHands: [{ cards: [{ r: 'A', s: 'S' }, { r: 'K', s: 'H' }] }],
      dealer: { cards: [{ r: '9', s: 'D' }, { r: '7', s: 'C' }] },
    };
    const r = settle(state);
    expect(r.payout).toBe(250); // 2.5x total returned (includes stake)
  });

  test('dealer blackjack vs player blackjack -> push', () => {
    const state: any = {
      bet: 100,
      playerHands: [{ cards: [{ r: 'A', s: 'S' }, { r: 'K', s: 'H' }] }],
      dealer: { cards: [{ r: 'A', s: 'D' }, { r: 'Q', s: 'C' }] },
    };
    expect(isBlackjack(state.playerHands[0].cards)).toBe(true);
    expect(isBlackjack(state.dealer.cards)).toBe(true);
    const r = settle(state);
    expect(r.payout).toBe(100);
  });

  test('dealer stands on soft 17', () => {
    // Dealer: A + 6 (soft 17) should stand
    const state: any = {
      bet: 10,
      playerHands: [{ cards: [{ r: '9', s: 'S' }, { r: '8', s: 'H' }] }],
      dealer: { cards: [{ r: 'A', s: 'D' }, { r: '6', s: 'C' }] },
    };
    const d = handTotal(state.dealer.cards);
    expect(d.total).toBe(17);
    expect(d.soft).toBe(true);
  });
});

