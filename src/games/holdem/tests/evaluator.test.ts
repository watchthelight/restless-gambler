import { bestOf7, compareRanks, rank5 } from '../evaluator.js';

function card(r: number, s: 'S' | 'H' | 'D' | 'C') {
  return { r: r as any, s };
}

describe('holdem evaluator', () => {
  test('straight vs three of a kind', () => {
    const straight = rank5([card(10, 'S'), card(9, 'H'), card(8, 'D'), card(7, 'C'), card(6, 'S')]);
    const trips = rank5([card(5, 'S'), card(5, 'H'), card(5, 'D'), card(2, 'C'), card(9, 'S')]);
    expect(compareRanks(straight, trips)).toBeGreaterThan(0);
  });

  test('best of 7 picks flush or straight flush', () => {
    const seven = [card(14, 'S'), card(13, 'S'), card(12, 'S'), card(11, 'S'), card(10, 'S'), card(2, 'D'), card(3, 'H')];
    const best = bestOf7(seven);
    expect(best.name === 'straight_flush' || best.name === 'flush').toBeTruthy();
  });
});
