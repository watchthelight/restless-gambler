import { parseAmount } from './amount.js';

describe('parseAmount', () => {
  it('parses plain integers', () => {
    expect(parseAmount('0')).toBe(0n);
    expect(parseAmount('123')).toBe(123n);
    expect(parseAmount('1_000')).toBe(1000n);
  });
  it('parses k/m/b/t/q suffixes', () => {
    expect(parseAmount('1k')).toBe(1_000n);
    expect(parseAmount('1m')).toBe(1_000_000n);
    expect(parseAmount('1b')).toBe(1_000_000_000n);
    expect(parseAmount('1t')).toBe(1_000_000_000_000n);
    expect(parseAmount('1q')).toBe(1_000_000_000_000_000_000n);
  });
  it('parses underscores and case-insensitively', () => {
    expect(parseAmount('1_000_000b'.toLowerCase())).toBe(1_000_000_000_000_000n);
    expect(parseAmount('10Q')).toBe(10_000_000_000_000_000_000n);
  });
  it('rejects negatives and invalid', () => {
    expect(() => parseAmount('-1')).toThrow();
    expect(() => parseAmount('1.5m')).toThrow();
    expect(() => parseAmount('abc')).toThrow();
  });
  it('matches examples', () => {
    expect(parseAmount('1b')).toBe(1_000_000_000n);
    expect(parseAmount('10q')).toBe(10_000_000_000_000_000_000n);
  });
});

