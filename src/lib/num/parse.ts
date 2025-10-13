/**
 * Amount parsing with suffix support (k → centillion)
 * Handles human-friendly input like "1.5k", "2qa", "10ce", scientific notation, etc.
 */

import { HugeDecimal } from './Huge.js';

// ============================================================================
// Suffix definitions (short-scale system)
// ============================================================================

export interface SuffixUnit {
  /** Power of 10 (e.g., 3 for thousand, 303 for centillion) */
  power: number;
  /** Short code (e.g., "k", "m", "qa", "ce") */
  code: string;
  /** Full word (e.g., "thousand", "quadrillion", "centillion") */
  word: string;
}

/**
 * Build the complete suffix table up to centillion (10^303)
 * Includes: k, m, b, t, qa, qi, sx, sp, oc, no, de, ... ce
 */
function buildSuffixTable(): SuffixUnit[] {
  const units: SuffixUnit[] = [];

  // Basic units: k=10^3 through de=10^33
  const BASIC: Array<[number, string, string]> = [
    [1, 'k', 'thousand'],
    [2, 'm', 'million'],
    [3, 'b', 'billion'],
    [4, 't', 'trillion'],
    [5, 'qa', 'quadrillion'],
    [6, 'qi', 'quintillion'],
    [7, 'sx', 'sextillion'],
    [8, 'sp', 'septillion'],
    [9, 'oc', 'octillion'],
    [10, 'no', 'nonillion'],
    [11, 'de', 'decillion']
  ];

  for (const [n, code, word] of BASIC) {
    units.push({ power: n * 3, code, word });
  }

  // Latin prefixes for ones place (1-9)
  const ONES_PREFIX: Record<number, [string, string]> = {
    1: ['u', 'un'],
    2: ['d', 'duo'],
    3: ['t', 'tre'],
    4: ['qa', 'quattuor'],
    5: ['qn', 'quin'],
    6: ['sx', 'sex'],
    7: ['sp', 'septen'],
    8: ['oc', 'octo'],
    9: ['nv', 'novem']
  };

  // Latin prefixes for tens place
  const TENS_PREFIX: Record<number, [string, string]> = {
    1: ['d', 'decillion'],    // Already added above as 11
    2: ['vg', 'vigintillion'],
    3: ['tg', 'trigintillion'],
    4: ['qg', 'quadragintillion'],
    5: ['qng', 'quinquagintillion'],
    6: ['sxg', 'sexagintillion'],
    7: ['spg', 'septuagintillion'],
    8: ['ocg', 'octogintillion'],
    9: ['nvg', 'nonagintillion']
  };

  // Build 12-19: undecillion, duodecillion, ..., novemdecillion
  for (let ones = 1; ones <= 9; ones++) {
    const [onesCode, onesWord] = ONES_PREFIX[ones];
    const n = 11 + ones; // 12-20
    const code = `${onesCode}d`;
    const word = `${onesWord}decillion`;
    units.push({ power: n * 3, code, word });
  }

  // Build 20-99 by tens
  for (let tens = 2; tens <= 9; tens++) {
    const [tensCode, tensWord] = TENS_PREFIX[tens];
    const n = tens * 10; // 20, 30, ..., 90
    units.push({ power: n * 3, code: tensCode, word: tensWord });

    // Add ones variants: 21-29, 31-39, ..., 91-99
    for (let ones = 1; ones <= 9; ones++) {
      const [onesCode, onesWord] = ONES_PREFIX[ones];
      const idx = tens * 10 + ones;
      const code = `${onesCode}${tensCode}`;
      const word = `${onesWord}${tensWord}`;
      units.push({ power: idx * 3, code, word });
    }
  }

  // Centillion (10^303)
  units.push({ power: 303, code: 'ce', word: 'centillion' });

  // Deduplicate by power (prefer shorter codes)
  const byPower = new Map<number, SuffixUnit>();
  for (const u of units) {
    const existing = byPower.get(u.power);
    if (!existing || u.code.length < existing.code.length) {
      byPower.set(u.power, u);
    }
  }

  return Array.from(byPower.values()).sort((a, b) => a.power - b.power);
}

export const SUFFIX_TABLE: SuffixUnit[] = buildSuffixTable();

// Build fast lookup maps
const CODE_TO_UNIT = new Map<string, SuffixUnit>();
const WORD_TO_UNIT = new Map<string, SuffixUnit>();

for (const u of SUFFIX_TABLE) {
  CODE_TO_UNIT.set(u.code.toLowerCase(), u);
  WORD_TO_UNIT.set(u.word.toLowerCase(), u);
}

// ============================================================================
// Parsing
// ============================================================================

export class AmountParseError extends Error {
  constructor(
    message: string,
    public readonly code: 'bad_number' | 'bad_suffix' | 'negative' | 'too_large',
    public readonly input: string,
    public readonly suggestions?: string[]
  ) {
    super(message);
    this.name = 'AmountParseError';
  }
}

/**
 * Strip separators (underscores, commas, spaces)
 */
function stripSeparators(s: string): string {
  return s.replace(/[_,\s]/g, '');
}

/**
 * Levenshtein distance for typo detection
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

/**
 * Suggest similar suffixes for typos
 */
function suggestSuffixes(input: string, limit = 8): string[] {
  const candidates: string[] = [];
  for (const u of SUFFIX_TABLE) {
    candidates.push(u.code);
    if (u.word !== u.code) candidates.push(u.word);
  }

  const scored = candidates
    .map(w => ({ w, dist: levenshtein(input.toLowerCase(), w.toLowerCase()) }))
    .filter(x => x.dist <= 3)
    .sort((a, b) => a.dist - b.dist || a.w.length - b.w.length);

  return scored.slice(0, limit).map(x => x.w);
}

/**
 * Generate helpful error message with suffix examples
 */
function suffixHelpMessage(badSuffix?: string): string {
  const examples = [
    '1.5k = 1,500',
    '2.75m = 2,750,000',
    '10b = 10,000,000,000',
    '3e12 = 3,000,000,000,000',
    '1ce = centillion (10^303)'
  ];

  let msg = 'Invalid suffix format.\n\n';
  msg += '**Common suffixes:**\n';
  msg += 'k=thousand, m=million, b=billion, t=trillion\n';
  msg += 'qa=quadrillion, qi=quintillion, sx=sextillion, sp=septillion\n';
  msg += 'oc=octillion, no=nonillion, de=decillion, ce=centillion\n\n';
  msg += '**Examples:**\n';
  msg += examples.map(ex => `• ${ex}`).join('\n');

  if (badSuffix) {
    const suggestions = suggestSuffixes(badSuffix);
    if (suggestions.length > 0) {
      msg += `\n\n**Did you mean:** ${suggestions.slice(0, 5).join(', ')}?`;
    }
  }

  return msg;
}

export interface ParseAmountOptions {
  /** Maximum power of 10 allowed (default: 303 = centillion) */
  maxPower?: number;
  /** Allow negative values (default: false) */
  allowNegative?: boolean;
}

/**
 * Parse human-friendly amount strings into HugeDecimal
 *
 * Supports:
 * - Plain integers: "12345678901234567890"
 * - Decimals: "12.5", "0.001"
 * - Scientific notation: "1e12", "3.14e-5"
 * - Suffix notation: "1.5k", "2qa", "10ce"
 * - Combinations: "1.5e6", "2.5m"
 *
 * @throws AmountParseError with helpful suggestions
 */
export function parseAmount(input: string | number | bigint, opts: ParseAmountOptions = {}): HugeDecimal {
  const maxPower = opts.maxPower ?? 303;
  const allowNegative = opts.allowNegative ?? false;

  // Handle non-string inputs
  if (typeof input === 'bigint') {
    return HugeDecimal.fromBigInt(input);
  }
  if (typeof input === 'number') {
    return HugeDecimal.fromNumber(input);
  }

  const raw = String(input).trim();
  if (!raw) {
    throw new AmountParseError('Empty input', 'bad_number', raw);
  }

  // Check for negative
  const isNegative = raw.startsWith('-');
  if (isNegative && !allowNegative) {
    throw new AmountParseError('Negative amounts not allowed', 'negative', raw);
  }

  const s = stripSeparators(isNegative ? raw.slice(1) : raw).toLowerCase();

  // Try scientific notation first: 1.23e45 or 1e12
  const sciMatch = s.match(/^(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/);
  if (sciMatch) {
    const [, mantissaStr, expStr] = sciMatch;
    const hd = HugeDecimal.fromString(`${mantissaStr}e${expStr}`);
    return isNegative ? hd.negate() : hd;
  }

  // Try suffix notation: 123.45k or 10qa
  const suffixMatch = s.match(/^(\d+(?:\.\d+)?)([a-z]+)?$/);
  if (!suffixMatch) {
    throw new AmountParseError(
      `Invalid number format: ${raw}\n\n` + suffixHelpMessage(),
      'bad_number',
      raw
    );
  }

  const [, numPart, suffixPart = ''] = suffixMatch;

  let power = 0;
  if (suffixPart) {
    // Look up suffix
    const unit = CODE_TO_UNIT.get(suffixPart) || WORD_TO_UNIT.get(suffixPart);
    if (!unit) {
      throw new AmountParseError(
        suffixHelpMessage(suffixPart),
        'bad_suffix',
        raw,
        suggestSuffixes(suffixPart)
      );
    }

    power = unit.power;

    if (power > maxPower) {
      throw new AmountParseError(
        `Amount too large (max: 10^${maxPower})`,
        'too_large',
        raw
      );
    }
  }

  // Parse the numeric part
  let hd = HugeDecimal.fromString(numPart);

  // Apply suffix power
  if (power > 0) {
    hd = hd.mulPow10(BigInt(power));
  }

  return isNegative ? hd.negate() : hd;
}

/**
 * Parse and validate amount is positive
 */
export function parsePositiveAmount(input: string | number | bigint, opts: ParseAmountOptions = {}): HugeDecimal {
  const hd = parseAmount(input, opts);
  if (!hd.isPositive()) {
    throw new AmountParseError('Amount must be positive', 'negative', String(input));
  }
  return hd;
}

/**
 * Get all suffix codes for autocomplete/help
 */
export function getAllSuffixCodes(): string[] {
  return SUFFIX_TABLE.map(u => u.code);
}

/**
 * Get all suffix words for help text
 */
export function getAllSuffixWords(): string[] {
  return SUFFIX_TABLE.map(u => u.word);
}

/**
 * Get suffix unit by power
 */
export function getSuffixByPower(power: number): SuffixUnit | undefined {
  return SUFFIX_TABLE.find(u => u.power === power);
}
