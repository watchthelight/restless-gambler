import { describe, it, expect } from '@jest/globals';
import { toBigIntStrict, formatExact, formatBalancePretty } from '../src/util/big.js';

describe('BigInt utilities', () => {
  describe('toBigIntStrict', () => {
    it('handles bigint passthrough', () => {
      expect(toBigIntStrict(123n)).toBe(123n);
    });

    it('handles number conversion', () => {
      expect(toBigIntStrict(456)).toBe(456n);
      expect(toBigIntStrict(456.789)).toBe(456n); // truncates
    });

    it('handles string with formatting', () => {
      expect(toBigIntStrict('1,234,567')).toBe(1234567n);
      expect(toBigIntStrict('1_000_000')).toBe(1000000n);
    });

    it('rejects invalid strings', () => {
      expect(() => toBigIntStrict('abc')).toThrow();
      expect(() => toBigIntStrict('12.34')).toThrow();
    });

    it('rejects invalid numbers', () => {
      expect(() => toBigIntStrict(NaN)).toThrow();
      expect(() => toBigIntStrict(Infinity)).toThrow();
    });
  });

  describe('formatExact', () => {
    it('formats small numbers', () => {
      expect(formatExact(123n)).toBe('123');
      expect(formatExact(1234n)).toBe('1,234');
    });

    it('formats large numbers with commas', () => {
      expect(formatExact(1234567n)).toBe('1,234,567');
      expect(formatExact(1234567890n)).toBe('1,234,567,890');
    });

    it('handles negative numbers', () => {
      expect(formatExact(-1234n)).toBe('-1,234');
      expect(formatExact(-1234567n)).toBe('-1,234,567');
    });

    it('no float artifacts at large magnitudes', () => {
      const base = 21_999_999_999_999_998n;
      expect(formatExact(base)).toBe('21,999,999,999,999,998');
      expect(formatExact(base + 1n)).toBe('21,999,999,999,999,999');
      expect(formatExact(base + 2n)).toBe('22,000,000,000,000,000');
      // Verify the sequence is correct: ...998 -> ...999 -> ...000
      // NOT the buggy: ...998 -> ...001 (skipping ...999)
    });
  });

  describe('formatBalancePretty', () => {
    it('formats small values without suffix', () => {
      expect(formatBalancePretty(1n)).toBe('1');
      expect(formatBalancePretty(999n)).toBe('999');
    });

    it('formats thousands', () => {
      expect(formatBalancePretty(1000n)).toBe('1.00k');
      expect(formatBalancePretty(1500n)).toBe('1.50k');
      expect(formatBalancePretty(10000n)).toBe('10.0k');
      expect(formatBalancePretty(100000n)).toBe('100k');
    });

    it('formats millions', () => {
      expect(formatBalancePretty(1000000n)).toBe('1.00m');
      expect(formatBalancePretty(1500000n)).toBe('1.50m');
      expect(formatBalancePretty(12345678n)).toBe('12.3m');
    });

    it('formats billions', () => {
      expect(formatBalancePretty(1000000000n)).toBe('1.00b');
      expect(formatBalancePretty(1500000000n)).toBe('1.50b');
    });

    it('handles rounding without float', () => {
      // 1.996k should round to 2.00k (carry to whole)
      expect(formatBalancePretty(1996n)).toBe('2.00k');
      // 1.995k should round to 2.00k
      expect(formatBalancePretty(1995n)).toBe('2.00k');
      // 1.994k should stay 1.99k
      expect(formatBalancePretty(1994n)).toBe('1.99k');
    });

    it('formats huge values correctly', () => {
      const qa = 1000000000000000n; // quadrillion
      expect(formatBalancePretty(qa)).toBe('1.00qa');
      expect(formatBalancePretty(qa * 5n)).toBe('5.00qa');
    });

    it('handles negative values', () => {
      expect(formatBalancePretty(-1000n)).toBe('-1.00k');
      expect(formatBalancePretty(-5500n)).toBe('-5.50k');
    });

    it('verifies no ...998 to ...001 jump', () => {
      // The key test: verify incrementing by 1 doesn't cause huge jumps
      // At 21_999_999_999_999_998, verify ...998 -> ...999 -> ...000
      const huge = 21_999_999_999_999_998n;
      expect(formatExact(huge)).toBe('21,999,999,999,999,998');
      expect(formatExact(huge + 1n)).toBe('21,999,999,999,999,999');
      expect(formatExact(huge + 2n)).toBe('22,000,000,000,000,000');
      // This verifies no float artifacts - the sequence is correct, no skipping from ...998 to ...001
    });
  });
});
