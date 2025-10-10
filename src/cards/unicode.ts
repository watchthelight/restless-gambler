import type { Card, Rank, Suit } from './Card.js';

// Unicode Playing Cards block mapping (no Knights)
// Suits base code points (Ace): Spades U+1F0A1, Hearts U+1F0B1, Diamonds U+1F0C1, Clubs U+1F0D1
const SUIT_BASE: Record<Suit, number> = { S: 0x1f0a1, H: 0x1f0b1, D: 0x1f0c1, C: 0x1f0d1 };

const RANK_OFFSET: Record<Rank, number> = {
  A: 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9,
  J: 10, Q: 12, K: 13,
};

export const PLAYING_CARD_BACK = String.fromCodePoint(0x1f0a0);
export const JOKER_BLACK = String.fromCodePoint(0x1f0cf);
export const JOKER_RED = String.fromCodePoint(0x1f0bf);

export function cardToUnicode(card: Card): string {
  const base = SUIT_BASE[card.suit];
  const off = RANK_OFFSET[card.rank];
  if (off === undefined) throw new Error('Invalid rank (knight not allowed)');
  // Knight (offset 11) is intentionally skipped; ensure we never produce it.
  const code = base + off;
  return String.fromCodePoint(code);
}

export function handToUnicode(cards: Card[]): string {
  const thin = '\u2009';
  return cards.map(cardToUnicode).join(thin);
}

