import { getGuildDb } from '../../src/db/connection.js';
import { adjustBalance, getBalance } from '../../src/economy/wallet.js';
import { jsonStringifySafeBigint } from '../../src/utils/json.js';
import { toBigInt } from '../../src/utils/bigint.js';

describe('BigInt mixing and storage as TEXT', () => {
  const gid = 'bigint-mix-guild';
  const uid = 'user-big';

  it('seeds huge balance as TEXT and adjusts safely', async () => {
    const db = getGuildDb(gid);
    const huge = '999999999999999999999999999999';
    db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance, updated_at=excluded.updated_at')
      .run(uid, huge, Date.now());

    // add 25 using bigint from string
    await adjustBalance(gid, uid, toBigInt('25'), 'test:add_str');
    // add 25 using number
    await adjustBalance(gid, uid, 25, 'test:add_num');
    // add 25 using bigint
    await adjustBalance(gid, uid, 25n, 'test:add_big');

    const final = getBalance(gid, uid);
    const expected = toBigInt(huge) + 75n;
    expect(final).toBe(expected);

    const audit = { a: 1, big: final } as any;
    const s = jsonStringifySafeBigint(audit);
    expect(s).toContain(`"big":"${final.toString()}"`);
  });
});

