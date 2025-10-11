/**
 * Centralized RNG Luck Bias Hook
 * Applies luck buffs to random number generation across all gambling games
 */

import { getLuckBps } from "../rank/store.js";
import { getGuildDb } from "../db/connection.js";
import { getSettingNum } from "../db/kv.js";

/**
 * Apply user's luck buff to a random number generator
 * This is the single integration point for luck bias across all games
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param rng - Random number generator function (returns 0-1)
 * @returns Biased random number (0-1) with luck applied
 *
 * @example
 * // Basic usage in a game
 * const random = withUserLuck(guildId, userId, () => Math.random());
 * if (random < 0.5) { // win condition
 *   // User wins
 * }
 */
export function withUserLuck(guildId: string, userId: string, rng: () => number): number {
  const luck = getLuckBps(guildId, userId);

  if (!luck || luck <= 0) {
    // No luck buff active, return unmodified random
    return rng();
  }

  // Get max luck cap from config
  const db = getGuildDb(guildId);
  const maxLuck = getSettingNum(db, "luck_max_bps", 300);

  // Clamp luck to configured maximum
  const clampedLuck = Math.min(maxLuck, Math.max(0, luck));

  // Convert basis points to decimal (150 bps = 0.015 = 1.5%)
  const bias = clampedLuck / 10000;

  // Generate base random number
  const u = rng();

  // Apply luck bias by shifting the random number lower
  // This increases the chance of falling under win thresholds
  // Example: if win condition is u < 0.5, shifting u down increases win chance
  const biased = Math.max(0, u - bias);

  return biased;
}

/**
 * Get user's luck percentage for display purposes
 * @returns Luck percentage (e.g., 1.5 for 1.5%)
 */
export function getUserLuckPercentage(guildId: string, userId: string): number {
  const luck = getLuckBps(guildId, userId);
  return luck / 100; // Convert basis points to percentage
}

/**
 * Check if user has an active luck buff
 */
export function hasActiveLuck(guildId: string, userId: string): boolean {
  const luck = getLuckBps(guildId, userId);
  return luck > 0;
}

/**
 * Apply luck bias to a win probability
 * Use this for games that check probabilities directly rather than threshold comparisons
 *
 * @param baseProbability - Base win probability (0-1)
 * @param luckBps - Luck bonus in basis points
 * @returns Adjusted probability with luck applied
 *
 * @example
 * const winChance = applyLuckToProbability(0.48, 150); // 0.48 + 0.015 = 0.495
 */
export function applyLuckToProbability(baseProbability: number, luckBps: number): number {
  const bias = luckBps / 10000;
  return Math.min(1, Math.max(0, baseProbability + bias));
}

/**
 * Apply luck bias to win thresholds
 * Use for games that compare random values against thresholds
 *
 * @param threshold - Original win threshold
 * @param luckBps - Luck bonus in basis points
 * @returns Adjusted threshold that makes winning easier
 *
 * @example
 * // Instead of: if (random < 0.5) win
 * // Use: if (random < applyLuckToThreshold(0.5, luckBps)) win
 */
export function applyLuckToThreshold(threshold: number, luckBps: number): number {
  const bias = luckBps / 10000;
  return Math.min(1, Math.max(0, threshold + bias));
}

/**
 * Weighted random choice with luck bias
 * Useful for games like roulette where multiple outcomes have different probabilities
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param choices - Array of choices with weights
 * @param rng - Random number generator
 * @returns Selected choice with luck bias applied
 *
 * @example
 * const result = weightedRandomWithLuck(guildId, userId, [
 *   { value: 'win', weight: 48, isGoodOutcome: true },
 *   { value: 'lose', weight: 52, isGoodOutcome: false }
 * ], () => Math.random());
 */
export function weightedRandomWithLuck<T>(
  guildId: string,
  userId: string,
  choices: Array<{ value: T; weight: number; isGoodOutcome?: boolean }>,
  rng: () => number
): T {
  const luck = getLuckBps(guildId, userId);

  // Calculate total weight
  const totalWeight = choices.reduce((sum, choice) => sum + choice.weight, 0);

  // If luck is active, slightly boost good outcomes
  let adjustedChoices = choices;
  if (luck > 0) {
    const bias = luck / 10000;
    adjustedChoices = choices.map(choice => ({
      ...choice,
      weight: choice.isGoodOutcome
        ? choice.weight * (1 + bias)  // Boost good outcomes
        : choice.weight * (1 - bias * 0.5), // Slightly reduce bad outcomes
    }));
  }

  // Normalize and select
  const adjustedTotal = adjustedChoices.reduce((sum, choice) => sum + choice.weight, 0);
  let random = rng() * adjustedTotal;

  for (const choice of adjustedChoices) {
    random -= choice.weight;
    if (random <= 0) {
      return choice.value;
    }
  }

  // Fallback (should never reach here)
  return adjustedChoices[adjustedChoices.length - 1].value;
}
