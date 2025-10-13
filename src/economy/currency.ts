import { formatBalance } from "../util/formatBalance.js";
import type { HugeDecimal } from "../lib/num/index.js";

export const CURRENCY_NAME = "Bolts";
export const CURRENCY_EMOJI = "🔩"; // :nut_and_bolt:
export const DECIMALS = 0;

export function formatBolts(n: number | bigint | HugeDecimal): string {
  return `${formatBalance(n)} ${CURRENCY_EMOJI}`;
}

