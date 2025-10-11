import { describe, test, expect, beforeAll } from "@jest/globals";
import { getGuildDb } from "../src/db/connection.js";
import { onGambleXP } from "../src/rank/xpEngine.js";
import { getLuckBps } from "../src/rank/store.js";

describe("rank xp flow", () => {
  const gid = `test-g-${Math.random().toString(36).slice(2)}`;
  const uid = `user-${Math.random().toString(36).slice(2)}`;

  beforeAll(() => {
    // Ensure ranks enabled in guild KV
    const db = getGuildDb(gid);
    try { db.prepare("INSERT INTO guild_settings(key, value, updated_at) VALUES(?,?,?)").run('features.ranks.enabled', 'true', Date.now()); } catch {}
  });

  test("level increases and luck granted after enough bets", () => {
    // Deterministic time progression for debounce/minute cap logic
    let now = Date.now();
    const realNow = Date.now;
    // @ts-ignore
    Date.now = () => now;
    try {
      let level = 1;
      let lastLeveled = false;
      let wallet = 10_000;
      for (let i = 0; i < 20; i++) {
        const bet = 100 + i * 25;
        wallet += i; // pretend minor drift
        const res = onGambleXP(gid, uid, bet, wallet);
        level = res.level;
        lastLeveled = res.leveled || lastLeveled;
        // Advance >2s to satisfy MIN_ACTION_INTERVAL_MS
        now += 3000;
      }
      expect(level).toBeGreaterThan(1);
      // Luck should be granted on first level up
      const luck = getLuckBps(gid, uid);
      expect(luck).toBeGreaterThan(0);
      expect(lastLeveled).toBe(true);
    } finally {
      // @ts-ignore
      Date.now = realNow;
    }
  });
});

