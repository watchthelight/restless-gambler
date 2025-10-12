/**
 * Game XP Award Service
 * Calculates XP rewards from gambling activities with rate limiting and anti-spam measures
 */

import { getGuildDb } from "../db/connection.js";
import { getSetting, getSettingNum } from "../db/kv.js";
import { addXP, grantLuck, getLuckBps, getLuckBuff } from "./store.js";
import { queueRankUpAnnouncement } from "./announce.js";
import { refreshPresence } from "../status/presence.js";
import { getClient } from "../bot/client.js";

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
  clampedToMin?: boolean;
  clampedToMax?: boolean;
};

// In-memory rate limiting: per-user per-guild XP tracking with minute bucketing
interface RateLimitBucket {
  minuteKey: number;    // Math.floor(Date.now() / 60000)
  xp: number;           // XP granted in this minute
  lastGrantMs: number;  // Timestamp of last grant
}

const minuteBuckets = new Map<string, RateLimitBucket>();

const keyFor = (guildId: string, userId: string) => `${guildId}:${userId}`;

/**
 * Get guild XP configuration
 */
function getXpConfig(guildId: string) {
  const db = getGuildDb(guildId);
  return {
    xp_enabled: getSetting(db, "xp_enabled") !== "false", // default true
    xp_per_1000_wagered: getSettingNum(db, "xp_per_1000_wagered", 5),
    xp_flat_per_round: getSettingNum(db, "xp_flat_per_round", 0),
    xp_min_per_round: getSettingNum(db, "xp_min_per_round", 10),
    xp_max_per_round: getSettingNum(db, "xp_max_per_round", 250),
    xp_per_minute_cap: getSettingNum(db, "xp_per_minute_cap", 1000),
    xp_min_cooldown_ms: getSettingNum(db, "xp_min_cooldown_ms", 1500),
    luck_bonus_bps: getSettingNum(db, "luck_bonus_bps", 150),
    luck_max_bps: getSettingNum(db, "luck_max_bps", 300),
    luck_duration_sec: getSettingNum(db, "luck_duration_sec", 3600),
    rank_public_promotions: getSetting(db, "rank_public_promotions") !== "false",
  };
}

/**
 * Get current XP rate limit status for a user
 */
export function getXpRateLimitStatus(guildId: string, userId: string): {
  xpThisMinute: number;
  minuteKey: number;
  lastGrantMs: number;
} {
  const key = keyFor(guildId, userId);
  const bucket = minuteBuckets.get(key);
  const minuteKey = Math.floor(Date.now() / 60000);

  if (!bucket || bucket.minuteKey !== minuteKey) {
    return {
      xpThisMinute: 0,
      minuteKey,
      lastGrantMs: bucket?.lastGrantMs ?? 0
    };
  }

  return {
    xpThisMinute: bucket.xp,
    minuteKey,
    lastGrantMs: bucket.lastGrantMs
  };
}

/**
 * Award XP for a game action and return display information
 *
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param opts - Game options (wager, game type, rounds, reason)
 * @returns XpGrant with all information needed for UI display
 */
export async function awardGameXp(
  guildId: string,
  userId: string,
  opts: {
    wager?: bigint | number | string;
    game?: GameType;
    rounds?: number;
    reason?: string;
  }
): Promise<XpGrant> {
  const cfg = getXpConfig(guildId);
  const reason = opts.reason ?? (opts.game ? gameReason(opts.game) : 'game round');

  // Check if XP is enabled
  if (!cfg.xp_enabled) {
    return {
      userId,
      guildId,
      base: 0,
      buffPct: 0,
      final: 0,
      reason: 'xp disabled',
    };
  }

  // Parse wager safely to number
  const rounds = Math.max(1, Number(opts.rounds ?? 1));
  let wagerNum = 0;
  if (opts.wager !== undefined && opts.wager !== null) {
    try {
      const wagerBigInt = BigInt(String(opts.wager));
      wagerNum = Number(wagerBigInt);
    } catch {
      wagerNum = 0;
    }
  }

  // Calculate base XP per round
  const perK = Number(cfg.xp_per_1000_wagered);
  const flat = Number(cfg.xp_flat_per_round);
  const basePerRound = Math.max(0, Math.floor((wagerNum / 1000) * perK) + flat);
  let base = basePerRound * rounds;

  // Cooldown enforcement
  const now = Date.now();
  const key = keyFor(guildId, userId);
  const minuteKey = Math.floor(now / 60000);

  let bucket = minuteBuckets.get(key);
  if (!bucket || bucket.minuteKey !== minuteKey) {
    // New minute bucket
    bucket = { minuteKey, xp: 0, lastGrantMs: 0 };
    minuteBuckets.set(key, bucket);
  }

  // Check cooldown
  if (bucket.lastGrantMs && now - bucket.lastGrantMs < cfg.xp_min_cooldown_ms) {
    bucket.lastGrantMs = now; // Update timestamp even when throttled
    return {
      userId,
      guildId,
      base,
      buffPct: 0,
      final: 0,
      reason: 'cooldown',
    };
  }

  // Get luck buff
  const currentLuckBps = getLuckBps(guildId, userId);
  const buffPct = currentLuckBps / 10000; // Convert basis points to decimal (e.g., 150 -> 0.015)

  // Apply buff to base
  let withBuff = Math.floor(base * (1 + buffPct));

  // Apply clamps (only if base is non-zero OR flat is non-zero)
  const minRound = Number(cfg.xp_min_per_round);
  const maxRound = Number(cfg.xp_max_per_round);

  let clampedToMin = false;
  let clampedToMax = false;

  // Only apply min clamp if we have a non-zero wager OR flat rate
  // Per spec: "unless base + flat == 0 then still enforce min if min>0"
  // This means: if wager > 0 OR flat > 0, apply min clamp
  if (wagerNum > 0 || flat > 0) {
    if (withBuff < minRound) {
      withBuff = minRound;
      clampedToMin = true;
    }
  }

  if (withBuff > maxRound) {
    withBuff = maxRound;
    clampedToMax = true;
  }

  // Apply per-minute cap
  const perMinuteCap = Number(cfg.xp_per_minute_cap);
  const remaining = Math.max(0, perMinuteCap - bucket.xp);
  const final = Math.max(0, Math.min(withBuff, remaining));

  // Update bucket state
  bucket.lastGrantMs = now;
  if (final > 0) {
    bucket.xp += final;
  }

  // Persist XP if final > 0
  let buffExpiresAt: string | undefined;
  let newLevel: number | undefined;

  if (final > 0) {
    const { level, leveled, previousLevel } = addXP(guildId, userId, final);

    // Handle rank-up
    if (leveled) {
      const luck = Math.min(cfg.luck_bonus_bps, cfg.luck_max_bps);
      const dur = cfg.luck_duration_sec;
      grantLuck(guildId, userId, luck, dur);

      // Get new buff expiry
      const buff = getLuckBuff(guildId, userId);
      if (buff) {
        // expires_at is a BigInt (Unix ms), convert to number for Date constructor
        const expiresMs = Number(buff.expires_at);
        buffExpiresAt = new Date(expiresMs).toISOString();
      }

      newLevel = level;

      // Fire-and-forget presence refresh (only if not in test env)
      if (process.env.NODE_ENV !== 'test') {
        try { refreshPresence(getClient()).catch(() => {}); } catch { }
      }

      // Queue rank-up announcement
      if (cfg.rank_public_promotions) {
        try { queueRankUpAnnouncement(guildId, userId, level, luck, dur); } catch { }
      }
    }
  }

  return {
    userId,
    guildId,
    base,
    buffPct,
    final,
    reason,
    newLevel,
    buffExpiresAt,
    clampedToMin,
    clampedToMax,
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
  minuteBuckets.clear();
}

/**
 * Shutdown any background schedulers (for clean Jest exit)
 */
export function shutdownXpSchedulers(): void {
  // Currently no schedulers, but placeholder for future
}
