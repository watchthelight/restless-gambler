import fs from "node:fs";
import path from "node:path";
const { allCommandNamesIncludingDisabled } = await import("../src/registry/util-builders.js");

const CFG_DIR = path.resolve("config");
const CFG_FILE = path.join(CFG_DIR, "config.json");

type Config = { commands: Record<string, { enabled: boolean; reason?: string }> };

function read(): Config {
  if (!fs.existsSync(CFG_DIR)) fs.mkdirSync(CFG_DIR, { recursive: true });
  if (!fs.existsSync(CFG_FILE)) return { commands: {} };
  return JSON.parse(fs.readFileSync(CFG_FILE, "utf8"));
}
function write(cfg: Config) {
  fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

const cfg = read();
cfg.commands ||= {} as any;
let added = 0;

for (const name of allCommandNamesIncludingDisabled()) {
  if (!cfg.commands[name]) {
    cfg.commands[name] = { enabled: true };
    added++;
  }
}

if (added) write(cfg);
console.info(JSON.stringify({ msg: added ? "toggles_seeded" : "toggles_up_to_date", added, file: CFG_FILE }));

