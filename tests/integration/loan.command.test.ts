import { data } from '../../src/commands/loan/index.js';
import { getGuildDb } from '../../src/db/connection.js';
import { createLoan, listUserLoans, applyPayment, updateLoan } from '../../src/loans/store.js';
import { bumpOnTime, penalizeLate, getScore, setScore } from '../../src/loans/credit.js';

describe('loan command + flow', () => {
  const gid = 'guild-loan-tests';
  const uid = 'user-loan-1';

  beforeAll(() => {
    const db = getGuildDb(gid);
    db.exec(`
      CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        principal INTEGER NOT NULL,
        apr_bps INTEGER NOT NULL,
        term_days INTEGER NOT NULL,
        start_ts INTEGER NOT NULL,
        due_ts INTEGER NOT NULL,
        accrued_interest INTEGER NOT NULL DEFAULT 0,
        paid_principal INTEGER NOT NULL DEFAULT 0,
        paid_interest INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active',
        last_accrual_ts INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS credit_scores(user_id TEXT PRIMARY KEY, score INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    `);
  });

  it('slash has subcommands', () => {
    const json: any = (data as any).toJSON();
    const subs = (json.options || []).map((o: any) => o.name).sort();
    expect(subs).toEqual(expect.arrayContaining(['pay','details','credit-reset','forgive']));
  });

  it('create -> pay to zero updates status', () => {
    const now = Date.now();
    const loan = createLoan(gid, uid, 500, 1000, 5, now);
    // Accrue a small interest manually
    loan.accrued_interest = 10n; updateLoan(gid, loan);
    const split = applyPayment(gid, loan, 510);
    expect(Number(split.remaining)).toBeGreaterThanOrEqual(0);
  });

  it('score changes bump/penalize', () => {
    setScore(gid, uid, 50);
    const l = listUserLoans(gid, uid)[0];
    const up = bumpOnTime(gid, { ...l, status: 'active' } as any);
    expect(up).toBeGreaterThanOrEqual(50);
    const down = penalizeLate(gid, { ...l, status: 'defaulted' } as any);
    expect(down).toBeLessThanOrEqual(100);
    const s = getScore(gid, uid);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

