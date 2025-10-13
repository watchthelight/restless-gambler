/**
 * Tests for HugeDecimal exact arithmetic
 */

import { describe, test, expect } from '@jest/globals';
import { HugeDecimal, min, max, clamp } from './Huge.js';
import { parseAmount, AmountParseError } from './parse.js';
import { formatShort, formatExact } from './format.js';

describe('HugeDecimal', () => {
  describe('Construction', () => {
    test('from bigint', () => {
      const hd = HugeDecimal.fromBigInt(1234567890n);
      expect(hd.toBigInt()).toBe(1234567890n);
      expect(hd.isPositive()).toBe(true);
    });

    test('from number', () => {
      const hd = HugeDecimal.fromNumber(12345);
      expect(hd.toBigInt()).toBe(12345n);
    });

    test('from string', () => {
      const hd = HugeDecimal.fromString('123.456');
      expect(hd.toNumber()).toBeCloseTo(123.456, 3);
    });

    test('zero', () => {
      const hd = HugeDecimal.ZERO;
      expect(hd.isZero()).toBe(true);
      expect(hd.toBigInt()).toBe(0n);
    });
  });

  describe('Arithmetic', () => {
    test('addition', () => {
      const a = HugeDecimal.fromBigInt(100n);
      const b = HugeDecimal.fromBigInt(50n);
      const sum = a.add(b);
      expect(sum.toBigInt()).toBe(150n);
    });

    test('subtraction', () => {
      const a = HugeDecimal.fromBigInt(100n);
      const b = HugeDecimal.fromBigInt(50n);
      const diff = a.sub(b);
      expect(diff.toBigInt()).toBe(50n);
    });

    test('multiplication', () => {
      const a = HugeDecimal.fromBigInt(10n);
      const b = HugeDecimal.fromBigInt(5n);
      const prod = a.mul(b);
      expect(prod.toBigInt()).toBe(50n);
    });

    test('division', () => {
      const a = HugeDecimal.fromBigInt(100n);
      const b = HugeDecimal.fromBigInt(4n);
      const quot = a.div(b);
      expect(quot.toBigInt()).toBe(25n);
    });

    test('mulPow10', () => {
      const hd = HugeDecimal.fromBigInt(123n);
      const scaled = hd.mulPow10(3n);
      expect(scaled.toBigInt()).toBe(123000n);
    });

    test('large number arithmetic', () => {
      const a = HugeDecimal.fromString('1e15'); // quadrillion
      const b = HugeDecimal.fromString('2e15');
      const sum = a.add(b);
      expect(sum.toBigInt()).toBe(3000000000000000n);
    });
  });

  describe('Comparison', () => {
    test('equality', () => {
      const a = HugeDecimal.fromBigInt(100n);
      const b = HugeDecimal.fromBigInt(100n);
      expect(a.eq(b)).toBe(true);
    });

    test('less than', () => {
      const a = HugeDecimal.fromBigInt(50n);
      const b = HugeDecimal.fromBigInt(100n);
      expect(a.lt(b)).toBe(true);
      expect(b.lt(a)).toBe(false);
    });

    test('greater than', () => {
      const a = HugeDecimal.fromBigInt(100n);
      const b = HugeDecimal.fromBigInt(50n);
      expect(a.gt(b)).toBe(true);
      expect(b.gt(a)).toBe(false);
    });
  });

  describe('DB Storage', () => {
    test('round-trip to DB string', () => {
      const original = HugeDecimal.fromBigInt(123456789n);
      const dbStr = original.toDbString();
      const restored = HugeDecimal.fromDbString(dbStr);
      expect(restored.eq(original)).toBe(true);
    });

    test('legacy number conversion', () => {
      const hd = HugeDecimal.fromDbString('1000');
      expect(hd.toBigInt()).toBe(1000n);
    });
  });
});

describe('parseAmount', () => {
  test('plain integer', () => {
    const hd = parseAmount('12345');
    expect(hd.toBigInt()).toBe(12345n);
  });

  test('decimal', () => {
    const hd = parseAmount('123.45');
    expect(hd.toNumber()).toBeCloseTo(123.45, 2);
  });

  test('scientific notation', () => {
    const hd = parseAmount('1e6');
    expect(hd.toBigInt()).toBe(1000000n);
  });

  test('suffix k', () => {
    const hd = parseAmount('1.5k');
    expect(hd.toBigInt()).toBe(1500n);
  });

  test('suffix m', () => {
    const hd = parseAmount('2m');
    expect(hd.toBigInt()).toBe(2000000n);
  });

  test('suffix b', () => {
    const hd = parseAmount('3b');
    expect(hd.toBigInt()).toBe(3000000000n);
  });

  test('suffix qa (quadrillion)', () => {
    const hd = parseAmount('2qa');
    expect(hd.toBigInt()).toBe(2000000000000000n);
  });

  test('suffix ce (centillion)', () => {
    const hd = parseAmount('1ce');
    const str = hd.toStringExact();
    expect(str).toContain('e');
  });

  test('bad suffix throws', () => {
    expect(() => parseAmount('10xyz')).toThrow(AmountParseError);
  });

  test('negative throws by default', () => {
    expect(() => parseAmount('-100')).toThrow(AmountParseError);
  });

  test('negative allowed with option', () => {
    const hd = parseAmount('-100', { allowNegative: true });
    expect(hd.isNegative()).toBe(true);
    expect(hd.toBigInt()).toBe(-100n);
  });
});

describe('formatShort', () => {
  test('small number', () => {
    const hd = HugeDecimal.fromBigInt(123n);
    expect(formatShort(hd)).toBe('123');
  });

  test('thousands', () => {
    const hd = HugeDecimal.fromBigInt(1500n);
    const formatted = formatShort(hd);
    expect(formatted).toMatch(/1\.5+k/);
  });

  test('millions', () => {
    const hd = HugeDecimal.fromBigInt(2000000n);
    const formatted = formatShort(hd);
    expect(formatted).toMatch(/2\.?0*m/);
  });

  test('billions', () => {
    const hd = HugeDecimal.fromBigInt(3000000000n);
    const formatted = formatShort(hd);
    expect(formatted).toMatch(/3\.?0*b/);
  });
});

describe('formatExact', () => {
  test('with thousands separators', () => {
    const hd = HugeDecimal.fromBigInt(1234567n);
    const formatted = formatExact(hd);
    expect(formatted).toBe('1,234,567');
  });

  test('zero', () => {
    expect(formatExact(HugeDecimal.ZERO)).toBe('0');
  });
});

describe('Utility functions', () => {
  test('min', () => {
    const a = HugeDecimal.fromBigInt(100n);
    const b = HugeDecimal.fromBigInt(50n);
    expect(min(a, b).eq(b)).toBe(true);
  });

  test('max', () => {
    const a = HugeDecimal.fromBigInt(100n);
    const b = HugeDecimal.fromBigInt(50n);
    expect(max(a, b).eq(a)).toBe(true);
  });

  test('clamp', () => {
    const val = HugeDecimal.fromBigInt(150n);
    const lo = HugeDecimal.fromBigInt(50n);
    const hi = HugeDecimal.fromBigInt(100n);
    const clamped = clamp(val, lo, hi);
    expect(clamped.eq(hi)).toBe(true);
  });
});
