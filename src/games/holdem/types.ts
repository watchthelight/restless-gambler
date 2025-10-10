export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 2|3|4|5|6|7|8|9|10|11|12|13|14; // 11=J,12=Q,13=K,14=A
export interface Card { r: Rank; s: Suit }

export type HandRankName =
  | 'high'
  | 'pair'
  | 'two_pair'
  | 'three'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four'
  | 'straight_flush';

export interface RankedHand {
  name: HandRankName;
  rank: number[]; // for tiebreakers
}

