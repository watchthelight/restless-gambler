/**
 * Compatibility layer: bridges old BigInt-based code to new HugeDecimal
 * This file provides backward-compatible functions while using HugeDecimal internally
 */

import { HugeDecimal, parseAmount, formatShort, formatExact, AmountParseError } from './num/index.js';

export type { ParseAmountOptions } from './num/index.js';
export { AmountParseError } from './num/index.js';

/**
 * Legacy ParseAmountOk format (now wraps HugeDecimal)
 */
export interface ParseAmountOk {
  value: bigint;        // For backward compat, converted from HugeDecimal
  power: number;
  normalized: string;
  raw: string;
  huge: HugeDecimal;    // NEW: the actual HugeDecimal value
}

/**
 * Parse amount with backward-compatible interface
 * Returns both bigint (for legacy code) and HugeDecimal (for new code)
 */
export function parseHumanAmount(
  input: string,
  opts?: { maxPower?: number }
): ParseAmountOk {
  try {
    const huge = parseAmount(input, opts);
    const value = huge.toBigInt(); // Convert to bigint for legacy code
    const power = 0; // Legacy field, not used in new system
    const normalized = formatExact(huge);
    const raw = String(input);

    return { value, power, normalized, raw, huge };
  } catch (e: any) {
    if (e instanceof AmountParseError) {
      // Convert to old error format for backward compat
      throw e;
    }
    throw new AmountParseError(
      e.message || 'Parse error',
      'bad_number',
      String(input)
    );
  }
}

/**
 * Format coins as bigint (legacy) - now uses HugeDecimal
 */
export function fmtCoinsBigInt(v: bigint | HugeDecimal): string {
  if (v instanceof HugeDecimal) {
    return formatExact(v);
  }
  return formatExact(HugeDecimal.fromBigInt(v));
}

/**
 * Format coins (short format)
 */
export function fmtCoins(v: bigint | HugeDecimal): string {
  if (v instanceof HugeDecimal) {
    return formatShort(v);
  }
  return formatShort(HugeDecimal.fromBigInt(v));
}

/**
 * Helper: convert legacy bigint to HugeDecimal
 */
export function toHuge(value: bigint | number | HugeDecimal | string): HugeDecimal {
  if (value instanceof HugeDecimal) return value;
  if (typeof value === 'bigint') return HugeDecimal.fromBigInt(value);
  if (typeof value === 'number') return HugeDecimal.fromNumber(value);
  if (typeof value === 'string') return parseAmount(value);
  throw new Error('Invalid value type for toHuge');
}

/**
 * Helper: convert HugeDecimal to bigint (for legacy code)
 */
export function toBigInt(value: HugeDecimal | bigint | number | string): bigint {
  if (typeof value === 'bigint') return value;
  if (value instanceof HugeDecimal) return value.toBigInt();
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') {
    // Try to parse as amount first
    try {
      return parseAmount(value).toBigInt();
    } catch {
      return BigInt(value);
    }
  }
  throw new Error('Invalid value type for toBigInt');
}
