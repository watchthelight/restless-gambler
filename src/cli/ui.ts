import fs from 'node:fs';
import path from 'node:path';
import boxen from 'boxen';
import chalk, { Chalk } from 'chalk';
import gradient from 'gradient-string';
import figlet from 'figlet';
import ora from 'ora';
import logSymbols from 'log-symbols';
import prettyMs from 'pretty-ms';
import cliProgress from 'cli-progress';
import { getPalette } from './theme.js';
import { isTestEnv } from '../util/env.js';

type Spinner = ReturnType<typeof ora> & {
  succeed: (text?: string) => Spinner;
  fail: (text?: string) => Spinner;
  warn: (text?: string) => Spinner;
  info: (text?: string) => Spinner;
};

function isInteractive() {
  return process.stdout.isTTY && !process.env.CI && process.env.QUIET !== '1' && !process.argv.includes('--quiet');
}

const palette = getPalette();
const noColor = !!process.env.NO_COLOR || process.argv.includes('--no-color') || !isInteractive();
const c = new Chalk({ level: noColor ? 0 : 3 });

let bannerPrinted = false;

function banner() {
  if (process.argv.includes('--banner=off') || process.env.CLI_BANNER === 'off' || process.env.CLI_BANNER === '0') return;
  if (bannerPrinted) return;
  bannerPrinted = true;
  try {
    const text = figlet.textSync('Restless Gambler', { font: 'Standard' });
    const gr = gradient(palette.gradient);
    const title = gr.multiline(text);
    const version = safeReadPkgVersion();
    const mode = process.env.NODE_ENV === 'production' ? 'Production' : 'Development';
    const nodev = process.version;
    const body = `${title}\n\n${c.dim('v' + version)}  ${c.dim(nodev)}  ${c.dim(mode)}`;
    const box = boxen(body, { padding: 1, borderColor: 'cyan', borderStyle: 'round' });
    if (isInteractive()) console.log(box);
  } catch { }
}

function safeReadPkgVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}

function say(msg: string, style: 'info' | 'success' | 'warn' | 'error' | 'dim' | 'title' = 'info') {
  // Keep Jest runs clean
  if (isTestEnv()) return;
  if ((process.env.QUIET === '1' || process.argv.includes('--quiet')) && style !== 'dim') return;
  let out = msg;
  switch (style) {
    case 'success': out = `${logSymbols.success} ${palette.success(msg)}`; break;
    case 'warn': out = `${logSymbols.warning} ${palette.warn(msg)}`; break;
    case 'error': out = `${logSymbols.error} ${palette.error(msg)}`; break;
    case 'dim': out = palette.dim(msg); break;
    case 'title': out = c.bold(palette.info(msg)); break;
    default: out = `${logSymbols.info} ${palette.info(msg)}`; break;
  }
  console.log(out);
}

function step(title: string): Spinner {
  const spinner = ora({ text: title, isEnabled: isInteractive() && !noColor });
  return spinner as Spinner;
}

function bar(total: number, label = 'Progress') {
  const bar = new cliProgress.SingleBar(
    {
      format: `${c.cyan(label)} {bar} {value}/{total}`,
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic,
  );
  if (isInteractive()) bar.start(total, 0);
  return {
    tick: (n = 1) => { try { bar.increment(n); } catch { } },
    update: (v: number) => { try { bar.update(v); } catch { } },
    stop: () => { try { bar.stop(); } catch { } },
  };
}

function table(rows: Array<Record<string, string | number>>, opts?: { headerStyle?: (s: string) => string }) {
  if (!rows || rows.length === 0) return console.log('(none)');
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length)));
  const headerLine = headers
    .map((h, i) => (opts?.headerStyle ? opts.headerStyle(h.padEnd(widths[i])) : c.bold(h.padEnd(widths[i]))))
    .join('  ');
  console.log(headerLine);
  for (const r of rows) {
    console.log(headers.map((h, i) => String(r[h] ?? '').padEnd(widths[i])).join('  '));
  }
}

async function timed<T>(label: string, fn: () => Promise<T>) {
  const s = step(label).start();
  const start = Date.now();
  try {
    const res = await fn();
    s.succeed(`${label} ${c.gray('(' + prettyMs(Date.now() - start) + ')')}`);
    return res;
  } catch (e: any) {
    s.fail(`${label} ${c.gray('(' + prettyMs(Date.now() - start) + ')')} - ${palette.error(String(e?.message || e))}`);
    throw e;
  }
}

export const ui = { banner, say, step, bar, table, timed };
export default ui;
