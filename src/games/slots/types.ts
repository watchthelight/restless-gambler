export type Symbol = '7' | 'BAR' | 'BELL' | 'CHERRY' | 'W' | 'A' | 'B' | 'C';
export type Grid = Symbol[][]; // 3x3

export interface SpinResult {
  grid: Grid;
  payout: number;
  lines: { row: number; kind: string; payout: number }[];
}

export interface SlotsConfig {
  reels: Symbol[][]; // 3 reels each with weighted symbols
  paytable: {
    three: Record<Symbol, number>; // 3-of-a-kind exact
    anyTwoSevensWithWild: number; // any two 7s + wild on a line
    anyThreeLow: number; // any 3-of-a-kind of A/B/C
  };
}

