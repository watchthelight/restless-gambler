import { handValueBJ } from '../src/ui/cardsDisplay.js';

describe('hand value (blackjack)', () => {
  test('10♠ + A♦ => 21', () => {
    const v = handValueBJ([{ suit: 'S', rank: '10' } as any, { suit: 'D', rank: 'A' } as any]);
    expect(v.total).toBe(21);
  });
  test('A♠ + A♦ + 9♥ => 21', () => {
    const v = handValueBJ([{ suit: 'S', rank: 'A' } as any, { suit: 'D', rank: 'A' } as any, { suit: 'H', rank: '9' } as any]);
    expect(v.total).toBe(21);
  });
});

