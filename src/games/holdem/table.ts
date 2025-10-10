import { getGuildDb } from '../../db/connection.js';

export interface CreateTableOptions {
  guildId: string;
  channelId: string;
  ownerId: string;
  smallBlind: number;
  buyInMin: number;
  buyInMax: number;
}

export function createTable(opts: CreateTableOptions): number {
  const now = Date.now();
  const db = getGuildDb(opts.guildId);
  const res = db
    .prepare(
      'INSERT INTO holdem_tables(channel_id, owner_id, small_blind, buy_in_min, buy_in_max, status, state_json, updated_at) VALUES(?,?,?,?,?,?,?, ?)',
    )
    .run(
      opts.channelId,
      opts.ownerId,
      opts.smallBlind,
      opts.buyInMin,
      opts.buyInMax,
      'waiting',
      JSON.stringify({ players: [] }),
      now,
    );
  return res.lastInsertRowid as number;
}

export function updateTableState(id: number, state: any) {
  const db = getGuildDb(state.guildId ?? '');
  db.prepare('UPDATE holdem_tables SET state_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(state),
    Date.now(),
    id,
  );
}

export function getTable(id: number) {
  // Table lookup requires guild context in a real system; here we scan dev guild if provided
  const devGuild = process.env.DEV_GUILD_ID;
  const db = devGuild ? getGuildDb(devGuild) : getGuildDb('unknown');
  const row = db.prepare('SELECT * FROM holdem_tables WHERE id = ?').get(id) as any;
  return row;
}
