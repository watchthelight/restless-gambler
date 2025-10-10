import Database from "better-sqlite3";

type Col = { name: string };
function cols(db: Database.Database, table: string): Set<string> {
    try { return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as Col[]).map(c => c.name)); }
    catch { return new Set(); }
}

export function ensureBlackjackSessionsSchema(db: Database.Database, log = console) {
    const hasTable = !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='blackjack_sessions'`).get();
    if (!hasTable) {
        db.exec(`
      CREATE TABLE blackjack_sessions(
        id TEXT PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        state_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', -- active | settled | aborted
        started_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bj_sessions_guild_user ON blackjack_sessions(guild_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_bj_sessions_status ON blackjack_sessions(status);
    `);
        log.info?.({ msg: "bj_schema_created" });
        return;
    }
    const names = cols(db, "blackjack_sessions");
    // If legacy boolean 'active' exists but 'status' doesn't, add status and backfill.
    if (names.has("active") && !names.has("status")) {
        db.exec(`ALTER TABLE blackjack_sessions ADD COLUMN status TEXT`);
        // Best-effort backfill: active(1) -> 'active', else -> 'settled'
        db.exec(`UPDATE blackjack_sessions SET status = CASE active WHEN 1 THEN 'active' ELSE 'settled' END WHERE status IS NULL`);
        db.exec(`UPDATE blackjack_sessions SET status = 'settled' WHERE status IS NULL`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_sessions_status ON blackjack_sessions(status)`);
        log.info?.({ msg: "bj_schema_upgraded_active_to_status" });
    }
    // If neither exists, add status.
    if (!names.has("status")) {
        db.exec(`ALTER TABLE blackjack_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active'`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_sessions_status ON blackjack_sessions(status)`);
    }
    // Add guild_id if missing
    if (!names.has("guild_id")) {
        db.exec(`ALTER TABLE blackjack_sessions ADD COLUMN guild_id TEXT`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_sessions_guild_user ON blackjack_sessions(guild_id, user_id)`);
        log.info?.({ msg: "bj_schema_added_guild_id" });
    }
}

export type BjSession = {
    id: string;
    guild_id: string;
    user_id: string;
    state_json: string;
    status: "active" | "settled" | "aborted";
    started_at: number;
    updated_at: number;
};

export function findActiveSession(db: Database.Database, guildId: string, userId: string): BjSession | undefined {
    const row = db.prepare(`
    SELECT id, guild_id, user_id, state_json, status, started_at, updated_at
    FROM blackjack_sessions
    WHERE guild_id = ? AND user_id = ? AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
  `).get(guildId, userId);
    return row as BjSession | undefined;
}

export function createSession(db: Database.Database, session: Omit<BjSession, "status" | "started_at" | "updated_at">) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
    INSERT INTO blackjack_sessions(id, guild_id, user_id, state_json, status, started_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(session.id, session.guild_id, session.user_id, session.state_json, now, now);
}

export function updateSession(db: Database.Database, id: string, stateJson: string) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE blackjack_sessions SET state_json = ?, updated_at = ? WHERE id = ?`).run(stateJson, now, id);
}

export function settleSession(db: Database.Database, id: string) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE blackjack_sessions SET status = 'settled', updated_at = ? WHERE id = ?`).run(now, id);
}

export function abortSession(db: Database.Database, id: string) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`UPDATE blackjack_sessions SET status = 'aborted', updated_at = ? WHERE id = ?`).run(now, id);
}
