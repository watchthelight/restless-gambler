import { parseHumanAmount, fmtCoinsBigInt } from './amount.js';

describe('parseHumanAmount', () => {
  test('parses plain integers and separators', () => {
    const r0 = parseHumanAmount('0');
    expect((r0 as any).value).toBe(0n);
    const r1 = parseHumanAmount('123');
    expect((r1 as any).value).toBe(123n);
    const r2 = parseHumanAmount('1_000');
    expect((r2 as any).value).toBe(1000n);
    const r3 = parseHumanAmount('3,500');
    expect((r3 as any).value).toBe(3500n);
  });
  test('parses k/m/b/t suffixes', () => {
    expect((parseHumanAmount('1k') as any).value).toBe(1_000n);
    expect((parseHumanAmount('1m') as any).value).toBe(1_000_000n);
    expect((parseHumanAmount('1b') as any).value).toBe(1_000_000_000n);
    expect((parseHumanAmount('1t') as any).value).toBe(1_000_000_000_000n);
  });
  test('parses extended short codes', () => {
    expect((parseHumanAmount('2.5qa') as any).value).toBe(2_500_000_000_000_000n);
    expect((parseHumanAmount('10 qi') as any).value).toBe(10_000_000_000_000_000_000n);
    expect((parseHumanAmount('0.75t') as any).value).toBe(750_000_000_000n);
  });
  test('parses full words (case/spacing-insensitive)', () => {
    expect((parseHumanAmount('1 million') as any).value).toBe(1_000_000n);
    expect((parseHumanAmount('2 Quintillion') as any).value).toBe(2_000_000_000_000_000_000n);
  });
  test('rejects negatives and invalid', () => {
    expect(parseHumanAmount('-1')).toEqual({ code: 'negative', raw: '-1' });
    expect((parseHumanAmount('abc') as any).code).toBe('bad_number');
  });
  test('normalized formatting symmetry', () => {
    const ok = parseHumanAmount('1b');
    expect('value' in ok && (ok as any).normalized).toBe('1,000,000,000');
    expect(fmtCoinsBigInt((ok as any).value)).toBe('1,000,000,000');
  });
});
