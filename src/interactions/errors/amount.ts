import type { ParseAmountErr } from '../../lib/amount.js';

export function amountErrorEmbed(err: ParseAmountErr, ctx: { command: string }) {
  const base: any = {
    title: 'Invalid amount',
    color: 0xE53935,
    fields: [] as any[],
    description: ''
  };

  if (err.code === 'bad_suffix') {
    base.description = `Unknown suffix in \`${err.raw}\`. Use: k, m, b, t, qa (quadrillion), qi (quintillion), sx, sp, oc, no, dc, …, ct (centillion).`;
    if (err.suggestions.length) base.fields.push({ name: 'Did you mean', value: err.suggestions.map((s) => `\`${s}\``).join('  ') });
  } else if (err.code === 'bad_number') {
    base.description = `Could not read a number from \`${err.raw}\`.`;
  } else if (err.code === 'negative') {
    base.description = `Amount must be positive. You sent \`${err.raw}\`.`;
  } else if (err.code === 'too_large') {
    base.description = `Amount exceeds the supported maximum (\`10^${err.maxPower}\`).`;
  }

  base.fields.push({ name: 'Examples', value: '`1b`, `2.5m`, `750k`, `10 qa`, `1_000`, `3,500`, `0.75t`' });
  return base;
}

