/**
 * Balance formatting - now uses HugeDecimal
 * Provides backward-compatible interface
 */

import { HugeDecimal, formatShort, formatExact as formatExactNew } from '../lib/num/index.js';

/**
 * Format balance with suffix notation (1.5k, 2.75m, etc.)
 * Accepts bigint, number, or HugeDecimal
 */
export function formatBalance(value: number | bigint | HugeDecimal): string {
  let hd: HugeDecimal;

  if (value instanceof HugeDecimal) {
    hd = value;
  } else if (typeof value === 'bigint') {
    hd = HugeDecimal.fromBigInt(value);
  } else if (typeof value === 'number') {
    hd = HugeDecimal.fromNumber(value);
  } else {
    hd = HugeDecimal.ZERO;
  }

  return formatShort(hd, { sigFigs: 3, minDigitsForSuffix: 4 });
}

/**
 * Format exact value with thousands separators
 */
export function formatExact(value: bigint | number | HugeDecimal): string {
  let hd: HugeDecimal;

  if (value instanceof HugeDecimal) {
    hd = value;
  } else if (typeof value === 'bigint') {
    hd = HugeDecimal.fromBigInt(value);
  } else if (typeof value === 'number') {
    hd = HugeDecimal.fromNumber(value);
  } else {
    hd = HugeDecimal.ZERO;
  }

  return formatExactNew(hd);
}

/**
 * Parse balance string back to bigint (legacy compatibility)
 */
export function parseBalance(input: string): bigint {
  const { parseAmount } = require('../lib/num/index.js');
  return parseAmount(input).toBigInt();
}

/**
 * Format with pretty suffixes (legacy export)
 */
export function formatBalancePretty(b: bigint, decimals = 2): string {
  return formatBalance(b);
}

// Re-export UNITS for tests
export const __UNITS = ['', 'k', 'm', 'b', 't', 'qa', 'qi', 'sx', 'sp', 'oc', 'no', 'de'];
