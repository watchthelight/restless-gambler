export type LimitParams = {
  base?: number;
  balFactor?: number;
  balBoostCap?: number;
  scoreCap?: number;
  globalMax?: number;
};

/**
 * Compute the maximum additional principal we will approve now.
 * Tunables:
 * - base: flat allowance
 * - balFactor: percent of balance counted toward limit
 * - balBoostCap: cap on balance-derived boost
 * - scoreCap: max boost granted by perfect credit (scaled linearly 0..100)
 * - globalMax: hard upper ceiling per application
 */
export function computeMaxLoanAllowed(args: {
  balance: number;
  credit: number; // 0..100
  outstandingDebt: number; // unpaid principal across active/late
  params?: LimitParams;
}): number {
  const {
    base = 1_000,
    balFactor = 0.25,
    balBoostCap = 500_000,
    scoreCap = 250_000,
    globalMax = 2_000_000,
  } = args.params ?? {};
  const balBoost = Math.min(args.balance * balFactor, balBoostCap);
  const scoreBoost = Math.max(0, Math.min(100, args.credit)) / 100 * scoreCap;
  const raw = base + balBoost + scoreBoost;
  const available = Math.max(0, Math.min(globalMax, raw - (args.outstandingDebt || 0)));
  return Math.floor(available);
}

