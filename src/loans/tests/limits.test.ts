import { computeMaxLoanAllowed } from "../limits.js";

describe('limits', () => {
  test('limit grows with balance', () => {
    const low = computeMaxLoanAllowed({ balance: 0, credit: 50, outstandingDebt: 0 });
    const mid = computeMaxLoanAllowed({ balance: 10_000, credit: 50, outstandingDebt: 0 });
    const hi = computeMaxLoanAllowed({ balance: 1_000_000, credit: 50, outstandingDebt: 0 });
    expect(mid).toBeGreaterThan(low);
    expect(hi).toBeGreaterThan(mid);
  });

  test('debt reduces limit and never below zero', () => {
    const a = computeMaxLoanAllowed({ balance: 100_000, credit: 80, outstandingDebt: 0 });
    const b = computeMaxLoanAllowed({ balance: 100_000, credit: 80, outstandingDebt: a + 999_999 });
    expect(b).toBe(0);
  });
});

