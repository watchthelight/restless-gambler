import type { Client } from 'discord.js';
import { cleanupExpiredBuffs } from "../rank/store.js";
import { refreshPresence } from "../status/presence.js";

export function startRankSchedulers(client: Client) {
  // Cleanup expired buffs every 5 minutes; refresh presence only if changes.
  setInterval(() => {
    let removedTotal = 0;
    for (const [gid] of client.guilds.cache) {
      try { removedTotal += cleanupExpiredBuffs(gid) | 0; } catch { /* noop */ }
    }
    if (removedTotal > 0) {
      try { refreshPresence(client); } catch { /* ignore */ }
    }
  }, 5 * 60 * 1000);
}
