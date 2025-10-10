export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export interface Card { r: Rank; s: Suit }

export interface HandState {
  cards: Card[];
  doubled?: boolean;
  settled?: boolean;
}

export interface BJState {
  deck: Card[];
  playerHands: HandState[];
  dealer: HandState;
  activeIndex: number; // which player hand is active
  bet: number;
  finished: boolean;
}

