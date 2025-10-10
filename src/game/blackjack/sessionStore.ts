import Database from "better-sqlite3";
import { getGuildDb } from '../../db/connection.js';

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
    // Add started_at if missing
    if (!names.has("started_at")) {
        db.exec(`ALTER TABLE blackjack_sessions ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0`);
        // Backfill with created_at or createdAt if available
        if (names.has("created_at")) {
            db.exec(`UPDATE blackjack_sessions SET started_at = created_at WHERE started_at = 0`);
        } else if (names.has("createdAt")) {
            db.exec(`UPDATE blackjack_sessions SET started_at = createdAt WHERE started_at = 0`);
        }
        log.info?.({ msg: "bj_schema_added_started_at" });
    }
    // Add updated_at if missing
    if (!names.has("updated_at")) {
        db.exec(`ALTER TABLE blackjack_sessions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`);
        // Backfill with updatedAt if available
        if (names.has("updatedAt")) {
            db.exec(`UPDATE blackjack_sessions SET updated_at = updatedAt WHERE updated_at = 0`);
        } else if (names.has("started_at")) {
            db.exec(`UPDATE blackjack_sessions SET updated_at = started_at WHERE updated_at = 0`);
        }
        log.info?.({ msg: "bj_schema_added_updated_at" });
    }

    // Fix ID column type mismatch (legacy tables have INTEGER, new tables have TEXT)
    const idCol = db.prepare(`PRAGMA table_info(blackjack_sessions)`).all() as any[];
    const idInfo = idCol.find((c: any) => c.name === 'id');
    if (idInfo && idInfo.type === 'INTEGER') {
        log.info?.({ msg: "bj_schema_migrating_id_column", note: "Converting INTEGER id to TEXT UUID" });
        try {
            // Delete all old sessions (safer than trying to migrate with UUID generation)
            // Old sessions are likely stale anyway
            db.exec(`DELETE FROM blackjack_sessions WHERE 1=1;`);

            // Recreate the table with correct schema
            db.exec(`DROP TABLE IF EXISTS blackjack_sessions;`);
            db.exec(`
                CREATE TABLE blackjack_sessions(
                    id TEXT PRIMARY KEY,
                    guild_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    state_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    started_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_bj_sessions_guild_user ON blackjack_sessions(guild_id, user_id);
                CREATE INDEX IF NOT EXISTS idx_bj_sessions_status ON blackjack_sessions(status);
            `);
            log.info?.({ msg: "bj_schema_id_migration_complete", note: "Old sessions cleared" });
        } catch (e: any) {
            log.error?.({ msg: "bj_schema_id_migration_failed", error: String(e) });
        }
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

// Remove any active/inactive session rows for a user in a guild
export function endSession(guildId: string, userId: string) {
    const db = getGuildDb(guildId);
    try {
        db.prepare(`DELETE FROM blackjack_sessions WHERE guild_id = ? AND user_id = ?`).run(guildId, userId);
    } catch {}
}
