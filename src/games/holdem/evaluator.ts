import type { Card, RankedHand } from './types.js';

function byRankDesc(a: number, b: number) { return b - a; }

export function rank5(cards: Card[]): RankedHand {
  if (cards.length !== 5) throw new Error('need 5 cards');
  const counts = new Map<number, number>();
  const suits = new Map<string, number>();
  for (const c of cards) {
    counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
    suits.set(c.s, (suits.get(c.s) ?? 0) + 1);
  }
  const ranks = Array.from(counts.keys()).sort(byRankDesc);
  const isFlush = Array.from(suits.values()).some((v) => v === 5);
  const sorted = cards.map((c) => c.r).sort(byRankDesc);
  const unique = Array.from(new Set(sorted));
  let isStraight = false;
  let topStraight = 0;
  // straight handling including wheel A-2-3-4-5
  if (unique.length === 5 && unique[0] - unique[4] === 4) {
    isStraight = true; topStraight = unique[0];
  } else if (JSON.stringify(unique) === JSON.stringify([14, 5, 4, 3, 2])) {
    isStraight = true; topStraight = 5;
  }

  if (isStraight && isFlush) {
    return { name: 'straight_flush', rank: [topStraight] };
  }

  // group by count
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  if (groups[0][1] === 4) {
    // four of a kind
    const kicker = ranks.find((r) => r !== groups[0][0])!;
    return { name: 'four', rank: [groups[0][0], kicker] };
  }
  if (groups[0][1] === 3 && groups[1][1] === 2) {
    return { name: 'full_house', rank: [groups[0][0], groups[1][0]] };
  }
  if (isFlush) {
    return { name: 'flush', rank: sorted };
  }
  if (isStraight) {
    return { name: 'straight', rank: [topStraight] };
  }
  if (groups[0][1] === 3) {
    const kickers = ranks.filter((r) => r !== groups[0][0]);
    return { name: 'three', rank: [groups[0][0], ...kickers] };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairRanks = [groups[0][0], groups[1][0]].sort(byRankDesc);
    const kicker = ranks.find((r) => r !== pairRanks[0] && r !== pairRanks[1])!;
    return { name: 'two_pair', rank: [...pairRanks, kicker] };
  }
  if (groups[0][1] === 2) {
    const kickers = ranks.filter((r) => r !== groups[0][0]);
    return { name: 'pair', rank: [groups[0][0], ...kickers] };
  }
  return { name: 'high', rank: ranks };
}

export function bestOf7(cards: Card[]): RankedHand {
  if (cards.length !== 7) throw new Error('need 7 cards');
  // choose best 5 of 7
  let best: RankedHand | null = null;
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five = cards.filter((_, idx) => idx !== i && idx !== j);
      const r = rank5(five);
      if (!best || compareRanks(r, best) > 0) best = r;
    }
  }
  return best!;
}

const ORDER: Record<RankedHand['name'], number> = {
  high: 1,
  pair: 2,
  two_pair: 3,
  three: 4,
  straight: 5,
  flush: 6,
  full_house: 7,
  four: 8,
  straight_flush: 9,
};

export function compareRanks(a: RankedHand, b: RankedHand): number {
  if (ORDER[a.name] !== ORDER[b.name]) return ORDER[a.name] - ORDER[b.name];
  for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
    const ai = a.rank[i] ?? 0;
    const bi = b.rank[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}
