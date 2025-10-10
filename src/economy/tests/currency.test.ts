import { formatBolts } from '../currency.js';

describe('formatBolts', () => {
  test('zero', () => {
    expect(formatBolts(0)).toBe('0 🔩');
  });
  test('thousands', () => {
    expect(formatBolts(1500)).toBe('1.50k 🔩');
  });
  test('millions', () => {
    expect(formatBolts(1500000)).toBe('1.50m 🔩');
  });
});

