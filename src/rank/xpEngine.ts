/**
 * XP Engine with Anti-Abuse Logic
 * Calculates XP rewards from gambling activities with rate limiting and anti-spam measures
 */

import { getGuildDb } from "../db/connection.js";
import { getSetting, getSettingNum } from "../db/kv.js";
import { addXP, grantLuck } from "./store.js";
import { clamp } from "./math.js";
import { queueRankUpAnnouncement } from "./announce.js";
import { refreshPresence } from "../status/presence.js";
import { getClient } from "../bot/client.js";

// In-memory rate limiting: per-user per-minute XP caps
interface RateLimitWindow {
  sum: number;
  windowStart: number;
  lastActionTime: number; // For debounce
}

const minuteCaps = new Map<string, RateLimitWindow>();
const MAX_XP_PER_MINUTE = 1000;
const MIN_ACTION_INTERVAL_MS = 2000; // 2 second debounce between XP awards

/**
 * Get guild rank configuration
 */
function getGuildConfig(guildId: string) {
  const db = getGuildDb(guildId);
  return {
    rank_xp_rate: getSettingNum(db, "rank_xp_rate", 1.0),
    rank_xp_cap_min: getSettingNum(db, "rank_xp_cap_min", 5),
    rank_xp_cap_max: getSettingNum(db, "rank_xp_cap_max", 250),
    luck_bonus_bps: getSettingNum(db, "luck_bonus_bps", 150),
    luck_max_bps: getSettingNum(db, "luck_max_bps", 300),
    luck_duration_sec: getSettingNum(db, "luck_duration_sec", 3600),
    ranks_enabled: getSetting(db, "features.ranks.enabled") !== "false", // default true
    rank_public_promotions: getSetting(db, "rank_public_promotions") !== "false",
  };
}

/**
 * Calculate base XP from a bet
 * Scales with bet size and risk (bet relative to wallet)
 * @param bet - Bet amount
 * @param wallet - Current wallet balance
 * @returns Base XP amount (before rate and caps)
 */
function calculateBaseXp(bet: number, wallet: number): number {
  // Calculate risk factor: bet relative to wallet
  // Higher risk = more XP, but bounded to prevent abuse
  const rel = Math.min(3, Math.max(0.05, wallet > 0 ? bet / Math.max(wallet, 1) : 0.1));

  // Logarithmic scaling of bet size with risk multiplier
  // Formula: log10(bet + 10) * 25 * risk_factor
  const baseXp = Math.log10(bet + 10) * 25 * rel;

  return baseXp;
}

/**
 * Calculate XP reward from a bet with all anti-abuse measures applied
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param bet - Bet amount
 * @param wallet - Current wallet balance
 * @returns XP granted (after rate limiting and caps)
 */
export function xpFromBet(guildId: string, userId: string, bet: number, wallet: number): number {
  const cfg = getGuildConfig(guildId);

  // Check if ranks are enabled
  if (!cfg.ranks_enabled) return 0;

  const rate = cfg.rank_xp_rate;
  const capMin = cfg.rank_xp_cap_min;
  const capMax = cfg.rank_xp_cap_max;

  // Calculate base XP
  let xp = calculateBaseXp(bet, wallet) * rate;

  // Apply per-action caps
  xp = Math.max(capMin, Math.min(capMax, Math.floor(xp)));

  // Check debounce (minimum time between XP awards)
  const k = `${guildId}:${userId}`;
  const now = Date.now();
  const cap = minuteCaps.get(k) ?? { sum: 0, windowStart: now, lastActionTime: 0 };

  // Debounce check
  if (now - cap.lastActionTime < MIN_ACTION_INTERVAL_MS) {
    return 0; // Too soon, no XP
  }

  // Reset window if 60 seconds have passed
  if (now - cap.windowStart >= 60_000) {
    cap.sum = 0;
    cap.windowStart = now;
  }

  // Apply per-minute rate limit
  const allowed = Math.max(0, MAX_XP_PER_MINUTE - cap.sum);
  const grant = Math.min(xp, allowed);

  // Update rate limit tracking
  cap.sum += grant;
  cap.lastActionTime = now;
  minuteCaps.set(k, cap);

  return grant;
}

/**
 * Award XP from a gambling action and handle rank-ups
 * This is the main entry point for awarding XP from games
 * @param guildId - Guild ID
 * @param userId - User ID
 * @param bet - Bet amount
 * @param wallet - Current wallet balance
 * @returns Object with xp granted, level, and whether user leveled up
 */
export function onGambleXP(
  guildId: string,
  userId: string,
  bet: number,
  wallet: number
): { xp: number; leveled: boolean; level: number; previousLevel?: number } {
  const xp = xpFromBet(guildId, userId, bet, wallet);

  if (xp <= 0) {
    const db = getGuildDb(guildId);
    const row = db
      .prepare("SELECT level FROM user_ranks WHERE user_id=?")
      .get(userId) as { level: number } | undefined;
    return { xp: 0, leveled: false, level: row?.level ?? 1 };
  }

  // Add XP and check for level-up
  const { level, xp: remainXp, leveled, previousLevel } = addXP(guildId, userId, xp);

  // If user leveled up, grant luck buff
  if (leveled) {
    const cfg = getGuildConfig(guildId);
    const luck = Math.min(cfg.luck_bonus_bps ?? 150, cfg.luck_max_bps ?? 300);
    const dur = cfg.luck_duration_sec ?? 3600;
    grantLuck(guildId, userId, luck, dur);
    // Fire-and-forget presence refresh (do not block user flow)
    try { refreshPresence(getClient()).catch(() => {}); } catch { }
    if (cfg.rank_public_promotions !== false) {
      try { queueRankUpAnnouncement(guildId, userId, level, luck, dur); } catch { }
    }
  }

  return { xp, leveled, level, previousLevel };
}

/**
 * Check if XP should be awarded for a specific action type
 * Used to prevent XP from non-gambling sources
 * @param actionType - Type of action (e.g., 'gamble', 'admin_give', 'faucet')
 * @returns true if XP should be awarded
 */
export function shouldAwardXp(actionType: string): boolean {
  // Only award XP for actual gambling actions
  const validActions = [
    "gamble",
    "slots",
    "roulette",
    "blackjack",
    "holdem",
  ];

  return validActions.includes(actionType);
}

/**
 * Clean up old rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  const staleThreshold = 5 * 60 * 1000; // 5 minutes

  for (const [key, cap] of minuteCaps.entries()) {
    if (now - cap.windowStart > staleThreshold) {
      minuteCaps.delete(key);
    }
  }
}

/**
 * Get current rate limit status for a user (for debugging/admin)
 */
export function getRateLimitStatus(guildId: string, userId: string): {
  xpThisMinute: number;
  xpRemaining: number;
  windowResetIn: number;
  lastActionAgo: number;
} {
  const k = `${guildId}:${userId}`;
  const cap = minuteCaps.get(k);
  const now = Date.now();

  if (!cap) {
    return {
      xpThisMinute: 0,
      xpRemaining: MAX_XP_PER_MINUTE,
      windowResetIn: 0,
      lastActionAgo: Infinity,
    };
  }

  const windowAge = now - cap.windowStart;
  const windowResetIn = Math.max(0, 60_000 - windowAge);
  const xpRemaining = Math.max(0, MAX_XP_PER_MINUTE - cap.sum);
  const lastActionAgo = now - cap.lastActionTime;

  return {
    xpThisMinute: cap.sum,
    xpRemaining,
    windowResetIn,
    lastActionAgo,
  };
}
