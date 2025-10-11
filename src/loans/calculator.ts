import { Loan, LoanOffer, LoanStatus } from './types.js';

const DAY_MS = 86_400_000;

export function dailyRateFromAprBps(aprBps: number): number {
  // APR in basis points → daily fractional rate
  return aprBps / 10000 / 365;
}

function interestForDays(principalRemaining: bigint, aprBps: number, days: number): bigint {
  if (days <= 0) return 0n;
  // floor(principalRemaining * aprBps/10000/365 * days)
  const p = principalRemaining < 0n ? 0n : principalRemaining;
  const num = BigInt(aprBps) * BigInt(days) * p;
  const den = 10000n * 365n;
  return num / den;
}

export function status(loan: Loan, now: number = Date.now()): LoanStatus {
  if (loan.status === 'forgiven' || loan.status === 'paid') return loan.status;
  const remaining = (loan.principal - loan.paid_principal) + (loan.accrued_interest - loan.paid_interest);
  if (remaining <= 0n) return 'paid';
  if (now > loan.due_ts) {
    const daysPast = Math.floor((now - loan.due_ts) / DAY_MS);
    if (daysPast > loan.term_days * 2) return 'defaulted';
    return 'late';
  }
  return 'active';
}

export function accrueInterest(loan: Loan, now: number = Date.now()): { interestDelta: bigint; updates: Partial<Loan> } {
  const last = loan.last_accrual_ts || loan.start_ts;
  const days = Math.floor((now - last) / DAY_MS);
  if (days <= 0) return { interestDelta: 0n, updates: {} };

  const remPrincipal = loan.principal - loan.paid_principal;
  let aprBps = loan.apr_bps;
  // Late/default penalty: add +25 bps per day late (capped at +2500 bps)
  const lateDays = now > loan.due_ts ? Math.floor((now - loan.due_ts) / DAY_MS) : 0;
  if (lateDays > 0) {
    const penalty = Math.min(2500, lateDays * 25);
    aprBps += penalty;
  }

  const delta = interestForDays(remPrincipal, aprBps, days);
  const nextAccrued = loan.accrued_interest + delta;
  const s = status(loan, now);
  const updates: Partial<Loan> = {
    accrued_interest: nextAccrued,
    last_accrual_ts: last + days * DAY_MS,
    status: s,
  };
  return { interestDelta: delta, updates };
}

export function pay(loan: Loan, amount: number | bigint): { paidInterest: bigint; paidPrincipal: bigint; remaining: bigint } {
  const amt = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(amount));
  if (amt <= 0n) return { paidInterest: 0n, paidPrincipal: 0n, remaining: (loan.principal - loan.paid_principal) + (loan.accrued_interest - loan.paid_interest) };

  const owedInterest = loan.accrued_interest - loan.paid_interest;
  const towardInterest = amt >= owedInterest ? owedInterest : amt;
  const remAfterInterest = amt - towardInterest;

  const owedPrincipal = loan.principal - loan.paid_principal;
  const towardPrincipal = remAfterInterest >= owedPrincipal ? owedPrincipal : remAfterInterest;

  const newPaidInterest = loan.paid_interest + towardInterest;
  const newPaidPrincipal = loan.paid_principal + towardPrincipal;
  const remaining = (loan.principal - newPaidPrincipal) + (loan.accrued_interest - newPaidInterest);
  return { paidInterest: towardInterest, paidPrincipal: towardPrincipal, remaining };
}

export function schedule(amounts: number[], userScore: number): LoanOffer[] {
  const score = Math.max(0, Math.min(100, Math.floor(userScore)));
  // Tuning buckets
  let aprMin = 700, aprMax = 1200, tMin = 10, tMax = 14, cap = Infinity;
  if (score >= 85) { aprMin = 700; aprMax = 1000; tMin = 10; tMax = 14; cap = Infinity; }
  else if (score >= 70) { aprMin = 1100; aprMax = 1600; tMin = 7; tMax = 12; cap = Infinity; }
  else if (score >= 50) { aprMin = 1700; aprMax = 2400; tMin = 5; tMax = 10; cap = 5000; }
  else { aprMin = 2500; aprMax = 3500; tMin = 3; tMax = 7; cap = score < 30 ? 1000 : 2000; }

  const picks = amounts
    .filter(a => a > 0 && a <= cap)
    .slice(0, 5);
  const offers: LoanOffer[] = picks.map((amt, idx) => {
    const t = tMin + Math.floor((idx / Math.max(1, picks.length - 1)) * (tMax - tMin));
    const apr = aprMin + Math.floor((idx / Math.max(1, picks.length - 1)) * (aprMax - aprMin));
    return { principal: amt, aprBps: apr, termDays: t };
  });
  return offers.length ? offers : [{ principal: Math.min(100, cap), aprBps: aprMax, termDays: tMin }];
}

