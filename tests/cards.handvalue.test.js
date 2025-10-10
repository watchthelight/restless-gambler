import { handValueBJ } from '../src/ui/cardsDisplay.js';
describe('hand value (blackjack)', () => {
    test('10♠ + A♦ => 21', () => {
        const v = handValueBJ([{ suit: 'S', rank: '10' }, { suit: 'D', rank: 'A' }]);
        expect(v.total).toBe(21);
    });
    test('A♠ + A♦ + 9♥ => 21', () => {
        const v = handValueBJ([{ suit: 'S', rank: 'A' }, { suit: 'D', rank: 'A' }, { suit: 'H', rank: '9' }]);
        expect(v.total).toBe(21);
    });
});
