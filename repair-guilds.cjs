const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dir = "data/guilds";
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith(".db")) continue;
  const p = path.join(dir, file);
  const db = new Database(p);
  try {
    db.pragma("journal_mode = WAL");
    db.transaction(() => {
      // 0) Drop broken views referencing missing tables
      db.prepare("DROP VIEW IF EXISTS v_guild_settings").run();
      try { db.prepare("DROP VIEW IF EXISTS guild_settings").run(); } catch {}

      // 1) Ensure real KV table exists for settings
      db.prepare("CREATE TABLE IF NOT EXISTS guild_settings (key TEXT PRIMARY KEY, value TEXT)").run();

      // If there's a legacy column-based table (edge case), migrate its single row to KV
      const cols = db.prepare("PRAGMA table_info(guild_settings)").all();
      const names = cols.map(c => c.name.toLowerCase());
      const isKV = names.length === 2 && names.includes("key") && names.includes("value");
      if (!isKV) {
        db.prepare("CREATE TABLE IF NOT EXISTS guild_settings_kv (key TEXT PRIMARY KEY, value TEXT)").run();
        let row = {};
        try { row = db.prepare("SELECT * FROM guild_settings LIMIT 1").get() || {}; } catch {}
        for (const [k, v] of Object.entries(row)) {
          const skip = ["id","created_at","updated_at"].includes(k.toLowerCase());
          if (!skip && v !== null && v !== undefined) {
            db.prepare("INSERT OR REPLACE INTO guild_settings_kv (key,value) VALUES (?,?)").run(k, String(v));
          }
        }
        try { db.prepare("DROP TABLE guild_settings").run(); } catch {}
        db.prepare("ALTER TABLE guild_settings_kv RENAME TO guild_settings").run();
      }

      // 2) Blackjack sessions: ensure table/columns exist
      const hasBJ = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blackjack_sessions'").get();
      if (!hasBJ) {
        const sql = [
          "CREATE TABLE blackjack_sessions (",
          "  id INTEGER PRIMARY KEY,",
          "  user_id TEXT NOT NULL,",
          "  guild_id TEXT NOT NULL,",
          "  state_json TEXT,",
          "  status TEXT DEFAULT 'active',",
          "  created_at INTEGER DEFAULT (strftime('%s','now'))",
          ")"
        ].join("\n");
        db.prepare(sql).run();
      } else {
        const bjCols = db.prepare("PRAGMA table_info(blackjack_sessions)").all().map(c => c.name.toLowerCase());
        if (!bjCols.includes("state_json")) db.prepare("ALTER TABLE blackjack_sessions ADD COLUMN state_json TEXT").run();
        if (!bjCols.includes("status")) db.prepare("ALTER TABLE blackjack_sessions ADD COLUMN status TEXT DEFAULT 'active'").run();
      }
    })();
    console.log("Repaired", file);
  } catch (e) {
    console.error("FAILED", file, e.message);
  } finally {
    db.close();
  }
}
