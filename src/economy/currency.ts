export const CURRENCY_NAME = "Bolts";
export const CURRENCY_EMOJI = "🔩"; // :nut_and_bolt:
export const DECIMALS = 0;

function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1000) return new Intl.NumberFormat().format(n);
  const units = [
    { v: 1e12, s: 't' },
    { v: 1e9, s: 'b' },
    { v: 1e6, s: 'm' },
    { v: 1e3, s: 'k' },
  ];
  for (const u of units) {
    if (abs >= u.v) return `${(n / u.v).toFixed(1).replace(/\.0$/, '')}${u.s}`;
  }
  return new Intl.NumberFormat().format(n);
}

export function formatBolts(n: number, opts?: { compact?: boolean }): string {
  const str = opts?.compact ? compactNumber(n) : new Intl.NumberFormat().format(n);
  return `${str} ${CURRENCY_EMOJI}`;
}

