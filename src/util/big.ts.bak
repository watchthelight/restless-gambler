/**
 * BigInt utilities for safe parsing and operations
 */

export function toBigIntStrict(v: string | number | bigint): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('invalid_number');
    return BigInt(Math.trunc(v));
  }
  // String: remove formatting characters
  const cleaned = String(v).replace(/[_ ,]/g, '');
  if (!/^-?\d+$/.test(cleaned)) throw new Error('invalid_bigint_string');
  return BigInt(cleaned);
}

/**
 * Format BigInt with comma separators, no decimals
 */
export function formatExact(bal: bigint): string {
  const neg = bal < 0n ? '-' : '';
  let s = (neg ? -bal : bal).toString();
  s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return neg + s;
}

/**
 * Pretty format with suffixes using string math (no floats)
 */
const STEPS = [
  { p: 0, s: '' },
  { p: 3, s: 'k' },
  { p: 6, s: 'm' },
  { p: 9, s: 'b' },
  { p: 12, s: 't' },
  { p: 15, s: 'qa' },
  { p: 18, s: 'qi' },
  { p: 21, s: 'sx' },
  { p: 24, s: 'sp' },
  { p: 27, s: 'oc' },
  { p: 30, s: 'no' },
];

export function formatBalancePretty(b: bigint, decimals = 2): string {
  const neg = b < 0n;
  let v = neg ? -b : b;

  if (v < 1000n) return (neg ? '-' : '') + v.toString();

  const s = v.toString();
  const len = s.length;
  const stepIndex = Math.min(Math.floor((len - 1) / 3), STEPS.length - 1);
  const step = STEPS[stepIndex];

  const cut = len - step.p;
  let whole = s.slice(0, cut);
  const intDigits = whole.length;

  // Determine decimal places based on integer digits: 1 digit = 2dp, 2 digits = 1dp, 3+ digits = 0dp
  const actualDecimals = intDigits === 1 ? 2 : intDigits === 2 ? 1 : 0;

  const frac = s.slice(cut, cut + actualDecimals + 1).padEnd(actualDecimals + 1, '0');

  let mant = whole;
  if (actualDecimals > 0) {
    let main = frac.slice(0, actualDecimals);
    const roundDigit = frac[actualDecimals];

    // Round up if needed
    if (roundDigit >= '5') {
      let rounded = (BigInt(main || '0') + 1n).toString().padStart(actualDecimals, '0');
      if (rounded.length > actualDecimals) {
        // Carry over to whole
        mant = (BigInt(whole) + 1n).toString();
        main = '0'.repeat(actualDecimals);
      } else {
        main = rounded;
      }
    }
    mant += '.' + main;
  }

  return (neg ? '-' : '') + mant + step.s;
}
