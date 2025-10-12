/**
 * XP Display Line Formatter
 * Formats XP grant information for display in game result cards
 */

import type { XpGrant } from "../rank/xp.js";

/**
 * Format XP grant into a compact display line
 *
 * Examples:
 *   +72 XP (buff +1.5%)
 *   +12 XP
 *   +24 XP (Level ↑ 7)
 *   +50 XP (buff +1.5%) (Level ↑ 10)
 *
 * @param grant - XP grant information
 * @returns Formatted XP line string, or null if no XP was granted
 */
export function formatXpLine(grant: XpGrant): string | null {
  // If no XP granted, return null (caller should omit line entirely)
  if (grant.final === 0) {
    return null;
  }

  let line = `+${grant.final} XP`;

  // Add buff indicator if present
  if (grant.buffPct > 0) {
    const buffPercent = (grant.buffPct * 100).toFixed(1);
    line += ` (buff +${buffPercent}%)`;
  }

  // Add level-up indicator if present
  if (grant.newLevel !== undefined) {
    line += ` (Level ↑ ${grant.newLevel})`;
  }

  return line;
}

/**
 * Format XP line with money delta for embedding in game cards
 *
 * Examples:
 *   +3.50k 🪙 • +72 XP (buff +1.5%)
 *   −1.00k 🪙 • +12 XP
 *   ±0 🪙 • +8 XP
 *
 * @param moneyDelta - Money change (can be positive, negative, or zero)
 * @param grant - XP grant information
 * @param formatMoney - Function to format money amount
 * @returns Formatted combined line
 */
export function formatMoneyXpLine(
  moneyDelta: number | bigint,
  grant: XpGrant,
  formatMoney: (amount: number | bigint) => string
): string {
  const delta = typeof moneyDelta === 'bigint' ? Number(moneyDelta) : moneyDelta;

  // Format money part
  let moneyPart: string;
  if (delta > 0) {
    moneyPart = `+${formatMoney(Math.abs(delta))} 🪙`;
  } else if (delta < 0) {
    moneyPart = `−${formatMoney(Math.abs(delta))} 🪙`;
  } else {
    moneyPart = `±0 🪙`;
  }

  // Format XP part
  const xpLine = formatXpLine(grant);

  // If no XP, just return money part
  if (!xpLine) {
    return moneyPart;
  }

  // Combine with bullet separator
  return `${moneyPart} • ${xpLine}`;
}
