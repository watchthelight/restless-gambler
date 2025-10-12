/**
 * Game XP Award Service
 * Provides display-friendly XP grant information for game results
 */

import { getGuildDb } from "../db/connection.js";
import { getSetting, getSettingNum } from "../db/kv.js";
import { addXP, grantLuck, getLuckBps, getLuckBuff } from "./store.js";
import { queueRankUpAnnouncement } from "./announce.js";
import { refreshPresence } from "../status/presence.js";
import { getClient } from "../bot/client.js";
import { bigintToNumberSafe } from "../utils/bigint.js";

export type GameType = 'blackjack' | 'roulette' | 'slots' | 'holdem' | 'gamble';

export type XpGrant = {
  userId: string;
  guildId: string;
  base: number;        // raw computed XP before clamps/buffs
  buffPct: number;     // e.g., 0.015 for +1.5%
  final: number;       // integer XP applied this round
  reason: string;      // e.g., "blackjack hand", "roulette spin"
  newLevel?: number;   // present if level changed after this grant
  buffExpiresAt?: string; // ISO if a fresh rank-up extended/created a buff
};

// In-memory rate limiting: per-user per-guild XP tracking
interface RateLimitWindow {
  sum: number;
  windowStart: number;
  lastActionTime: number;
}

const rateLimits = new Map<string, RateLimitWindow>();

/**
 * Get guild XP configuration
 */
function getXpConfig(guildId: string) {
  const db = getGuildDb(guildId);
  return {
    xp_enabled: getSetting(db, "xp_enabled") !== "false", // default true
    xp_per_1000_wagered: getSettingNum(db, "xp_per_1000_wagered", 5),
    xp_flat_per_round: getSettingNum(db, "xp_flat_per_round", 1),
    xp_min_per_round: getSettingNum(db, "xp_min_per_round", 1),
    xp_max_per_round: getSettingNum(db, "xp_max_per_round", 250),
    xp_cap_per_minute: getSettingNum(db, "xp_cap_per_minute", 500),
    xp_cooldown_ms: getSettingNum(db, "xp_cooldown_ms", 1500),
    luck_bonus_bps: getSettingNum(db, "luck_bonus_bps", 150),
    luck_max_bps: getSettingNum(db, "luck_max_bps", 300),
    luck_duration_sec: getSettingNum(db, "luck_duration_sec", 3600),
    rank_public_promotions: getSetting(db, "rank_public_promotions") !== "false",
  };
}

/**
 * Calculate base XP from wager and rounds
 */
function calculateBaseXp(opts: { wager?: bigint; rounds?: number }, cfg: ReturnType<typeof getXpConfig>): number {
  const wager = opts.wager ?? 0n;
  const rounds = opts.rounds ?? 1;

  // Convert wager to number safely
  const wagerNum = wager > 0n ? bigintToNumberSafe(wager) : 0;

  // Proportional award: xp_per_1000_wagered per 1000 units wagered
  const wagerXp = (wagerNum / 1000) * cfg.xp_per_1000_wagered;

  // Flat award per round
  const flatXp = cfg.xp_flat_per_round * rounds;

  // Total base XP (before clamps)
  return wagerXp + flatXp;
}

/**
 * Award XP for a game action and return display information
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param opts - Game options (wager, game type, rounds)
 * @returns XpGrant with all information needed for UI display
 */
export async function awardGameXp(
  guildId: string,
  userId: string,
  opts: { wager?: bigint; game: GameType; rounds?: number }
): Promise<XpGrant> {
  const cfg = getXpConfig(guildId);

  // Check if XP is enabled
  if (!cfg.xp_enabled) {
    return {
      userId,
      guildId,
      base: 0,
      buffPct: 0,
      final: 0,
      reason: gameReason(opts.game),
    };
  }

  // Calculate base XP
  let baseXp = calculateBaseXp(opts, cfg);

  // If both wager is 0 and flat is 0, grant nothing
  const wager = opts.wager ?? 0n;
  if (wager === 0n && cfg.xp_flat_per_round === 0) {
    return {
      userId,
      guildId,
      base: 0,
      buffPct: 0,
      final: 0,
      reason: gameReason(opts.game),
    };
  }

  // Apply per-round min/max clamps
  baseXp = Math.max(cfg.xp_min_per_round, Math.min(cfg.xp_max_per_round, Math.floor(baseXp)));

  // Check rate limits
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const limit = rateLimits.get(key) ?? { sum: 0, windowStart: now, lastActionTime: 0 };

  // Cooldown check
  if (now - limit.lastActionTime < cfg.xp_cooldown_ms) {
    return {
      userId,
      guildId,
      base: baseXp,
      buffPct: 0,
      final: 0,
      reason: gameReason(opts.game),
    };
  }

  // Reset window if 60 seconds have passed
  if (now - limit.windowStart >= 60_000) {
    limit.sum = 0;
    limit.windowStart = now;
  }

  // Apply per-minute rate limit
  const allowed = Math.max(0, cfg.xp_cap_per_minute - limit.sum);
  let grantedXp = Math.min(baseXp, allowed);

  // Get current luck buff (before applying XP)
  const currentLuckBps = getLuckBps(guildId, userId);
  const buffPct = currentLuckBps / 10000; // Convert basis points to decimal

  // Apply luck buff to XP
  if (buffPct > 0 && grantedXp > 0) {
    const buffedXp = Math.floor(grantedXp * (1 + buffPct));
    grantedXp = Math.min(buffedXp, cfg.xp_max_per_round); // Re-clamp after buff
  }

  // Update rate limit tracking
  limit.sum += grantedXp;
  limit.lastActionTime = now;
  rateLimits.set(key, limit);

  // If no XP granted after all checks, return early
  if (grantedXp <= 0) {
    return {
      userId,
      guildId,
      base: baseXp,
      buffPct,
      final: 0,
      reason: gameReason(opts.game),
    };
  }

  // Persist XP and check for level-up
  const { level, leveled, previousLevel } = addXP(guildId, userId, grantedXp);

  // Handle rank-up
  let buffExpiresAt: string | undefined;
  if (leveled) {
    const luck = Math.min(cfg.luck_bonus_bps, cfg.luck_max_bps);
    const dur = cfg.luck_duration_sec;
    grantLuck(guildId, userId, luck, dur);

    // Get new buff expiry
    const buff = getLuckBuff(guildId, userId);
    if (buff) {
      buffExpiresAt = new Date(buff.expires_at).toISOString();
    }

    // Fire-and-forget presence refresh
    try { refreshPresence(getClient()).catch(() => {}); } catch { }

    // Queue rank-up announcement
    if (cfg.rank_public_promotions) {
      try { queueRankUpAnnouncement(guildId, userId, level, luck, dur); } catch { }
    }
  }

  return {
    userId,
    guildId,
    base: baseXp,
    buffPct,
    final: grantedXp,
    reason: gameReason(opts.game),
    newLevel: leveled ? level : undefined,
    buffExpiresAt,
  };
}

/**
 * Generate human-readable reason string for game type
 */
function gameReason(game: GameType): string {
  switch (game) {
    case 'blackjack': return 'blackjack hand';
    case 'roulette': return 'roulette spin';
    case 'slots': return 'slots spin';
    case 'holdem': return 'holdem hand';
    case 'gamble': return 'gamble';
    default: return 'game';
  }
}

/**
 * Clean up old rate limit entries (call periodically)
 */
export function cleanupXpRateLimits(): void {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [key, limit] of rateLimits.entries()) {
    if (now - limit.windowStart > staleThreshold) {
      rateLimits.delete(key);
    }
  }
}

/**
 * Get current XP rate limit status for a user (for debugging/admin)
 */
export function getXpRateLimitStatus(guildId: string, userId: string): {
  xpThisMinute: number;
  xpRemaining: number;
  windowResetIn: number;
  lastActionAgo: number;
} {
  const cfg = getXpConfig(guildId);
  const key = `${guildId}:${userId}`;
  const limit = rateLimits.get(key);
  const now = Date.now();

  if (!limit) {
    return {
      xpThisMinute: 0,
      xpRemaining: cfg.xp_cap_per_minute,
      windowResetIn: 0,
      lastActionAgo: Infinity,
    };
  }

  const windowAge = now - limit.windowStart;
  const windowResetIn = Math.max(0, 60_000 - windowAge);
  const xpRemaining = Math.max(0, cfg.xp_cap_per_minute - limit.sum);
  const lastActionAgo = now - limit.lastActionTime;

  return {
    xpThisMinute: limit.sum,
    xpRemaining,
    windowResetIn,
    lastActionAgo,
  };
}
