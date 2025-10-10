import { cardToUnicode } from '../src/cards/unicode.js';
describe('unicode playing cards', () => {
    test('specific glyphs', () => {
        expect(cardToUnicode({ suit: 'S', rank: 'A' })).toBe('🂡');
        expect(cardToUnicode({ suit: 'H', rank: 'Q' })).toBe('🂽');
        expect(cardToUnicode({ suit: 'D', rank: '5' })).toBe('🃅');
        expect(cardToUnicode({ suit: 'C', rank: 'K' })).toBe('🃞');
    });
});
