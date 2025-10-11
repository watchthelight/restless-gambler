import { getActiveDebt, hasDelinquent, getOutstandingPrincipal } from "./store.js";
import { getBalance } from "../economy/wallet.js";
import { computeMaxLoanAllowed } from "./limits.js";

export function maxByCredit(c: number) {
  if (c >= 90) return 100_000;
  if (c >= 75) return 25_000;
  if (c >= 60) return 10_000;
  if (c >= 45) return 5_000;
  if (c >= 30) return 2_000;
  return 500;
}

export async function underwrite(guildId: string, userId: string, amount: number, credit: number) {
  const reasons: string[] = [];
  if (amount < 50 || amount > 1_000_000) reasons.push("amount out of allowed bounds");
  if (credit < 20) reasons.push("credit too low");
  const cap = maxByCredit(credit);
  if (amount > cap) reasons.push(`requested amount exceeds your credit limit (${cap.toLocaleString()})`);
  const debt = getActiveDebt(guildId, userId);
  const walletBig = getBalance(guildId, userId);
  const wallet = Number(walletBig);
  // Balance-aware limit against outstanding principal headroom
  const outstanding = getOutstandingPrincipal(guildId, userId);
  const maxNow = computeMaxLoanAllowed({ balance: wallet, credit, outstandingDebt: outstanding });
  if (amount > maxNow) {
    reasons.push(`requested amount exceeds your current limit (${maxNow.toLocaleString()})`);
    if (outstanding > 0) reasons.push(`outstanding debt reduces your limit (${outstanding.toLocaleString()} owed)`);
  }
  if (debt + amount > Math.max(2000, wallet * 5)) reasons.push("excessive outstanding debt vs wallet");
  if (hasDelinquent(guildId, userId)) reasons.push("delinquent loan on file");
  return { approved: reasons.length === 0, reasons, caps: { cap, debt, wallet, maxNow, outstanding } };
}
