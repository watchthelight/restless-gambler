import { getGuildDb } from '../../src/db/connection.js';
import { getScore } from '../../src/loans/credit.js';
import { schedule } from '../../src/loans/calculator.js';
import { getBalance } from '../../src/economy/wallet.js';
import { runLoanApply } from './helpers.js';

describe('loan apply integration', () => {
  const gid = 'guild-loan-apply';
  const uid = 'user-loan-apply';

  beforeAll(() => {
    // Touch DB to ensure migrations run and schema exists
    getGuildDb(gid);
  });

  test('loan apply issues loan and credits wallet', async () => {
    const before = getBalance(gid, uid);
    const score = getScore(gid, uid);
    const offer = schedule([500], score)[0];
    const res = await runLoanApply(gid, uid, offer.principal, offer.aprBps, offer.termDays);
    expect(res.ok).toBe(true);
    const after = getBalance(gid, uid);
    expect(after - before).toBeGreaterThanOrEqual(BigInt(offer.principal));
  }, 15000);
});
