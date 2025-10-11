import { describe, test, expect } from "@jest/globals";
import { withUserLuck } from "../src/rng/luck.js";
import { getGuildDb } from "../src/db/connection.js";
import { grantLuck } from "../src/rank/store.js";

describe("withUserLuck clamp", () => {
  const gid = `g-${Math.random().toString(36).slice(2)}`;
  const uid = `u-${Math.random().toString(36).slice(2)}`;

  test("does not reduce below 0 and bias <= max", () => {
    const db = getGuildDb(gid);
    // Set max luck to 300 bps (3%)
    try { db.prepare("INSERT INTO guild_settings(key, value, updated_at) VALUES(?,?,?)").run('luck_max_bps', '300', Date.now()); } catch {}
    // Grant a huge buff which should be clamped
    grantLuck(gid, uid, 10_000, 60);
    // Mock RNG returns small and large values
    const seq = [0.001, 0.25, 0.75, 0.999];
    for (const u of seq) {
      const biased = withUserLuck(gid, uid, () => u);
      expect(biased).toBeGreaterThanOrEqual(0);
      // Shift should be at most 0.03 (300 bps)
      expect(u - biased).toBeLessThanOrEqual(0.03 + 1e-9);
    }
  });
});

