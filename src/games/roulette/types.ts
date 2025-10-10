export type BetType =
  | 'straight'
  | 'split'
  | 'street'
  | 'corner'
  | 'line'
  | 'dozen'
  | 'column'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high';

export interface Bet {
  type: BetType;
  amount: number;
  selection: string; // e.g., number list for split, street; or 1/2/3 for dozen/column
}

export interface SpinOutcome {
  number: number; // 0-36
  color: 'red' | 'black' | 'green';
  payout: number; // total payout
  results: { bet: Bet; win: boolean; payout: number }[];
}

