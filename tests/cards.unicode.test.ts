import { cardToUnicode, PLAYING_CARD_BACK } from '../src/cards/unicode.js';

describe('unicode playing cards', () => {
  test('specific glyphs', () => {
    expect(cardToUnicode({ suit: 'S', rank: 'A' } as any)).toBe('🂡');
    expect(cardToUnicode({ suit: 'H', rank: 'Q' } as any)).toBe('🂽');
    expect(cardToUnicode({ suit: 'D', rank: '5' } as any)).toBe('🃅');
    expect(cardToUnicode({ suit: 'C', rank: 'K' } as any)).toBe('🃞');
  });
});

