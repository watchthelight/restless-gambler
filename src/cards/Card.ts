export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type Card = { suit: Suit; rank: Rank };

export function toEngineCard(c: Card) {
  return { s: c.suit as any, r: (c.rank === '10' ? '10' : (c.rank as any)) };
}

