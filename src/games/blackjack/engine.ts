import { RNG, cryptoRNG } from '../../util/rng.js';
import type { BJState, Card, HandState, Rank, Suit } from './types.js';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export function makeShoe(decks = 6): Card[] {
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) {
      for (const r of RANKS) {
        cards.push({ r, s });
      }
    }
  }
  return cards;
}

export function shuffle(cards: Card[], rng: RNG = cryptoRNG): Card[] {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function valueOfCard(r: Rank): number {
  if (r === 'A') return 11; // can be 1 later
  if (r === 'K' || r === 'Q' || r === 'J' || r === '10') return 10;
  return parseInt(r, 10);
}

export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += valueOfCard(c.r);
    if (c.r === 'A') aces++;
  }
  let soft = false;
  while (total > 21 && aces > 0) {
    total -= 10; // count one Ace as 1 instead of 11
    aces--;
  }
  soft = cards.some((c) => c.r === 'A') && total <= 21 && aces > 0; // if any Ace still counts as 11
  return { total, soft };
}

export function isBlackjack(cards: Card[]): boolean {
  if (cards.length !== 2) return false;
  const totals = handTotal(cards);
  return totals.total === 21;
}

export function dealInitial(bet: number, rng: RNG = cryptoRNG): BJState {
  const deck = shuffle(makeShoe(6), rng);
  const playerHands: HandState[] = [{ cards: [deck.pop()!, deck.pop()!] }];
  const dealer: HandState = { cards: [deck.pop()!, deck.pop()!] };
  const state: BJState = { deck, playerHands, dealer, activeIndex: 0, bet, finished: false };
  // Immediate blackjack resolution
  if (isBlackjack(playerHands[0].cards) || isBlackjack(dealer.cards)) {
    state.finished = true;
  }
  return state;
}

export function hit(state: BJState): void {
  if (state.finished) return;
  const hand = state.playerHands[state.activeIndex];
  hand.cards.push(state.deck.pop()!);
  const { total } = handTotal(hand.cards);
  if (total >= 21) {
    // auto stand/bust
    stand(state);
  }
}

export function stand(state: BJState): void {
  if (state.finished) return;
  const next = state.activeIndex + 1;
  if (next < state.playerHands.length) {
    state.activeIndex = next;
  } else {
    // dealer plays
    dealerPlay(state);
    state.finished = true;
  }
}

export function canDouble(hand: HandState): boolean {
  return hand.cards.length === 2 && !hand.doubled;
}

export function doubleDown(state: BJState): void {
  if (state.finished) return;
  const hand = state.playerHands[state.activeIndex];
  if (!canDouble(hand)) return;
  hand.doubled = true;
  hand.cards.push(state.deck.pop()!);
  stand(state);
}

export function canSplit(hand: HandState): boolean {
  return hand.cards.length === 2 && valueOfCard(hand.cards[0].r) === valueOfCard(hand.cards[1].r);
}

export function split(state: BJState): void {
  if (state.finished) return;
  const hand = state.playerHands[state.activeIndex];
  if (!canSplit(hand)) return;
  const [c1, c2] = hand.cards;
  // split into two hands, draw one card each
  const h1: HandState = { cards: [c1, state.deck.pop()!] };
  const h2: HandState = { cards: [c2, state.deck.pop()!] };
  state.playerHands.splice(state.activeIndex, 1, h1, h2);
}

function dealerPlay(state: BJState) {
  // Dealer stands on soft 17
  while (true) {
    const { total, soft } = handTotal(state.dealer.cards);
    if (total < 17) {
      state.dealer.cards.push(state.deck.pop()!);
      continue;
    }
    if (total === 17 && soft) {
      // hit soft 17? Rules say dealer stands on soft 17 => stop
      break;
    }
    break;
  }
}

export function settle(state: BJState): { outcomes: ('win' | 'push' | 'lose')[]; payout: number } {
  const outcomes: ('win' | 'push' | 'lose')[] = [];
  const dbj = isBlackjack(state.dealer.cards);
  const dealerTotal = handTotal(state.dealer.cards).total;
  let payout = 0;
  for (const hand of state.playerHands) {
    const total = handTotal(hand.cards).total;
    const bet = hand.doubled ? state.bet * 2 : state.bet;
    const pbj = isBlackjack(hand.cards);
    let result: 'win' | 'push' | 'lose' = 'lose';
    if (pbj && !dbj) {
      // blackjack pays 3:2
      payout += Math.floor(bet * 2.5);
      result = 'win';
    } else if (dbj && pbj) {
      result = 'push';
      payout += bet; // return stake
    } else if (total > 21) {
      result = 'lose';
    } else if (dealerTotal > 21) {
      result = 'win';
      payout += bet * 2;
    } else if (total > dealerTotal) {
      result = 'win';
      payout += bet * 2;
    } else if (total === dealerTotal) {
      result = 'push';
      payout += bet;
    } else {
      result = 'lose';
    }
    outcomes.push(result);
  }
  return { outcomes, payout };
}
