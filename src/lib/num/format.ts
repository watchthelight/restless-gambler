/**
 * Amount formatting with suffix support
 * Converts HugeDecimal values to human-readable strings
 */

import { HugeDecimal } from './Huge.js';
import { SUFFIX_TABLE, type SuffixUnit } from './parse.js';

export interface FormatOptions {
  /** Significant figures for compact format (default: 3) */
  sigFigs?: number;
  /** Minimum digits before using suffix (default: 4) */
  minDigitsForSuffix?: number;
  /** Use thousands separators in exact format (default: true) */
  useThousandsSeparators?: boolean;
  /** Decimal places for compact format (auto if not specified) */
  decimals?: number;
}

/**
 * Find the best suffix for a given value
 */
function findBestSuffix(value: HugeDecimal): SuffixUnit | null {
  if (value.isZero()) return null;

  // Get the magnitude (number of digits)
  const bi = value.abs().toBigInt();
  const digits = bi.toString().length;

  // Find largest suffix that doesn't exceed the value
  for (let i = SUFFIX_TABLE.length - 1; i >= 0; i--) {
    const unit = SUFFIX_TABLE[i];
    const threshold = 10 ** unit.power;

    // Check if value >= threshold
    const thresholdHd = HugeDecimal.fromString(`1e${unit.power}`);
    if (value.abs().gte(thresholdHd)) {
      return unit;
    }
  }

  return null;
}

/**
 * Add thousands separators to a string of digits
 */
function addThousandsSeparators(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format as compact string with suffix (e.g., "1.23qa", "45.6m")
 */
export function formatShort(value: HugeDecimal, opts: FormatOptions = {}): string {
  const sigFigs = opts.sigFigs ?? 3;
  const minDigits = opts.minDigitsForSuffix ?? 4;

  if (value.isZero()) return '0';

  const sign = value.isNegative() ? '-' : '';
  const abs = value.abs();

  // For small values, show exact
  const bi = abs.toBigInt();
  const digits = bi.toString().length;

  if (digits < minDigits) {
    return sign + addThousandsSeparators(bi.toString());
  }

  // Find best suffix
  const suffix = findBestSuffix(abs);
  if (!suffix) {
    return sign + addThousandsSeparators(bi.toString());
  }

  // Divide by suffix power
  const divisor = HugeDecimal.fromString(`1e${suffix.power}`);
  const quotient = abs.div(divisor);

  // Format with sig figs
  const num = quotient.toNumber();

  // Determine decimal places based on magnitude
  let decimals: number;
  if (num < 10) {
    decimals = Math.min(sigFigs - 1, 2);
  } else if (num < 100) {
    decimals = Math.min(sigFigs - 2, 1);
  } else {
    decimals = 0;
  }

  const formatted = num.toFixed(decimals);
  return sign + formatted + suffix.code;
}

/**
 * Format as exact integer with thousands separators
 */
export function formatExact(value: HugeDecimal, opts: FormatOptions = {}): string {
  const useSeparators = opts.useThousandsSeparators ?? true;

  if (value.isZero()) return '0';

  const sign = value.isNegative() ? '-' : '';
  const bi = value.abs().toBigInt();
  const s = bi.toString();

  if (useSeparators) {
    return sign + addThousandsSeparators(s);
  }

  return sign + s;
}

/**
 * Format with both compact and exact representations
 * Example: "1.23qa (exact: 1,230,000,000,000,000)"
 */
export function formatFull(value: HugeDecimal, opts: FormatOptions = {}): string {
  const compact = formatShort(value, opts);
  const exact = formatExact(value, opts);

  // If they're the same or exact is short, just return compact
  if (compact === exact || exact.replace(/,/g, '').length <= 10) {
    return exact;
  }

  return `${compact} (exact: ${exact})`;
}

/**
 * Format for display in embeds/cards
 * Uses intelligent formatting based on value size
 */
export function formatDisplay(value: HugeDecimal, opts: FormatOptions = {}): {
  compact: string;
  exact: string;
  scientific?: string;
} {
  const compact = formatShort(value, opts);
  const exact = formatExact(value, opts);

  // Add scientific notation for very large values
  let scientific: string | undefined;
  const bi = value.abs().toBigInt();
  if (bi.toString().length > 15) {
    scientific = value.toStringExact();
  }

  return { compact, exact, scientific };
}

/**
 * Format a balance for wallet/economy displays
 */
export function formatBalance(value: HugeDecimal, opts: FormatOptions = {}): string {
  return formatShort(value, { sigFigs: 3, minDigitsForSuffix: 4, ...opts });
}

/**
 * Format percentage (e.g., for probabilities, bonuses)
 */
export function formatPercent(value: number, decimals = 2): string {
  return value.toFixed(decimals) + '%';
}

/**
 * Format basis points to percentage (150 bps = 1.50%)
 */
export function formatBasisPoints(bps: number, decimals = 2): string {
  return formatPercent(bps / 100, decimals);
}

/**
 * Format for admin/debug views (show all representations)
 */
export function formatDebug(value: HugeDecimal): string {
  return [
    `Compact: ${formatShort(value)}`,
    `Exact: ${formatExact(value)}`,
    `Scientific: ${value.toStringExact()}`,
    `Components: sign=${value.sign}, mantissa=${value.mantissa}, scale=${value.scale}, exp10=${value.exp10}`
  ].join('\n');
}
