import type Database from 'better-sqlite3';

export function getSetting(db: Database.Database, key: string): string | null {
    const row = db.prepare('SELECT value FROM guild_settings WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
    db.prepare(`
    INSERT INTO guild_settings(key, value, updated_at)
    VALUES (?, ?, strftime('%s','now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at;
  `).run(key, value);
}

export function getSettingNum(db: Database.Database, key: string, fallback: number): number {
    const v = getSetting(db, key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

export function getAdmins(db: Database.Database): { user_id: string; created_at: number }[] {
    const rows = db.prepare('SELECT user_id, COALESCE(created_at, added_at) as created_at FROM guild_admins ORDER BY created_at ASC').all() as { user_id: string; created_at: number }[];
    return rows;
}
