import type { Client } from 'discord.js';
import { ActivityType } from 'discord.js';
import type Database from 'better-sqlite3';
import { forEachOpenGuildDb } from '../db/connection.js';
import { countGames, countLinesOfCode, countCommands } from '../metrics/project.js';

/**
 * Count all active buffs across all opened guild databases right now.
 * Uses the per-guild table `user_buffs` with numeric epoch milliseconds.
 */
export async function countActiveBuffsNow(): Promise<number> {
  const now = Date.now();
  let total = 0;
  await forEachOpenGuildDb(async (db: Database.Database) => {
    try {
      const row = db.prepare(
        `SELECT COUNT(*) AS c FROM user_buffs WHERE expires_at > ?`
      ).get(now) as { c: number } | undefined;
      if (row && typeof row.c === 'number') total += row.c;
      else if (row && (row as any).c != null) total += Number((row as any).c);
    } catch { /* ignore per-guild errors */ }
  });
  return total;
}

/**
 * Recompute and set the bot presence, including live buff count.
 */
export async function refreshPresence(client: Client): Promise<void> {
  try {
    const games = countGames();
    const cmds = countCommands();
    const loc = countLinesOfCode();
    const buffs = await countActiveBuffsNow();

    const text = `Playing ${games} game${games === 1 ? '' : 's'}, ` +
      `${cmds} command${cmds === 1 ? '' : 's'}, across ${loc.toLocaleString()} lines of code • ` +
      `${buffs} buff${buffs === 1 ? '' : 's'} active`;

    await client.user?.setPresence({
      activities: [{ name: text, type: ActivityType.Playing }],
      status: 'online',
    });
  } catch { /* ignore presence errors */ }
}

