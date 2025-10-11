import { getGuildDb } from '../db/connection.js';

export function topForGuild(guildId: string, limit = 10): { user_id: string; balance: number }[] {
  const db = getGuildDb(guildId);
  // balance stored as TEXT; cast for ordering/exposing as number in leaderboard
  return db
    .prepare('SELECT user_id, CAST(balance AS INTEGER) AS balance FROM balances ORDER BY CAST(balance AS INTEGER) DESC LIMIT ?')
    .all(limit) as { user_id: string; balance: number }[];
}
