export type LoanOffer = { principal: number; termDays: number; aprBps: number; dueTs: number };

export function offersForAmount(amount: number, credit: number, now = Date.now()): LoanOffer[] {
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
  const terms = [7, 14, 30];
  return terms.map((termDays) => {
    const base = 900;
    const termAdj = (termDays / 30) * 700;
    const creditAdj = Math.max(0, (70 - credit)) * 20;
    const aprBps = clamp(Math.round(base + termAdj + creditAdj), 600, 3200);
    return { principal: amount, termDays, aprBps, dueTs: now + termDays * 86_400_000 };
  });
}

