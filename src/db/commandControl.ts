import type Database from 'better-sqlite3';

export type CommandControl = {
  guild_id: string;
  mode: 'normal'|'whitelist';
  whitelist_json: string;
  snapshot_json: string;
  updated_at: string;
};

export function getCommandControl(db: Database.Database, guildId: string): CommandControl {
  const row = db.prepare(
    'SELECT guild_id, mode, whitelist_json, snapshot_json, updated_at FROM command_control WHERE guild_id = ?'
  ).get(guildId) as CommandControl | undefined;
  if (row) return row;
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO command_control(guild_id, mode, whitelist_json, snapshot_json, updated_at) VALUES(?,?,?,?,?)'
  ).run(guildId, 'normal', '[]', '[]', now);
  return { guild_id: guildId, mode: 'normal', whitelist_json: '[]', snapshot_json: '[]', updated_at: now };
}

export function setWhitelistMode(db: Database.Database, guildId: string, allowed: string[], snapshot: string[]): void {
  db.prepare(
    `INSERT INTO command_control(guild_id, mode, whitelist_json, snapshot_json, updated_at)
     VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(guild_id) DO UPDATE SET
       mode=excluded.mode,
       whitelist_json=excluded.whitelist_json,
       snapshot_json=excluded.snapshot_json,
       updated_at=excluded.updated_at`
  ).run(guildId, 'whitelist', JSON.stringify(allowed.map(s => s.toLowerCase())), JSON.stringify(snapshot));
}

export function releaseWhitelist(db: Database.Database, guildId: string): void {
  db.prepare(
    `UPDATE command_control
       SET mode='normal', updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE guild_id=?`
  ).run(guildId);
}

