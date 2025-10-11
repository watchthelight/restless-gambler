import { getGuildDb } from '../db/connection.js';
import { userLocks } from '../util/locks.js';

export function getBalance(guildId: string, userId: string): bigint {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as { balance?: number | string | bigint } | undefined;
  if (!row || row.balance == null) return 0n;
  // Coerce to bigint safely
  const b = typeof row.balance === 'bigint' ? row.balance
    : typeof row.balance === 'number' ? BigInt(Math.trunc(row.balance))
      : BigInt(parseInt(row.balance as string) || 0);
  return b;
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
      const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as
        | { balance: number }
        | undefined;
      const current = getBalance(guildId, userId);
      const inc = typeof delta === 'bigint' ? delta : BigInt(Math.trunc(delta));
      const next = current + inc;
      if (next < 0n) {
        throw new Error('Insufficient balance');
      }
      db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at').run(
        userId,
        Number(next),
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
  const amt = typeof amount === 'bigint' ? amount : BigInt(Math.trunc(amount));
  if (amt <= 0n) throw new Error('Amount must be positive');
  // Order locks deterministically to avoid deadlocks
  const [a, b] = [`${guildId}:${fromUserId}`, `${guildId}:${toUserId}`].sort();
  return userLocks.runExclusive(`wallet:${a}`, () =>
    userLocks.runExclusive(`wallet:${b}`, () => {
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
        ).run(fromUserId, Number(newFrom), now);
        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at',
        ).run(toUserId, Number(newTo), now);
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
        ).run(fromUserId, Number(-amt), 'transfer:out', now);
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
        ).run(toUserId, Number(amt), 'transfer:in', now);
        return { from: newFrom, to: newTo };
      });
      return txn() as unknown as { from: bigint; to: bigint };
    }),
  );
}
