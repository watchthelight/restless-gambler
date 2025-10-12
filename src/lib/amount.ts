// Human amount parsing/formatting — single source of truth
// Accepts inputs like: 2.5m, 1b, 750k, 10 qa, 1 ct, 1_000, 3,500, 0.75t
// Generates helpful errors with suggestions.

import { formatExact } from '../util/formatBalance.js';
import { logError, logInfo } from '../utils/logger.js';

export type ParseAmountOk = {
  value: bigint;        // floor(decimal * 10^power) as BigInt coins
  power: number;        // exponent of 10 (e.g., 9 for "b")
  normalized: string;   // "1b" -> "1,000,000,000"
  raw: string;          // original input
};

export type ParseAmountErr =
  | { code: 'bad_number'; raw: string }
  | { code: 'bad_suffix'; raw: string; suggestions: string[] }
  | { code: 'negative'; raw: string }
  | { code: 'too_large'; raw: string; maxPower: number };

export class AmountParseError extends Error {
  err: ParseAmountErr;
  constructor(err: ParseAmountErr) {
    super(err.code);
    this.name = 'AmountParseError';
    this.err = err;
  }
}

// Short-scale name fragments for programmatic generation
const ONES = [
  '', // 0 unused
  'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion', 'sextillion', 'septillion', 'octillion', 'nonillion',
  'decillion',
];

const TEN_BASES: Record<number, { word: string; code: string }> = {
  10: { word: 'decillion', code: 'dc' },
  20: { word: 'vigintillion', code: 'vg' },
  30: { word: 'trigintillion', code: 'tr' },
  40: { word: 'quadragintillion', code: 'qg' },
  50: { word: 'quinquagintillion', code: 'qng' },
  60: { word: 'sexagintillion', code: 'sxg' },
  70: { word: 'septuagintillion', code: 'spg' },
  80: { word: 'octogintillion', code: 'ocg' },
  90: { word: 'nonagintillion', code: 'nvg' },
  100: { word: 'centillion', code: 'ct' },
};

const ONES_PREFIX: Record<number, { word: string; code: string }> = {
  1: { word: 'un', code: 'u' },
  2: { word: 'duo', code: 'd' },
  3: { word: 'tre', code: 't' },
  4: { word: 'quattuor', code: 'qa' },
  5: { word: 'quin', code: 'qn' },
  6: { word: 'sex', code: 'sx' },
  7: { word: 'septen', code: 'sp' },
  8: { word: 'octo', code: 'oc' },
  9: { word: 'novem', code: 'nv' },
};

// k/m/b/t helpers
const BASIC_CODES: Record<number, { code: string; word: string }> = {
  1: { code: 'k', word: 'thousand' },
  2: { code: 'm', word: 'million' },
  3: { code: 'b', word: 'billion' },
  4: { code: 't', word: 'trillion' },
  5: { code: 'qa', word: 'quadrillion' },
  6: { code: 'qi', word: 'quintillion' },
  7: { code: 'sx', word: 'sextillion' },
  8: { code: 'sp', word: 'septillion' },
  9: { code: 'oc', word: 'octillion' },
  10: { code: 'no', word: 'nonillion' },
  11: { code: 'dc', word: 'decillion' },
};

type Unit = { power: number; code: string; word: string };

function buildUnits(): Unit[] {
  const units: Unit[] = [];
  // 10^3 .. 10^12 (k,m,b,t)
  for (let n = 1; n <= 11; n++) {
    const basic = BASIC_CODES[n as keyof typeof BASIC_CODES];
    if (!basic) break;
    units.push({ power: n * 3, code: basic.code, word: basic.word });
  }
  // 11 already included as decillion above
  // 12..19 (undecillion..novemdecillion)
  for (let ones = 1; ones <= 9; ones++) {
    const pref = ONES_PREFIX[ones];
    if (!pref) continue;
    const n = 10 + ones; // index in -illion series
    const power = n * 3;
    const code = `${pref.code}d`;
    const word = `${pref.word}decillion`;
    units.push({ power, code, word });
  }
  // 20..99 by tens with prefixes 1..9
  for (let tens = 20; tens <= 90; tens += 10) {
    const base = TEN_BASES[tens];
    if (!base) continue;
    // bare tens (e.g., vigintillion)
    const index = tens; // index in -illion names (e.g., 20 => 20)
    units.push({ power: index * 3, code: base.code, word: base.word });
    for (let ones = 1; ones <= 9; ones++) {
      const pref = ONES_PREFIX[ones];
      if (!pref) continue;
      const idx = tens + ones;
      const code = `${pref.code}${base.code}`;
      const word = `${pref.word}${base.word}`;
      units.push({ power: idx * 3, code, word });
    }
  }
  // 100 (centillion)
  units.push({ power: 303, code: 'ct', word: 'centillion' });

  // Deduplicate any accidental overlaps by power then code preference
  const byPower = new Map<number, Unit>();
  for (const u of units) {
    const prev = byPower.get(u.power);
    if (!prev) byPower.set(u.power, u);
    else if (prev.code.length > u.code.length) byPower.set(u.power, u);
  }
  return Array.from(byPower.values()).sort((a, b) => a.power - b.power);
}

const ALL_UNITS: Unit[] = buildUnits();
const CODE_TO_POWER = new Map<string, number>();
const WORD_TO_POWER = new Map<string, number>();
for (const u of ALL_UNITS) {
  CODE_TO_POWER.set(u.code, u.power);
  WORD_TO_POWER.set(u.word, u.power);
}

function stripSeparators(s: string): string {
  return s.replace(/[_,\s\u2009,]/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function suggestSuffixes(s: string, limit = 8): string[] {
  const options = new Set<string>();
  for (const u of ALL_UNITS) { options.add(u.code); options.add(u.word); }
  const cand = Array.from(options);
  const scored = cand.map((w) => ({ w, d: levenshtein(s, w) }))
    .filter((x) => x.d <= 2)
    .sort((a, b) => (a.d - b.d) || a.w.length - b.w.length || a.w.localeCompare(b.w));
  return scored.slice(0, limit).map((x) => x.w);
}

export function parseHumanAmount(
  input: string,
  opts?: { maxPower?: number },
): ParseAmountOk | ParseAmountErr {
  const raw = String(input ?? '');
  const s0 = raw.trim();
  if (!s0) return { code: 'bad_number', raw };
  if (/^-/.test(s0)) return { code: 'negative', raw };
  const s = stripSeparators(s0).toLowerCase();
  const m = s.match(/^([0-9]+)(?:\.([0-9]+))?([a-z]+)?$/i);
  if (!m) return { code: 'bad_number', raw };
  const [, iPart, fPartRaw = '', sufRaw = '' ] = m;

  const maxPower = opts?.maxPower ?? 303;

  let power = 0;
  if (sufRaw) {
    const suf = sufRaw.toLowerCase();
    // direct codes
    if (suf.length <= 4 && CODE_TO_POWER.has(suf)) {
      power = CODE_TO_POWER.get(suf)!;
    } else {
      // try words (ignore hyphens/spaces)
      const w = suf.replace(/[\s-]/g, '');
      if (WORD_TO_POWER.has(w)) power = WORD_TO_POWER.get(w)!;
      else {
        const suggestions = suggestSuffixes(suf);
        return { code: 'bad_suffix', raw, suggestions };
      }
    }
    if (power > maxPower) return { code: 'too_large', raw, maxPower };
  }

  // Compute floor((iPart.fPart) * 10^power)
  const i = BigInt(iPart);
  if (!fPartRaw) {
    const value = i * 10n ** BigInt(power);
    return { value, power, normalized: formatExact(value), raw };
  }
  // with decimals
  const fDigits = fPartRaw.replace(/[^0-9]/g, '');
  // Shift decimals into integer space
  const fracLen = BigInt(fDigits.length);
  const scale = BigInt(power) - fracLen;
  const frac = BigInt(fDigits);
  let value: bigint;
  if (scale >= 0) value = i * 10n ** BigInt(power) + (frac * 10n ** scale);
  else {
    // Decimal precision exceeds power; floor by dropping extra digits
    const drop = Number(-scale);
    const kept = fDigits.slice(0, fDigits.length - drop) || '0';
    const keptVal = BigInt(kept);
    const keptScale = BigInt(power) - BigInt(kept.length);
    value = i * 10n ** BigInt(power) + (keptVal * 10n ** keptScale);
  }
  return { value, power, normalized: formatExact(value), raw };
}

// Display exact integer with commas (symmetric to parse's normalized)
export function fmtCoinsBigInt(v: bigint): string {
  return formatExact(v);
}

// Back-compat alias used around the codebase
export const fmtCoins = fmtCoinsBigInt;
