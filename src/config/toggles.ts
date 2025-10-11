import fs from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { createHash } from "node:crypto";
import { allCommandNamesIncludingDisabled } from "../registry/util-builders.js";

type CommandToggle = { enabled: boolean; reason?: string };
type Config = { commands?: Record<string, CommandToggle> };

const file = path.resolve(process.cwd(), "config", "config.json");
let cfg: Config = { commands: {} };
let mtime = 0;
let lastHash = "";
let lastLogAt = 0;
let watcher: chokidar.FSWatcher | null = (globalThis as any).__cfgWatcher ?? null;

function debounce<T extends (...args: any[]) => any>(fn: T, ms = 750) {
  let t: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function sha1(s: string) {
  return createHash("sha1").update(s).digest("hex");
}

function stripComments(jsonText: string): string {
  // Allow // and /* */ comments in config.json for convenience
  return jsonText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function load() {
  try {
    // Ensure directory exists
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch {}

    const existed = fs.existsSync(file);
    const raw = existed ? (fs.readFileSync(file, "utf8") || "{}") : "{}";
    const text = stripComments(raw);

    const incoming = JSON.parse(text || "{}") as Config;
    if (!incoming.commands) incoming.commands = {};

    // Safety: ensure all commands exist in config (default enabled)
    const names = allCommandNamesIncludingDisabled();
    let added = 0;
    for (const n of names) {
      if (!incoming.commands![n]) {
        incoming.commands![n] = { enabled: true };
        added++;
      }
    }

    if (added || !existed) {
      cfg = incoming;
      const out = JSON.stringify(cfg, null, 2) + "\n";
      fs.writeFileSync(file, out, "utf8");
      lastHash = sha1(out);
      try { mtime = fs.statSync(file).mtimeMs; } catch { mtime = 0; }
      console.info({ msg: existed ? "toggles_autofilled_on_start" : "toggles_created_on_start", added, file });
    } else {
      const newHash = sha1(JSON.stringify(incoming));
      if (newHash === lastHash) return;
      cfg = incoming;
      lastHash = newHash;
      try { mtime = fs.statSync(file).mtimeMs; } catch { mtime = 0; }
      const now = Date.now();
      if (now - lastLogAt > 30_000) {
        lastLogAt = now;
        console.info({ msg: "config_reloaded", file, commands: Object.keys(cfg.commands!).length });
      }
    }
  } catch (e) {
    console.warn({ msg: "config_reload_failed", file, err: String(e) });
  }
}

function startWatcher() {
  if (watcher) return;
  watcher = chokidar.watch(file, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 100 },
    atomic: true,
    persistent: false,
  });
  const reloadDebounced = debounce(load, 750);
  watcher.on("add", reloadDebounced);
  watcher.on("change", reloadDebounced);
  (globalThis as any).__cfgWatcher = watcher;
}
export function startTogglesWatcher() {
  startWatcher();
}

export function isEnabled(name: string): boolean {
  load();
  const entry = cfg.commands?.[name];
  if (!entry) return true; // default on
  return entry.enabled !== false;
}

export function loadConfig(): { commands: Record<string, CommandToggle> } {
  load();
  return { commands: cfg.commands ?? {} };
}

export function reason(name: string): string | undefined {
  load();
  return cfg.commands?.[name]?.reason;
}

export function listToggles(): Array<{ name: string; enabled: boolean; reason?: string }> {
  load();
  const map = cfg.commands ?? {};
  return Object.keys(map)
    .sort()
    .map((k) => ({ name: k, enabled: map[k].enabled !== false, reason: map[k].reason }));
}

export function setToggle(name: string, enabled: boolean, why?: string) {
  load();
  if (!cfg.commands) cfg.commands = {};
  cfg.commands[name] = { enabled, ...(why ? { reason: why } : {}) };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch {}
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  mtime = 0; // force immediate read-back
  load();
}
