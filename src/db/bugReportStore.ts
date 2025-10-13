/**
 * Bug report SQLite persistence.
 * Uses better-sqlite3 to store bug reports submitted via /bugreport.
 */
import type { Database } from 'better-sqlite3';
import { getGlobalAdminDb } from './connection.js';

export interface BugReport {
  id: string;
  guildId: string;
  channelId: string;
  userId: string;
  command: string;
  expected: string;
  actual: string;
  createdAt: number;
  messageId?: string;
}

/**
 * Ensure bug_reports table exists in the global admin DB.
 */
function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command TEXT NOT NULL,
      expected TEXT NOT NULL,
      actual TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      message_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bug_reports_guild ON bug_reports(guild_id);
    CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);
  `);
}

/**
 * Create a new bug report. Best-effort; errors are caught and re-thrown as concise errors.
 */
export function create(report: BugReport): void {
  try {
    const db = getGlobalAdminDb();
    ensureSchema(db);
    db.prepare(`
      INSERT INTO bug_reports (id, guild_id, channel_id, user_id, command, expected, actual, created_at, message_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.id,
      report.guildId,
      report.channelId,
      report.userId,
      report.command,
      report.expected,
      report.actual,
      report.createdAt,
      report.messageId ?? null
    );
  } catch (e: any) {
    console.error('[bugReportStore] create failed:', e?.message || e);
    throw new Error(`Failed to persist bug report: ${e?.message || e}`);
  }
}

/**
 * Update message_id for a bug report (after posting to Discord).
 */
export function setMessageId(id: string, messageId: string): void {
  try {
    const db = getGlobalAdminDb();
    ensureSchema(db);
    db.prepare(`UPDATE bug_reports SET message_id = ? WHERE id = ?`).run(messageId, id);
  } catch (e: any) {
    console.error('[bugReportStore] setMessageId failed:', e?.message || e);
    throw new Error(`Failed to update message_id: ${e?.message || e}`);
  }
}

/**
 * Get a bug report by ID.
 */
export function getById(id: string): BugReport | null {
  try {
    const db = getGlobalAdminDb();
    ensureSchema(db);
    const row = db.prepare(`SELECT * FROM bug_reports WHERE id = ?`).get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      userId: row.user_id,
      command: row.command,
      expected: row.expected,
      actual: row.actual,
      createdAt: row.created_at,
      messageId: row.message_id ?? undefined,
    };
  } catch (e: any) {
    console.error('[bugReportStore] getById failed:', e?.message || e);
    return null;
  }
}

/**
 * List all bug reports for a guild (most recent first).
 */
export function listByGuild(guildId: string, limit = 50): BugReport[] {
  try {
    const db = getGlobalAdminDb();
    ensureSchema(db);
    const rows = db.prepare(`
      SELECT * FROM bug_reports WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(guildId, limit) as any[];
    return rows.map(row => ({
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      userId: row.user_id,
      command: row.command,
      expected: row.expected,
      actual: row.actual,
      createdAt: row.created_at,
      messageId: row.message_id ?? undefined,
    }));
  } catch (e: any) {
    console.error('[bugReportStore] listByGuild failed:', e?.message || e);
    return [];
  }
}
