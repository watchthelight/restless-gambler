import chalk from 'chalk';
import dayjs from 'dayjs';
import { jsonStringifySafeBigint } from './json.js';

type LogCtx = {
  guild?: { id?: string; name?: string };
  channel?: { id?: string; name?: string };
  user?: { id?: string; tag?: string };
  command?: string;
  sub?: string;
  ok?: boolean;
  ms?: number;
};

const ts = () => dayjs().format('YYYY-MM-DD HH:mm:ss');

function where(ctx?: LogCtx) {
  const g = ctx?.guild?.name ?? ctx?.guild?.id ?? '–';
  const c = ctx?.channel?.name ?? ctx?.channel?.id ?? '–';
  const u = ctx?.user?.tag ?? ctx?.user?.id ?? '–';
  return `${chalk.gray('@')}${chalk.cyan(u)} ${chalk.gray('in')} ${chalk.magenta(g)}${chalk.gray('#')}${chalk.magenta(c)}`;
}

export function logInfo(msg: string, ctx?: LogCtx, extra?: unknown) {
  const head = `${chalk.gray(ts())} ${chalk.green('●')} ${chalk.bold.green(msg)}`;
  const tail = ctx ? ` ${chalk.dim('[')}${where(ctx)}${chalk.dim(']')}` : '';
  console.log(head + tail);
  if (extra !== undefined) console.log(chalk.dim(jsonStringifySafeBigint(extra)));
}

export function logWarn(msg: string, ctx?: LogCtx, extra?: unknown) {
  const head = `${chalk.gray(ts())} ${chalk.yellow('▲')} ${chalk.bold.yellow(msg)}`;
  const tail = ctx ? ` ${chalk.dim('[')}${where(ctx)}${chalk.dim(']')}` : '';
  console.warn(head + tail);
  if (extra !== undefined) console.warn(chalk.yellow(jsonStringifySafeBigint(extra)));
}

export function logError(msg: string, ctx?: LogCtx, err?: unknown & { stack?: string }) {
  const head = `${chalk.gray(ts())} ${chalk.red('✖')} ${chalk.bold.bgRed.white(' ERROR ')} ${chalk.bold.red(msg)}`;
  const tail = ctx ? ` ${chalk.dim('[')}${where(ctx)}${chalk.dim(']')}` : '';
  console.error(head + tail);

  // Extreme verbosity for errors
  if (err) {
    try {
      const payload: any = { kind: typeof err };
      if (err && typeof err === 'object') {
        Object.assign(payload, err);
      }
      // Avoid secrets: scrub common keys
      for (const k of ['token','clientSecret','password','authorization']) if (payload[k]) payload[k] = '[redacted]';

      console.error(chalk.red('• details:'));
      console.error(chalk.red(jsonStringifySafeBigint(payload)));
      if ((err as any).stack) {
        console.error(chalk.red('• stack:'));
        console.error(chalk.red((err as any).stack));
      }
      if ((err as any).cause) {
        console.error(chalk.red('• cause:'));
        console.error(chalk.red(jsonStringifySafeBigint((err as any).cause)));
      }
    } catch {
      // fallback
      console.error(chalk.red(String(err)));
    }
  }
}

export function logCmdStart(ctx: LogCtx) {
  const name = ctx.sub ? `${ctx.command} ${chalk.gray('/')} ${ctx.sub}` : ctx.command ?? 'command';
  logInfo(`/${name} invoked`, ctx);
}

export function logCmdEnd(ctx: LogCtx) {
  const name = ctx.sub ? `${ctx.command} ${chalk.gray('/')} ${ctx.sub}` : ctx.command ?? 'command';
  const ms = typeof ctx.ms === 'number' ? ` ${chalk.dim(`(${ctx.ms}ms)`)}` : '';
  if (ctx.ok) logInfo(`/${name} finished ✅`, ctx, { durationMs: ctx.ms });
  else logWarn(`/${name} finished with no output${ms}`, ctx);
}

export function logBlocked(msg: string, ctx: LogCtx) {
  const name = ctx.sub ? `${ctx.command} ${chalk.gray('/')} ${ctx.sub}` : ctx.command ?? 'command';
  logWarn(`/${name} blocked: ${msg}`, ctx);
}
