import { getGuildDb } from '../db/connection.js';
import { userLocks } from '../util/locks.js';

export function getBalance(guildId: string, userId: string): number {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as
    | { balance: number }
    | undefined;
  return row?.balance ?? 0;
}

export async function adjustBalance(
  guildId: string,
  userId: string,
  delta: number,
  reason: string,
): Promise<number> {
  return userLocks.runExclusive(`wallet:${guildId}:${userId}`, async () => {
    const now = Date.now();
    const db = getGuildDb(guildId);
    const txn = db.transaction(() => {
      const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as
        | { balance: number }
        | undefined;
      const current = row?.balance ?? 0;
      const next = current + delta;
      if (next < 0) {
        throw new Error('Insufficient balance');
      }
      db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at').run(
        userId,
        next,
        now,
      );
      db.prepare(
        'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
      ).run(userId, delta, reason, now);
      return next;
    });
    return txn() as unknown as number;
  });
}

export async function transfer(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<{ fromBalance: number; toBalance: number }> {
  if (amount <= 0) throw new Error('Amount must be positive');
  // Order locks deterministically to avoid deadlocks
  const [a, b] = [`${guildId}:${fromUserId}`, `${guildId}:${toUserId}`].sort();
  return userLocks.runExclusive(`wallet:${a}`, () =>
    userLocks.runExclusive(`wallet:${b}`, () => {
      const db = getGuildDb(guildId);
      const now = Date.now();
      const txn = db.transaction(() => {
        const fromRow = db
          .prepare('SELECT balance FROM balances WHERE user_id = ?')
          .get(fromUserId) as { balance: number } | undefined;
        const fromBalance = fromRow?.balance ?? 0;
        if (fromBalance < amount) throw new Error('Insufficient balance');
        const toRow = db
          .prepare('SELECT balance FROM balances WHERE user_id = ?')
          .get(toUserId) as { balance: number } | undefined;
        const toBalance = toRow?.balance ?? 0;
        const newFrom = fromBalance - amount;
        const newTo = toBalance + amount;
        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at',
        ).run(fromUserId, newFrom, now);
        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at',
        ).run(toUserId, newTo, now);
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
        ).run(fromUserId, -amount, 'transfer:out', now);
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)',
        ).run(toUserId, amount, 'transfer:in', now);
        return { fromBalance: newFrom, toBalance: newTo };
      });
      return txn() as unknown as { fromBalance: number; toBalance: number };
    }),
  );
}
