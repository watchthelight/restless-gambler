import { getGuildDb } from '../db/connection.js';

export function getRemaining(guildId: string, userId: string, key: string): number {
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT next_at FROM cooldowns WHERE user_id = ? AND key = ?').get(userId, key) as { next_at: number } | undefined;
  const now = Date.now();
  const next = row?.next_at ?? 0;
  const leftMs = next - now;
  return leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
}

export function setCooldown(guildId: string, userId: string, key: string, secondsFromNow: number): void {
  const db = getGuildDb(guildId);
  const next = Date.now() + secondsFromNow * 1000;
  db.prepare('INSERT INTO cooldowns(user_id, key, next_at) VALUES(?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET next_at = excluded.next_at').run(
    userId,
    key,
    next,
  );
}

export function clearCooldowns(guildId: string, userId: string): void {
  const db = getGuildDb(guildId);
  db.prepare('DELETE FROM cooldowns WHERE user_id = ?').run(userId);
}

export function listCooldowns(guildId: string, userId: string): Array<{ key: string; next_at: number }> {
  const db = getGuildDb(guildId);
  return db.prepare('SELECT key, next_at FROM cooldowns WHERE user_id = ? ORDER BY key ASC').all(userId) as any[];
}

