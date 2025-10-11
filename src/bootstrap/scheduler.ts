import type { Client } from 'discord.js';
import { cleanupExpiredBuffs } from "../rank/store.js";

export function startRankSchedulers(client: Client) {
  // Hourly cleanup of expired luck buffs
  setInterval(() => {
    for (const [gid] of client.guilds.cache) {
      try { cleanupExpiredBuffs(gid); } catch { /* noop */ }
    }
  }, 60 * 60 * 1000);
}

