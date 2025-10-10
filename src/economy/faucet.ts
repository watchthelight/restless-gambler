import { getGuildDb } from '../db/connection.js';
import { adjustBalance, getBalance } from './wallet.js';
import { CURRENCY_NAME } from './currency.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function claimDaily(guildId: string, userId: string, baseAmount = 250): Promise<bigint> {
  const now = Date.now();
  const db = getGuildDb(guildId);
  const last = db
    .prepare(
      "SELECT created_at FROM transactions WHERE user_id = ? AND reason = 'daily' ORDER BY created_at DESC LIMIT 1",
    )
    .get(userId) as { created_at: number } | undefined;
  if (last && now - last.created_at < DAY_MS) {
    const remaining = DAY_MS - (now - last.created_at);
    throw new Error(`Daily already claimed. Try again in ${Math.ceil(remaining / 3600000)}h.`);
  }
  // 7-day streak bonus: +25% if prior 6 days have daily entries
  let bonus = 0;
  const claims = db
    .prepare(
      "SELECT created_at FROM transactions WHERE user_id = ? AND reason = 'daily' ORDER BY created_at DESC LIMIT 7",
    )
    .all(userId) as { created_at: number }[];
  if (claims.length >= 6) {
    const ok = claims
      .slice(0, 6)
      .every((c, idx) => now - c.created_at >= (idx + 1) * DAY_MS && now - c.created_at <= (idx + 1.5) * DAY_MS);
    if (ok) bonus = Math.floor(baseAmount * 0.25);
  }
  const amount = baseAmount + bonus;
  await adjustBalance(guildId, userId, amount, 'daily');
  try {
    const { setCooldown } = await import('./cooldowns.js');
    setCooldown(guildId, userId, 'daily', 24 * 60 * 60);
  } catch { }
  return getBalance(guildId, userId);
}

export function getGuildFaucetLimit(guildId: string | null): number {
  if (!guildId) return 100;
  const db = getGuildDb(guildId);
  const row = db
    .prepare('SELECT value FROM guild_settings WHERE key = ?')
    .get('faucet_limit') as { value: string } | undefined;
  const limit = row?.value ? parseInt(row.value, 10) : 100;
  return isNaN(limit) ? 100 : limit;
}

export async function faucet(guildId: string, userId: string, amount: number): Promise<bigint> {
  const limit = getGuildFaucetLimit(guildId);
  const grant = Math.max(1, Math.min(limit, Math.floor(amount || limit)));
  await adjustBalance(guildId, userId, grant, 'faucet');
  return getBalance(guildId, userId);
}
