import { formatBalance } from "../util/formatBalance.js";

export const CURRENCY_NAME = "Bolts";
export const CURRENCY_EMOJI = "🔩"; // :nut_and_bolt:
export const DECIMALS = 0;

export function formatBolts(n: number | bigint): string {
  return `${formatBalance(n)} ${CURRENCY_EMOJI}`;
}

