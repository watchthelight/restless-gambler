// src/utils/errors.ts
import { jsonStringifySafeBigint } from './json.js';

const REDACT_PATTERNS = [
  /(bot|discord|token|secret)=([A-Za-z0-9._-]+)/gi,
  /Authorization:\s*Bot\s+[A-Za-z0-9._-]+/gi,
  /D:\\restless-gambler\\[^\\\n]+/gi, // trim absolute local paths in user output
];

export function redact(s: string): string {
  let out = s;
  for (const re of REDACT_PATTERNS) out = out.replace(re, (_m, k) => `${k}=***`);
  return out;
}

export function shortStack(err: unknown, lines = 3): string {
  const st = typeof err === 'object' && err && 'stack' in err ? String((err as any).stack) : '';
  if (!st) return '';
  const parts = st.split('\n').slice(0, lines + 1);
  return parts.join('\n');
}

export function normalizeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message || 'unknown',
      stack: err.stack || '',
    };
  }
  return {
    name: typeof err,
    message: String(err),
    stack: '',
  };
}

export function buildErrorId(): string {
  // tiny, non-crypto id for correlating logs ↔ user reply
  return Math.random().toString(36).slice(2, 10);
}

export function logError(ctx: Record<string, unknown>, err: unknown) {
  const info = normalizeError(err);
  const payload = { level: 'error', ...ctx, error: info } as const;
  // eslint-disable-next-line no-console
  console.error(redact(jsonStringifySafeBigint(payload)));
}

export function formatUserError(command: string, err: unknown, isAdmin: boolean, errorId: string): string {
  const info = normalizeError(err);
  const stack = shortStack(err, isAdmin ? 6 : 2);
  const base =
    `❌ **${command}** failed\n` +
    `• **Type:** ${info.name}\n` +
    `• **Message:** ${redact(info.message)}\n` +
    `• **Error ID:** \`${errorId}\``;

  if (stack) {
    const safeStack = redact(stack)
      .replaceAll('file:///', '') // tidy ESM paths
      .replaceAll(process.cwd(), '.');
    return isAdmin ? `${base}\n\`\`\`\n${safeStack}\n\`\`\`` : base;
  }
  return base;
}

