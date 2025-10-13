/**
 * Helper utilities for balance comparisons with HugeDecimal
 * Simplifies migrating from BigInt comparisons
 */

import { HugeDecimal } from '../lib/num/index.js';
import { getBalance } from './wallet.js';

/**
 * Convert any amount type to HugeDecimal
 */
export function toHuge(value: HugeDecimal | bigint | number): HugeDecimal {
  if (value instanceof HugeDecimal) return value;
  if (typeof value === 'bigint') return HugeDecimal.fromBigInt(value);
  if (typeof value === 'number') return HugeDecimal.fromNumber(value);
  throw new Error('Invalid value type for toHuge');
}

/**
 * Check if balance is sufficient for amount
 * @returns true if balance >= amount
 */
export function hasSufficientBalance(
  guildId: string,
  userId: string,
  amount: HugeDecimal | bigint | number
): boolean {
  const balance = getBalance(guildId, userId);
  const amountHuge = toHuge(amount);
  return balance.gte(amountHuge);
}

/**
 * Get shortfall if balance is insufficient
 * @returns HugeDecimal of shortfall, or ZERO if sufficient
 */
export function getShortfall(
  guildId: string,
  userId: string,
  required: HugeDecimal | bigint | number
): HugeDecimal {
  const balance = getBalance(guildId, userId);
  const requiredHuge = toHuge(required);
  if (balance.gte(requiredHuge)) return HugeDecimal.ZERO;
  return requiredHuge.sub(balance);
}
