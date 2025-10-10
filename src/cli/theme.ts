import chalk, { Chalk } from 'chalk';

export type Palette = {
  gradient: [string, string];
  info: (s: string) => string;
  success: (s: string) => string;
  warn: (s: string) => string;
  error: (s: string) => string;
  dim: (s: string) => string;
};

const base = (noColor: boolean) => {
  const c = new Chalk({ level: noColor ? 0 : 3 });
  return c;
};

export function getPalette() {
  const noColor = !!process.env.NO_COLOR || process.argv.includes('--no-color');
  const c = base(noColor);
  const theme = (process.env.CLI_THEME || 'neo').toLowerCase();
  if (theme === 'mono') {
    return {
      gradient: ['#777777', '#bbbbbb'] as [string, string],
      info: c.white,
      success: c.white,
      warn: c.white,
      error: c.white,
      dim: c.gray,
    } as Palette;
  }
  if (theme === 'solarized') {
    return {
      gradient: ['#268bd2', '#2aa198'],
      info: c.cyan,
      success: c.green,
      warn: c.yellow,
      error: c.red,
      dim: c.gray,
    } as Palette;
  }
  // neo (default): neon blue/indigo
  return {
    gradient: ['#00d4ff', '#3b5bdb'],
    info: c.cyan,
    success: c.green,
    warn: c.yellow,
    error: c.red,
    dim: c.gray,
  } as Palette;
}
