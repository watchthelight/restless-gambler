/**
 * Rank System Data Store
 * Handles all database operations for user ranks and luck buffs
 */

import { getGuildDb } from "../db/connection.js";
import { getSetting, getSettingNum } from "../db/kv.js";
import { xpNeededFor, clamp, type Curve } from "./math.js";

export interface UserRank {
  level: number;
  xp: number;
}

export interface LuckBuff {
  luck_bps: number;
  granted_at: number;
  expires_at: number;
}

export interface AddXpResult {
  level: number;
  xp: number;
  leveled: boolean;
  previousLevel?: number;
}

/**
 * Get guild config value with fallback
 */
function getGuildConfig(guildId: string) {
  const db = getGuildDb(guildId);
  return {
    rank_curve: (getSetting(db, "rank_curve") ?? "quadratic") as Curve,
    rank_max_level: getSettingNum(db, "rank_max_level", 100),
    rank_xp_rate: getSettingNum(db, "rank_xp_rate", 1.0),
    luck_bonus_bps: getSettingNum(db, "luck_bonus_bps", 150),
    luck_max_bps: getSettingNum(db, "luck_max_bps", 300),
    luck_duration_sec: getSettingNum(db, "luck_duration_sec", 3600),
  };
}

/**
 * Get user's current rank
 * @returns UserRank object with level and xp (defaults to level 1, xp 0 if not found)
 */
export function getRank(guildId: string, userId: string): UserRank {
  const db = getGuildDb(guildId);
  const row = db
    .prepare("SELECT level, xp FROM user_ranks WHERE user_id=?")
    .get(userId) as { level: number; xp: number } | undefined;
  if (!row) return { level: 1, xp: 0 };
  return { level: Number((row as any).level), xp: Number((row as any).xp) };
}

/**
 * Set user's rank directly (admin function)
 */
export function setRank(guildId: string, userId: string, level: number, xp: number): void {
  const db = getGuildDb(guildId);
  const now = Date.now();
  db.prepare(
    `INSERT INTO user_ranks(user_id, level, xp, updated_at)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       level=excluded.level,
       xp=excluded.xp,
       updated_at=excluded.updated_at`
  ).run(userId, level, xp, now);
}

/**
 * Add XP to a user, automatically handling level-ups
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param delta - XP to add (will be floored and clamped to non-negative)
 * @returns AddXpResult with new level, xp, and whether they leveled up
 */
export function addXP(guildId: string, userId: string, delta: number): AddXpResult {
  const db = getGuildDb(guildId);
  const now = Date.now();
  const row = db
    .prepare("SELECT level, xp FROM user_ranks WHERE user_id=?")
    .get(userId) as { level: number; xp: number } | undefined;

  const cfg = getGuildConfig(guildId);
  const curve = cfg.rank_curve;
  const maxL = cfg.rank_max_level;

  let level = Number((row as any)?.level ?? 1);
  let xp = Math.max(0, Number((row as any)?.xp ?? 0) + Math.max(0, Math.floor(delta)));
  const previousLevel = level;
  let leveled = false;

  // Process level-ups
  while (level < maxL) {
    const needed = xpNeededFor(level, curve, maxL);
    if (xp < needed) break;
    xp -= needed;
    level++;
    leveled = true;
  }

  // Cap XP at max level
  if (level >= maxL) {
    xp = Math.min(xp, xpNeededFor(maxL, curve, maxL));
  }

  // Save to database
  db.prepare(
    `INSERT INTO user_ranks(user_id, level, xp, updated_at)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       level=excluded.level,
       xp=excluded.xp,
       updated_at=excluded.updated_at`
  ).run(userId, level, xp, now);

  return { level, xp, leveled, previousLevel: leveled ? previousLevel : undefined };
}

/**
 * Grant or refresh a luck buff for a user
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param luckBps - Luck bonus in basis points (150 = 1.5%)
 * @param durationSec - Duration in seconds
 */
export function grantLuck(guildId: string, userId: string, luckBps: number, durationSec: number): void {
  const db = getGuildDb(guildId);
  const now = Date.now();
  const exp = now + durationSec * 1000;

  db.prepare(
    `INSERT INTO user_buffs(user_id, luck_bps, granted_at, expires_at)
     VALUES(?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       luck_bps=excluded.luck_bps,
       granted_at=excluded.granted_at,
       expires_at=excluded.expires_at`
  ).run(userId, luckBps, now, exp);
}

/**
 * Get user's active luck buff in basis points (0 if none or expired)
 * @returns Luck bonus in basis points (e.g., 150 = 1.5%)
 */
export function getLuckBps(guildId: string, userId: string): number {
  const db = getGuildDb(guildId);
  const row = db
    .prepare("SELECT luck_bps, expires_at FROM user_buffs WHERE user_id=?")
    .get(userId) as { luck_bps: number; expires_at: number } | undefined;

  if (!row) return 0;
  const exp = Number((row as any).expires_at);
  if (exp <= Date.now()) return 0;
  return Number((row as any).luck_bps) | 0;
}

/**
 * Get user's luck buff details (if active)
 */
export function getLuckBuff(guildId: string, userId: string): LuckBuff | null {
  const db = getGuildDb(guildId);
  const row = db
    .prepare("SELECT luck_bps, granted_at, expires_at FROM user_buffs WHERE user_id=?")
    .get(userId) as LuckBuff | undefined;

  if (!row) return null;
  if (row.expires_at <= Date.now()) return null;
  return row;
}

/**
 * Clean up expired buffs (run periodically)
 * @returns Number of buffs cleaned up
 */
export function cleanupExpiredBuffs(guildId: string): number {
  const db = getGuildDb(guildId);
  const result = db.prepare("DELETE FROM user_buffs WHERE expires_at <= ?").run(Date.now());
  return result.changes;
}

/**
 * Get count of active buffs in guild
 */
export function getActiveBuffCount(guildId: string): number {
  const db = getGuildDb(guildId);
  const row = db
    .prepare("SELECT COUNT(*) as count FROM user_buffs WHERE expires_at > ?")
    .get(Date.now()) as { count: number } | undefined;
  return row?.count ?? 0;
}

/**
 * Get top ranked users in a guild
 * @param guildId - Guild ID
 * @param limit - Maximum number of users to return (default 10)
 * @returns Array of users sorted by level (desc) then XP (desc)
 */
export function getTopRankedUsers(guildId: string, limit: number = 10): Array<{ user_id: string; level: number; xp: number }> {
  const db = getGuildDb(guildId);
  const rows = db
    .prepare(
      `SELECT user_id, level, xp
       FROM user_ranks
       ORDER BY level DESC, xp DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ user_id: string; level: number; xp: number }>;
  return rows;
}

/**
 * Reset a user's rank (admin function)
 */
export function resetRank(guildId: string, userId: string): void {
  const db = getGuildDb(guildId);
  db.prepare("DELETE FROM user_ranks WHERE user_id=?").run(userId);
  db.prepare("DELETE FROM user_buffs WHERE user_id=?").run(userId);
}

/**
 * Apply XP decay to a user (reduce by percentage)
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param percent - Percentage to reduce (0-100)
 * @returns New rank after decay
 */
export function applyXpDecay(guildId: string, userId: string, percent: number): UserRank {
  const current = getRank(guildId, userId);
  const decayFactor = clamp(percent, 0, 100) / 100;
  const newXp = Math.floor(current.xp * (1 - decayFactor));

  // If level > 1, we might need to adjust level downward
  const cfg = getGuildConfig(guildId);
  let level = current.level;
  let xp = newXp;

  // Recalculate level based on remaining XP
  if (xp < 0) {
    level = 1;
    xp = 0;
  }

  setRank(guildId, userId, level, xp);
  return { level, xp };
}
