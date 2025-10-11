import { describe, test, expect } from '@jest/globals';
import { parseHumanAmount } from '../../config/maxBet.js';

describe('parseHumanAmount', () => {
  test('parses underscores', () => {
    expect(parseHumanAmount('1_000')).toBe(1000n);
  });
  test('parses k suffix', () => {
    expect(parseHumanAmount('10k')).toBe(10000n);
  });
  test('parses decimal with m suffix', () => {
    expect(parseHumanAmount('2.5m')).toBe(2500000n);
  });
});

