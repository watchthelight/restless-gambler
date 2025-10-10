import { getGuildDb } from '../db/connection.js';

export function topForGuild(guildId: string, limit = 10): { user_id: string; balance: number }[] {
  const db = getGuildDb(guildId);
  return db
    .prepare('SELECT user_id, balance FROM balances ORDER BY balance DESC LIMIT ?')
    .all(limit) as { user_id: string; balance: number }[];
}
