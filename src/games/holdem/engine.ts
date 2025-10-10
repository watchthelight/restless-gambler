import type { Card } from './types.js';
import { RNG, cryptoRNG } from '../../util/rng.js';

const SUITS = ['S', 'H', 'D', 'C'] as const;

export function makeDeck(): Card[] {
  const cards: Card[] = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) cards.push({ r: r as any, s });
  }
  return cards;
}

export function shuffle<T>(arr: T[], rng: RNG = cryptoRNG): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHoldem(rng: RNG = cryptoRNG): { deck: Card[]; players: [Card, Card][]; board: Card[] } {
  const deck = shuffle(makeDeck(), rng);
  const players: [Card, Card][] = [[deck.pop()!, deck.pop()!], [deck.pop()!, deck.pop()!]];
  // burn, flop, burn, turn, burn, river
  deck.pop();
  const flop = [deck.pop()!, deck.pop()!, deck.pop()!];
  deck.pop();
  const turn = deck.pop()!;
  deck.pop();
  const river = deck.pop()!;
  const board = [...flop, turn, river];
  return { deck, players, board };
}
