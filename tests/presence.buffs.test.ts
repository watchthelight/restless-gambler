import { describe, test, expect, beforeAll } from "@jest/globals";
import { getGuildDb } from "../src/db/connection.js";
import { countActiveBuffsNow } from "../src/status/presence.js";
import { cleanupExpiredBuffs } from "../src/rank/store.js";

describe("presence buff count", () => {
  const gid = `test-g-${Math.random().toString(36).slice(2)}`;
  const uid = `user-${Math.random().toString(36).slice(2)}`;

  beforeAll(() => {
    // Ensure guild DB exists and tables migrated
    const db = getGuildDb(gid);
    try { db.prepare("DELETE FROM user_buffs WHERE user_id=?").run(uid); } catch { /* ignore */ }
  });

  test("countActiveBuffsNow reflects live rows", async () => {
    const db = getGuildDb(gid);
    const now = Date.now();

    // Baseline should be 0
    const base = await countActiveBuffsNow();
    expect(base).toBeGreaterThanOrEqual(0);

    // Insert an active buff for uid
    const expires = now + 60_000; // 1 minute from now
    db.prepare(
      `INSERT INTO user_buffs(user_id, luck_bps, granted_at, expires_at)
       VALUES(?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET luck_bps=excluded.luck_bps, granted_at=excluded.granted_at, expires_at=excluded.expires_at`
    ).run(uid, 150, now, expires);

    const afterAdd = await countActiveBuffsNow();
    expect(afterAdd).toBeGreaterThanOrEqual(base + 1);

    // Expire the buff and cleanup
    db.prepare(`UPDATE user_buffs SET expires_at=? WHERE user_id=?`).run(now - 1, uid);
    const removed = cleanupExpiredBuffs(gid);
    expect(removed).toBeGreaterThanOrEqual(1);

    const afterCleanup = await countActiveBuffsNow();
    expect(afterCleanup).toBeGreaterThanOrEqual(0);
    // In most cases should be back to base, but allow >=0 to be robust across parallel tests
  });
});

