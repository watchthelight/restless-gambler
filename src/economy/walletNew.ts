/**
 * Wallet system with HugeDecimal support
 * All balance operations now use exact arbitrary-precision arithmetic
 */

import { getGuildDb } from '../db/connection.js';
import { userLocks } from '../util/locks.js';
import { HugeDecimal } from '../lib/num/index.js';

/**
 * Get user's balance as HugeDecimal
 */
export function getBalance(guildId: string, userId: string): HugeDecimal {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as { balance?: string } | undefined;

  if (!row || !row.balance) {
    return HugeDecimal.ZERO;
  }

  try {
    return HugeDecimal.fromDbString(row.balance);
  } catch (e: any) {
    console.error('Failed to parse balance:', { userId, balance: row.balance, error: e.message });
    return HugeDecimal.ZERO;
  }
}

/**
 * Get balance as bigint (for legacy code compatibility)
 */
export function getBalanceBigInt(guildId: string, userId: string): bigint {
  return getBalance(guildId, userId).toBigInt();
}

/**
 * Adjust user's balance (exact arithmetic)
 * @param delta - Amount to add/subtract (HugeDecimal, bigint, or number)
 * @returns New balance as HugeDecimal
 */
export async function adjustBalance(
  guildId: string,
  userId: string,
  delta: HugeDecimal | bigint | number,
  reason: string,
): Promise<HugeDecimal> {
  return userLocks.runExclusive(`wallet:${guildId}:${userId}`, async () => {
    const now = Date.now();
    const db = getGuildDb(guildId);

    const txn = db.transaction(() => {
      // Get current balance
      const current = getBalance(guildId, userId);

      // Convert delta to HugeDecimal
      let deltaHuge: HugeDecimal;
      if (delta instanceof HugeDecimal) {
        deltaHuge = delta;
      } else if (typeof delta === 'bigint') {
        deltaHuge = HugeDecimal.fromBigInt(delta);
      } else if (typeof delta === 'number') {
        deltaHuge = HugeDecimal.fromNumber(delta);
      } else {
        throw new Error('Invalid delta type');
      }

      // Calculate new balance
      const next = current.add(deltaHuge);

      // Check for negative balance
      if (next.isNegative()) {
        throw new Error('Insufficient balance');
      }

      // Store as JSON string
      const balanceStr = next.toDbString();

      db.prepare(
        'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at'
      ).run(userId, balanceStr, now);

      // Record transaction (store as Number for now, but we'll migrate this later)
      const deltaNum = deltaHuge.toNumber();
      db.prepare(
        'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'
      ).run(userId, deltaNum, reason, now);

      return next;
    });

    return txn() as HugeDecimal;
  });
}

/**
 * Adjust balance and return as bigint (legacy compatibility)
 */
export async function adjustBalanceBigInt(
  guildId: string,
  userId: string,
  delta: HugeDecimal | bigint | number,
  reason: string,
): Promise<bigint> {
  const result = await adjustBalance(guildId, userId, delta, reason);
  return result.toBigInt();
}

/**
 * Set balance directly (admin function)
 */
export async function setBalance(
  guildId: string,
  userId: string,
  amount: HugeDecimal | bigint | number,
): Promise<HugeDecimal> {
  return userLocks.runExclusive(`wallet:${guildId}:${userId}`, async () => {
    const now = Date.now();
    const db = getGuildDb(guildId);

    let amountHuge: HugeDecimal;
    if (amount instanceof HugeDecimal) {
      amountHuge = amount;
    } else if (typeof amount === 'bigint') {
      amountHuge = HugeDecimal.fromBigInt(amount);
    } else if (typeof amount === 'number') {
      amountHuge = HugeDecimal.fromNumber(amount);
    } else {
      throw new Error('Invalid amount type');
    }

    if (amountHuge.isNegative()) {
      throw new Error('Balance cannot be negative');
    }

    const balanceStr = amountHuge.toDbString();

    db.prepare(
      'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at'
    ).run(userId, balanceStr, now);

    return amountHuge;
  });
}

/**
 * Transfer between users (exact arithmetic)
 */
export async function transfer(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: HugeDecimal | bigint | number,
): Promise<{ from: HugeDecimal; to: HugeDecimal }> {
  let amountHuge: HugeDecimal;
  if (amount instanceof HugeDecimal) {
    amountHuge = amount;
  } else if (typeof amount === 'bigint') {
    amountHuge = HugeDecimal.fromBigInt(amount);
  } else if (typeof amount === 'number') {
    amountHuge = HugeDecimal.fromNumber(amount);
  } else {
    throw new Error('Invalid amount type');
  }

  if (!amountHuge.isPositive()) {
    throw new Error('Amount must be positive');
  }

  // Order locks deterministically to avoid deadlocks
  const [a, b] = [`${guildId}:${fromUserId}`, `${guildId}:${toUserId}`].sort();

  return userLocks.runExclusive(`wallet:${a}`, async () => {
    return await userLocks.runExclusive(`wallet:${b}`, async () => {
      const db = getGuildDb(guildId);
      const now = Date.now();

      const txn = db.transaction(() => {
        const fromBalance = getBalance(guildId, fromUserId);
        if (fromBalance.lt(amountHuge)) {
          throw new Error('Insufficient balance');
        }

        const toBalance = getBalance(guildId, toUserId);

        const newFrom = fromBalance.sub(amountHuge);
        const newTo = toBalance.add(amountHuge);

        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at'
        ).run(fromUserId, newFrom.toDbString(), now);

        db.prepare(
          'INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at'
        ).run(toUserId, newTo.toDbString(), now);

        const amountNum = amountHuge.toNumber();
        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'
        ).run(fromUserId, -amountNum, 'transfer:out', now);

        db.prepare(
          'INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?, ?, ?, ?)'
        ).run(toUserId, amountNum, 'transfer:in', now);

        return { from: newFrom, to: newTo };
      });

      return txn() as { from: HugeDecimal; to: HugeDecimal };
    });
  });
}

/**
 * Check if user has sufficient balance
 */
export function hasSufficientBalance(
  guildId: string,
  userId: string,
  amount: HugeDecimal | bigint | number
): boolean {
  const balance = getBalance(guildId, userId);

  let amountHuge: HugeDecimal;
  if (amount instanceof HugeDecimal) {
    amountHuge = amount;
  } else if (typeof amount === 'bigint') {
    amountHuge = HugeDecimal.fromBigInt(amount);
  } else if (typeof amount === 'number') {
    amountHuge = HugeDecimal.fromNumber(amount);
  } else {
    return false;
  }

  return balance.gte(amountHuge);
}
