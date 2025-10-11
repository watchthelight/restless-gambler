/**
 * Rank & XP Math Utilities
 * Provides XP curve calculations and helper functions for the rank system
 */

export type Curve = "linear" | "quadratic" | "exponential";

/**
 * Calculate XP needed to reach a specific level
 * @param level - Target level (1-based)
 * @param curve - Progression curve type
 * @param maxLevel - Maximum achievable level
 * @returns XP required to reach the level from the previous level
 */
export function xpNeededFor(level: number, curve: Curve, maxLevel: number): number {
  const L = Math.max(1, Math.min(level, maxLevel));

  switch (curve) {
    case "linear":
      // Simple linear scaling: 100 XP per level
      return 100 * L;

    case "quadratic":
      // Quadratic: faster early progression, steady later
      // Formula: 50L² + 50L
      return Math.floor(50 * L * L + 50 * L);

    case "exponential":
      // Exponential: careful growth with 18% increase per level
      // Formula: 75 × 1.18^L
      return Math.floor(75 * Math.pow(1.18, L));
  }
}

/**
 * Calculate total XP needed to reach a specific level from level 1
 * @param targetLevel - Target level (1-based)
 * @param curve - Progression curve type
 * @param maxLevel - Maximum achievable level
 * @returns Total XP needed from level 1
 */
export function totalXpForLevel(targetLevel: number, curve: Curve, maxLevel: number): number {
  let total = 0;
  for (let level = 1; level < targetLevel; level++) {
    total += xpNeededFor(level, curve, maxLevel);
  }
  return total;
}

/**
 * Clamp a value between min and max bounds
 */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : (x > hi ? hi : x);
}

/**
 * Calculate progress percentage to next level
 * @param currentXp - Current XP in the current level
 * @param xpNeeded - XP needed to reach next level
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(currentXp: number, xpNeeded: number): number {
  if (xpNeeded <= 0) return 100;
  return Math.min(100, Math.max(0, (currentXp / xpNeeded) * 100));
}

/**
 * Format XP/level progress as a progress bar
 * @param currentXp - Current XP
 * @param xpNeeded - XP needed for next level
 * @param barLength - Length of the progress bar (default 10)
 * @returns Formatted progress bar string
 */
export function formatProgressBar(currentXp: number, xpNeeded: number, barLength: number = 10): string {
  const progress = calculateProgress(currentXp, xpNeeded);
  const filled = Math.floor((progress / 100) * barLength);
  const empty = barLength - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
