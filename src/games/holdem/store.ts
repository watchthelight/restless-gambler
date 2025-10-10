import { getGuildDb } from "../../db/connection.js";
import { adjustBalance, getBalance } from "../../economy/wallet.js";

export type HoldemTable = {
  id: number;
  channel_id: string;
  small_blind: number;
  big_blind: number;
  min_buyin: number;
  max_buyin: number;
  seats: number;
  created_at: number;
};

export type HoldemPlayer = {
  table_id: number;
  user_id: string;
  seat: number;
  stack: number;
  joined_at: number;
};

export function getTableById(guildId: string, id: number): HoldemTable | undefined {
  const db = getGuildDb(guildId);
  return db.prepare("SELECT * FROM holdem_tables WHERE id = ?").get(id) as any;
}

export function getTableInChannel(guildId: string, channelId: string): HoldemTable | undefined {
  const db = getGuildDb(guildId);
  return db.prepare("SELECT * FROM holdem_tables WHERE channel_id = ? ORDER BY id DESC LIMIT 1").get(channelId) as any;
}

export function createTableInChannel(guildId: string, channelId: string, opts: Partial<Pick<HoldemTable,
  "small_blind" | "big_blind" | "min_buyin" | "max_buyin" | "seats">> = {}): HoldemTable {
  const now = Date.now();
  const sb = Math.max(1, opts.small_blind ?? 5);
  const bb = Math.max(sb, opts.big_blind ?? sb * 2);
  const min = Math.max(bb * 2, opts.min_buyin ?? bb * 20);
  const max = Math.max(min, opts.max_buyin ?? bb * 100);
  const seats = Math.min(10, Math.max(2, opts.seats ?? 6));

  const db = getGuildDb(guildId);
  const stmt = db.prepare(
    "INSERT INTO holdem_tables(channel_id, small_blind, big_blind, min_buyin, max_buyin, seats, created_at) VALUES(?,?,?,?,?,?,?)"
  );
  const info = stmt.run(channelId, sb, bb, min, max, seats, now);
  return getTableById(guildId, Number(info.lastInsertRowid))!;
}

export function listTablesInGuild(guildId: string): HoldemTable[] {
  const db = getGuildDb(guildId);
  return db.prepare("SELECT * FROM holdem_tables ORDER BY id DESC").all() as any[];
}

export function getSeatMap(guildId: string, tableId: number): Map<number, string> {
  const db = getGuildDb(guildId);
  const rows = db.prepare("SELECT seat, user_id FROM holdem_players WHERE table_id = ?").all(tableId) as any[];
  const m = new Map<number, string>();
  rows.forEach(r => m.set(Number(r.seat), String(r.user_id)));
  return m;
}

function firstFreeSeat(seats: number, taken: Map<number, string>): number | null {
  for (let s = 1; s <= seats; s++) if (!taken.has(s)) return s;
  return null;
}

export function isUserSeatedAnywhere(guildId: string, userId: string): boolean {
  const db = getGuildDb(guildId);
  const r = db.prepare("SELECT 1 FROM holdem_players WHERE user_id = ? LIMIT 1").get(userId);
  return !!r;
}

export async function joinTable(guildId: string, tableId: number, userId: string, buyin: number) {
  const db = getGuildDb(guildId);
  const table = getTableById(guildId, tableId);
  if (!table) throw new Error("table_not_found");
  if (isUserSeatedAnywhere(guildId, userId)) throw new Error("already_seated");
  if (buyin < table.min_buyin || buyin > table.max_buyin) throw new Error("buyin_out_of_range");

  const bal = getBalance(guildId, userId);
  if (bal < BigInt(buyin)) throw new Error("insufficient_funds");

  const taken = getSeatMap(guildId, tableId);
  const seat = firstFreeSeat(table.seats, taken);
  if (seat == null) throw new Error("table_full");

  // Deduct first
  await adjustBalance(guildId, userId, -buyin, "holdem_buyin");

  const now = Date.now();
  db.prepare("INSERT INTO holdem_players(table_id, user_id, seat, stack, joined_at) VALUES(?,?,?,?,?)")
    .run(tableId, userId, seat, buyin, now);

  return { table, seat, stack: buyin };
}

export async function leaveAnyTable(guildId: string, userId: string) {
  const db = getGuildDb(guildId);
  const row = db.prepare("SELECT table_id, stack FROM holdem_players WHERE user_id = ? LIMIT 1").get(userId) as any;
  if (!row) return null;
  const tableId = Number(row.table_id);
  const stack = Number(row.stack);
  db.prepare("DELETE FROM holdem_players WHERE user_id = ?").run(userId);
  await adjustBalance(guildId, userId, stack, "holdem_cashout");
  return { table: getTableById(guildId, tableId)!, stack };
}

export function tableStatus(guildId: string, tableId: number) {
  const db = getGuildDb(guildId);
  const table = getTableById(guildId, tableId);
  if (!table) return null;
  const players = db.prepare("SELECT * FROM holdem_players WHERE table_id = ? ORDER BY seat ASC").all(tableId) as HoldemPlayer[];
  return { table, players };
}
