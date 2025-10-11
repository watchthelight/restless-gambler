import { accrueInterest, pay, dailyRateFromAprBps, status } from '../calculator.js';
import { Loan } from '../types.js';

const DAY = 86_400_000;

function makeLoan(): Loan {
  const now = Date.now();
  return {
    id: 'L1', user_id: 'U1', principal: 1000n, apr_bps: 3650, term_days: 10,
    start_ts: now - DAY * 5, due_ts: now + DAY * 5, accrued_interest: 0n, paid_principal: 0n, paid_interest: 0n, status: 'active', last_accrual_ts: now - DAY * 5, created_at: now - DAY * 5,
  };
}

describe('loans calculator', () => {
  test('daily rate from bps', () => {
    const r = dailyRateFromAprBps(3650);
    expect(r).toBeCloseTo(0.001, 6);
  });

  test('accrues interest for elapsed days', () => {
    const loan = makeLoan();
    const now = loan.last_accrual_ts + DAY * 3;
    const { interestDelta, updates } = accrueInterest(loan, now);
    expect(Number(interestDelta)).toBeGreaterThan(0);
    expect(updates.last_accrual_ts).toBe(now);
  });

  test('pay splits interest first then principal', () => {
    const loan = makeLoan();
    // simulate interest accrued
    (loan as any).accrued_interest = 120n;
    const res = pay(loan, 150);
    expect(res.paidInterest).toBe(120n);
    expect(res.paidPrincipal).toBe(30n);
  });

  test('late penalties increase interest', () => {
    const loan = makeLoan();
    // Make it late by 5 days
    const now = loan.due_ts + DAY * 5;
    const { interestDelta } = accrueInterest({ ...loan, last_accrual_ts: loan.due_ts }, now);
    expect(Number(interestDelta)).toBeGreaterThan(0);
  });

  test('status transitions paid/late/defaulted', () => {
    const loan = makeLoan();
    const active = status(loan, loan.start_ts + DAY);
    expect(active).toBe('active');
    const late = status(loan, loan.due_ts + DAY);
    expect(late === 'late' || late === 'defaulted').toBeTruthy();
    const def = status({ ...loan, due_ts: loan.start_ts + DAY, term_days: 1 }, loan.start_ts + DAY * 4);
    expect(def).toBe('defaulted');
  });
});

