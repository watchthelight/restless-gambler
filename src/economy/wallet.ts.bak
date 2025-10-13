import { getGuildDb } from '../db/connection.js';
import { userLocks } from '../util/locks.js';
import { dbToBigint, toBigInt, bigintToDb } from '../utils/bigint.js';

export function getBalance(guildId: string, userId: string): bigint {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as { balance?: number | string | bigint } | undefined;
  if (!row || row.balance == null) return 0n;
  return dbToBigint(row.balance);
}

export async function adjustBalance(
  guildId: string,
  userId: string,
  delta: number | bigint,
  reason: string,
): Promise<bigint> {
  return userLocks.runExclusive(`wallet:${guildId}:${userId}`, async () => {
    const now = Date.now();
    const db = getGuildDb(guildId);
    const txn = db.transaction(() => {
      const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as { balance?: number | string | bigint } | undefined;
      const current = row?.balance != null ? dbToBigint(row.balance) : 0n;
      const inc = toBigInt(delta);
      const next = current + inc;
      if (next < 0n) {
        throw new Error('Insufficient balance');
      }
      db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at').run(
        userId,
        bigintToDb(next),
        now,
      );
      db.prepare(
        'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
      ).run(userId, Number(inc), reason, now);
      return next;
    });
    return txn() as unknown as bigint;
  });
}

export async function transfer(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number | bigint,
): Promise<{ from: bigint; to: bigint }> {
  const amt = toBigInt(amount);
  if (amt <= 0n) throw new Error('Amount must be positive');
  // Order locks deterministically to avoid deadlocks
  const [a, b] = [`${guildId}:${fromUserId}`, `${guildId}:${toUserId}`].sort();
  return userLocks.runExclusive(`wallet:${a}`, async () => {
    return await userLocks.runExclusive(`wallet:${b}`, async () => {
      const db = getGuildDb(guildId);
      const now = Date.now();
      const txn = db.transaction(() => {
        const from = getBalance(guildId, fromUserId);
        if (from < amt) throw new Error('Insufficient balance');
        const to = getBalance(guildId, toUserId);

        const newFrom = from - amt;
        const newTo = to + amt;
        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at',
        ).run(fromUserId, bigintToDb(newFrom), now);
        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at',
        ).run(toUserId, bigintToDb(newTo), now);
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
        ).run(fromUserId, Number(-amt), 'transfer:out', now);
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
        ).run(toUserId, Number(amt), 'transfer:in', now);
        return { from: newFrom, to: newTo };
      });
      return txn() as unknown as { from: bigint; to: bigint };
    });
  });
}
