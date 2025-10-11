import { getGuildDb } from '../../db/connection.js';
import { getScore, setScore, bumpOnTime, penalizeLate, resetScore } from '../credit.js';
import { Loan } from '../types.js';

describe('credit score', () => {
  const gid = 'guild-credit-tests';
  const uid = 'user-x';
  beforeAll(() => {
    const db = getGuildDb(gid);
    db.exec(`CREATE TABLE IF NOT EXISTS credit_scores(user_id TEXT PRIMARY KEY, score INTEGER NOT NULL, updated_at INTEGER NOT NULL);`);
  });

  test('default baseline is 50', () => {
    const s = getScore(gid, 'unknown');
    expect(s).toBe(50);
  });

  test('bump and penalize clamp 0-100', () => {
    setScore(gid, uid, 95);
    const loan: Loan = { id: 'L', user_id: uid, principal: 5000n, apr_bps: 1000, term_days: 7, start_ts: Date.now(), due_ts: Date.now()+86400000, accrued_interest: 0n, paid_principal: 0n, paid_interest: 0n, status: 'active', last_accrual_ts: Date.now(), created_at: Date.now() };
    const up = bumpOnTime(gid, loan);
    expect(up).toBeLessThanOrEqual(100);
    const down = penalizeLate(gid, { ...loan, status: 'defaulted' });
    expect(down).toBeGreaterThanOrEqual(0);
  });

  test('reset score sets to 50', () => {
    setScore(gid, uid, 10);
    const s = resetScore(gid, uid);
    expect(s).toBe(50);
  });
});

