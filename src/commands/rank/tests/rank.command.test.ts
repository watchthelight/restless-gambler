import { describe, test, expect } from "@jest/globals";
import { data as RankData } from "../../rank/index.js";
import { data as RankAdminData } from "../../rank/admin.js";
import { getGuildDb } from "../../../db/connection.js";
import { getRank, setRank, addXP, resetRank } from "../../../rank/store.js";

describe("rank commands", () => {
  test("/rank builder exposes view and leaderboard", () => {
    const json: any = (RankData as any).toJSON();
    const subNames = (json.options || []).map((o: any) => o.name);
    expect(subNames).toEqual(expect.arrayContaining(["view", "leaderboard"]));
  });

  test("/rank-admin builder exposes admin subs", () => {
    const json: any = (RankAdminData as any).toJSON();
    const subNames = (json.options || []).map((o: any) => o.name);
    expect(subNames).toEqual(expect.arrayContaining(["set-level", "add-xp", "set-xp", "reset", "decay"]));
  });

  test("admin mutations reflect in store", () => {
    const gid = `rg-${Math.random().toString(36).slice(2)}`;
    const uid = `u-${Math.random().toString(36).slice(2)}`;
    const db = getGuildDb(gid);
    // Enable ranks
    try { db.prepare("INSERT INTO guild_settings(key, value, updated_at) VALUES(?,?,?)").run('features.ranks.enabled', 'true', Date.now()); } catch {}
    // set-level
    setRank(gid, uid, 5, 0);
    expect(getRank(gid, uid).level).toBe(5);
    // add-xp
    const res = addXP(gid, uid, 1000);
    expect(getRank(gid, uid).level).toBeGreaterThanOrEqual(res.level);
    // reset
    resetRank(gid, uid);
    const r = getRank(gid, uid);
    expect(r.level).toBe(1);
    expect(r.xp).toBe(0);
  });
});

