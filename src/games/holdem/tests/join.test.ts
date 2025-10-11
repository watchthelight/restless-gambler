import { jest } from '@jest/globals';
import { createTableInChannel, joinTable, leaveAnyTable } from '../store.js';
import { adjustBalance, getBalance } from '../../../economy/wallet.js';

describe('holdem join/leave', () => {
  test('user can join within min/max and cash out', async () => {
    const guildId = 'test_guild_1';
    const uid = 'u_test_1';
    await adjustBalance(guildId, uid, 10_000, 'seed');
    const t = createTableInChannel(guildId, 'chanA', { small_blind: 5, big_blind: 10 });
    const buyin = typeof t.min_buyin === 'bigint' ? Number(t.min_buyin) : t.min_buyin; // default 20*bb
    const before = getBalance(guildId, uid);
    const { seat, stack } = await joinTable(guildId, t.id, uid, buyin);
    expect(seat).toBe(1);
    expect(stack).toBe(buyin);
    const after = getBalance(guildId, uid);
    expect(after).toBe(before - BigInt(buyin));
    const left = await leaveAnyTable(guildId, uid);
    // stack may be bigint from db.defaultSafeIntegers
    expect(left?.stack).toBe(typeof t.min_buyin === 'bigint' ? t.min_buyin : buyin);
  });
});
