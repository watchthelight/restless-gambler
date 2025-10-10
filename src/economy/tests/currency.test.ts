import { formatBolts } from '../currency.js';

describe('formatBolts', () => {
  test('zero', () => {
    expect(formatBolts(0)).toBe('0 🔩');
  });
  test('thousands', () => {
    // locale-aware includes comma for en; the emoji must be present
    expect(formatBolts(1500)).toMatch(/1[,\s]?500 🔩/);
  });
  test('compact', () => {
    expect(formatBolts(1500, { compact: true })).toBe('1.5k 🔩');
  });
});

