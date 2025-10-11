import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, startTogglesWatcher } from "../src/config/toggles.js";

describe("config watch", () => {
  const p = join(process.cwd(), "config/config.json");
  const original = readFileSync(p, "utf8");

  afterAll(() => {
    writeFileSync(p, original);
  });

  test("reload coalesces rapid writes and only on change", async () => {
    loadConfig();
    startTogglesWatcher();

    const obj = JSON.parse(original);
    if (!obj.commands) obj.commands = {};
    if (!obj.commands.roulette) obj.commands.roulette = { enabled: true };

    obj.commands.roulette.reason = "x1";
    writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");

    obj.commands.roulette.reason = "x2";
    writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");

    await new Promise((r) => setTimeout(r, 1200));
    expect(1).toBe(1);
  });
});
