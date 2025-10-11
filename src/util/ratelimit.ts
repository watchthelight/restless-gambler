/**
 * Token bucket rate limiter
 * Default: 5 operations per 10 seconds per user:command key
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  maxTokens?: number;
  refillIntervalMs?: number;
  tokensPerRefill?: number;
}

const DEFAULT_CONFIG: Required<RateLimitConfig> = {
  maxTokens: 5,
  refillIntervalMs: 10_000, // 10 seconds
  tokensPerRefill: 5,
};

/**
 * Check if an operation is rate-limited
 * @param userId Discord user ID
 * @param command Command name (e.g., "gamble", "give")
 * @param config Optional rate limit configuration
 * @returns true if rate limited (should reject), false if allowed
 */
export function isRateLimited(
  userId: string,
  command: string,
  config: RateLimitConfig = {}
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const key = `${userId}:${command}`;
  const now = Date.now();

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: cfg.maxTokens, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill;
  const refillCount = Math.floor(elapsed / cfg.refillIntervalMs);
  if (refillCount > 0) {
    bucket.tokens = Math.min(cfg.maxTokens, bucket.tokens + refillCount * cfg.tokensPerRefill);
    bucket.lastRefill = now;
  }

  // Check if we have tokens available
  if (bucket.tokens <= 0) {
    return true; // Rate limited
  }

  // Consume a token
  bucket.tokens -= 1;
  return false; // Not rate limited
}

/**
 * Get remaining time until next token refill
 * @param userId Discord user ID
 * @param command Command name
 * @param config Optional rate limit configuration
 * @returns milliseconds until next refill, or 0 if not rate limited
 */
export function getRateLimitReset(
  userId: string,
  command: string,
  config: RateLimitConfig = {}
): number {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const key = `${userId}:${command}`;
  const bucket = buckets.get(key);

  if (!bucket || bucket.tokens > 0) {
    return 0;
  }

  const now = Date.now();
  const elapsed = now - bucket.lastRefill;
  const timeUntilRefill = cfg.refillIntervalMs - (elapsed % cfg.refillIntervalMs);
  return timeUntilRefill;
}

/**
 * Clear all rate limit buckets (useful for testing)
 */
export function clearRateLimits(): void {
  buckets.clear();
}
