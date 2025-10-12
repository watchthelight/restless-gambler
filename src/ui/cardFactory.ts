/* eslint-disable @typescript-eslint/no-var-requires */
import { Theme } from './theme.js';
import { iconBuffer, IconName } from './icons.js';
import { formatBolts } from '../economy/currency.js';
import './fonts.js';
import { themedEmbed } from './embeds.js';
import { getGuildTheme } from './theme.js';
import { getClient } from '../bot/client.js';
import type { TextChannel } from 'discord.js';

type GameResultPayload =
  | { kind: 'slots'; grid: string[][]; bet: number; payout: number; delta: number; balance: number | bigint }
  | { kind: 'roulette'; number: number; color: string; bet: number; payout: number; delta: number; balance: number | bigint }
  | { kind: 'blackjack'; dealer: string[]; player: string[]; bet: number; payout: number; delta: number; balance: number | bigint }
  | { kind: 'holdem'; board: string[]; hero: string[]; bet: number; delta: number; balance: number | bigint };

type ListPayload = { rows: { rank: number; user: string; value: number }[] };
type NoticePayload = { title: string; message: string };

type WalletPayload = { balance: number | bigint; title?: string; subtitle?: string };

type SyncPayload = { globalCount: number; perGuild: Array<{ guildId: string; purged: number }>; purgedGlobal?: number };

type LoanView = {
  id: string;
  principal: bigint;
  aprBps: number;
  termDays: number;
  status: 'active' | 'paid' | 'late';
  remaining: bigint;
  dueAtTs?: number;
};

type LoanDetailsPayload = {
  loans: LoanView[];
  creditScore?: number;
  fmt: {
    pretty: (b: bigint) => string;
    exactSmall: (b: bigint) => string;
    percent: (bps: number) => string;
    relDue: (ts?: number) => string;
    absDue: (ts?: number) => string;
  };
};

export type CardOpts =
  | { layout: 'GameResult'; theme: Theme; payload: GameResultPayload }
  | { layout: 'List'; theme: Theme; payload: ListPayload }
  | { layout: 'Notice'; theme: Theme; payload: NoticePayload }
  | { layout: 'Wallet'; theme: Theme; payload: WalletPayload }
  | { layout: 'Sync'; theme: Theme; payload: SyncPayload }
  | { layout: 'LoanDetails'; theme: Theme; payload: LoanDetailsPayload };

export async function generateCard(opts: CardOpts): Promise<{ buffer: Buffer; filename: string }> {
  const filename = `${opts.layout.toLowerCase()}-${Date.now()}.png`;
  const tiny = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABUUlEQVR4Xu3a0Q2CMBBF0RFuG3mM1K9Y3bXG7uWgB2Q5Fj0mE0xqJ7R3n2p6mI5rE1o2J7X9mM1e2iQz8S3QmB5uK3wT8C9Q/8fQPqU7x2b2zM3PxUQ0Ck3qT5ep7pQJm6mKQ3fN1EJf+e4jL6QvM9y7cQnQF9dzz2qK5J8m8t3Q6A5h3g0RZQm2mJwqk3a4k6kJ8m8p1QKXrQw1o7m2IcwzF3jPqj+4b5Wg1gY5l2o7r0eKx1e3QkQbW4A0vQn9Q8O1gM3M8u6PpQKc1zF7g4Wg3Yq7G9oF+3m8Q0q2k2kJmQY8b2o3a0b1jprR2Qk0b2g4lqWcAf3UFL0CkqB7gEz5w6t6yZC8t7F/1D7I7fKfS6kA9i5Qq7l8xkK8Y6m4xFZ2D/rb3G5d9wVg3oH3q0gU3Qb0i5f1m6s7lJk2E9k5lU2A9Y2/8R8L7R9aF2o7E2kAAAAASUVORK5CYII=',
    'base64',
  );

  const canvasMod = await tryLoadCanvas();
  if (!canvasMod) {
    return { buffer: tiny, filename };
  }

  try {
    const { createCanvas, loadImage } = canvasMod;
    const width = 960;
    const height = 540;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Background with rounded corners and gradient
    drawRoundedGradient(ctx, 0, 0, width, height, 24, opts.theme.bgGradient[0], opts.theme.bgGradient[1]);

    // Header chrome
    const pad = 24;
    const HEADER_H = 72;
    const titleY = pad + 28;
    ctx.fillStyle = opts.theme.textPrimary;
    ctx.font = '600 24px "Inter", system-ui, Arial';
    try {
      const icon = await loadImage(iconBuffer(headerIconFor(opts)));
      ctx.drawImage(icon, pad, pad, 32, 32);
    } catch {
      // skip icon if load fails
    }
    ctx.fillText(headerTitleFor(opts), pad + 40, titleY);
    // Subtitle reserved line (optional)
    // ctx.font = '400 14px "Inter", system-ui, Arial';
    // ctx.fillText('', pad + 40, titleY + 24);

    // Surface panel
    const panelX = pad;
    const panelY = pad + HEADER_H + 12;
    const panelW = width - pad * 2;
    const panelH = height - panelY - pad;
    ctx.shadowColor = opts.theme.shadowRGBA;
    ctx.shadowBlur = 24;
    drawRoundedRect(ctx, panelX, panelY, panelW, panelH, 24, opts.theme.surface);
    ctx.shadowBlur = 0;

    switch (opts.layout) {
      case 'GameResult':
        renderGameResult(ctx, opts);
        break;
      case 'List':
        renderList(ctx, opts);
        break;
      case 'Notice':
        renderNotice(ctx, opts);
        break;
      case 'Wallet':
        renderWallet(ctx, opts);
        break;
      case 'Sync':
        renderSync(ctx, opts);
        break;
      case 'LoanDetails':
        renderLoanDetails(ctx, opts);
        break;
    }

    const buffer = canvas.toBuffer('image/png');
    return { buffer, filename };
  } catch {
    return { buffer: tiny, filename };
  }
}

async function tryLoadCanvas(): Promise<null | { createCanvas: any; loadImage: any }> {
  try {
    // dynamic import to avoid install-time native dependency requirement
    const mod = await import('canvas');
    return { createCanvas: (mod as any).createCanvas, loadImage: (mod as any).loadImage };
  } catch {
    return null;
  }
}

function drawRoundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawRoundedGradient(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  top: string,
  bottom: string,
) {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  drawRoundedRect(ctx, x, y, w, h, r, grad as any);
}

function headerTitleFor(opts: CardOpts): string {
  if (opts.layout === 'GameResult') {
    switch (opts.payload.kind) {
      case 'slots':
        return 'Slots Result';
      case 'roulette':
        return 'Roulette Result';
      case 'blackjack':
        return 'Blackjack Result';
      case 'holdem':
        return 'Texas Hold’em';
    }
  }
  if (opts.layout === 'List') return 'Top Bolts Holders';
  if (opts.layout === 'Notice') return 'Notice';
  if (opts.layout === 'Wallet') return 'Wallet';
  if (opts.layout === 'Sync') return 'Command Sync';
  if (opts.layout === 'LoanDetails') return 'Loan Details';
  return 'Card';
}

function headerIconFor(opts: CardOpts): IconName {
  if (opts.layout === 'GameResult') {
    switch (opts.payload.kind) {
      case 'slots':
        return 'slot';
      case 'roulette':
        return 'wheel';
      case 'blackjack':
        return 'hearts';
      case 'holdem':
        return 'hearts';
    }
  }
  if (opts.layout === 'List') return 'crown';
  if (opts.layout === 'Notice') return 'warning';
  if (opts.layout === 'Wallet') return 'wallet';
  if (opts.layout === 'Sync') return 'warning';
  if (opts.layout === 'LoanDetails') return 'wallet';
  return 'wallet';
}

function renderGameResult(ctx: any, opts: Extract<CardOpts, { layout: 'GameResult' }>) {
  const { payload, theme } = opts;
  const pad = 24;
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '500 13px "Inter", system-ui';
  ctx.fillText('Summary', pad * 2, pad * 2 + 48);

  // Right rail numbers
  const rightX = 700;
  const baseY = pad * 2 + 80;
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '500 13px "Inter", system-ui';
  ctx.fillText('Bet', rightX, baseY);
  ctx.fillText('Payout', rightX, baseY + 58);
  ctx.fillText('Delta', rightX, baseY + 116);
  ctx.fillText('Balance', rightX, baseY + 174);

  const vals = getGameVals(payload);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 20px "JetBrains Mono", "Cascadia Mono", monospace';
  ctx.fillText(formatBolts(vals.betN), rightX, baseY - 8);
  ctx.fillText(formatBolts(vals.payoutN), rightX, baseY + 50);
  ctx.fillStyle = (vals.deltaN < 0 ? theme.danger : theme.success) as string;
  ctx.fillText(`${vals.deltaN >= 0 ? '+' : ''}${formatBolts(vals.deltaN)}`, rightX, baseY + 108);
  ctx.fillStyle = theme.textPrimary;
  ctx.fillText(formatBolts(vals.balanceN), rightX, baseY + 166);

  // Main panel visualization
  if (payload.kind === 'slots') {
    drawSlotsGrid(ctx, payload.grid, theme, 48, pad * 2 + 60, 580, 360);
  } else if (payload.kind === 'roulette') {
    drawWheel(ctx, payload.number, payload.color, theme, 260, pad * 2 + 160, 180);
  } else if (payload.kind === 'blackjack') {
    drawBJ(ctx, payload.dealer, payload.player, theme, 60, pad * 2 + 90);
  } else if (payload.kind === 'holdem') {
    drawHoldem(ctx, payload.board, payload.hero, theme, 60, pad * 2 + 120);
  }
}

function renderList(ctx: any, opts: Extract<CardOpts, { layout: 'List' }>) {
  const { payload, theme } = opts;
  const startY = 120;
  let y = startY;
  for (const row of payload.rows.slice(0, 10)) {
    // Avatar circle
    const x = 60;
    ctx.fillStyle = '#222a';
    ctx.beginPath();
    ctx.arc(x + 24, y - 12, 24, 0, Math.PI * 2);
    ctx.fill();
    // Name
    ctx.fillStyle = theme.textPrimary;
    ctx.font = '600 16px "Inter", system-ui';
    const name = (row as any).displayName || row.user;
    ctx.fillText(name, x + 56, y - 6);
    // Balance right
    ctx.textAlign = 'right';
    ctx.font = '600 16px "JetBrains Mono", monospace';
    ctx.fillText(formatBolts(row.value), 940, y - 6);
    ctx.textAlign = 'left';
    y += 48;
  }
}

function renderNotice(ctx: any, opts: Extract<CardOpts, { layout: 'Notice' }>) {
  const { payload, theme } = opts;
  ctx.fillStyle = theme.warn;
  ctx.font = '700 20px "Inter", system-ui';
  ctx.fillText(payload.title, 60, 140);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '500 14px "Inter", system-ui';
  wrapText(ctx, payload.message, 60, 180, 880, 24);
}

function renderWallet(ctx: any, opts: Extract<CardOpts, { layout: 'Wallet' }>) {
  const { payload, theme } = opts;
  const title = payload.title || 'Wallet';
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 18px "Inter", system-ui';
  ctx.fillText(title, 60, 140);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '800 56px "Cascadia Mono", monospace';
  ctx.fillText(formatBolts(payload.balance), 60, 210);
  if (payload.subtitle) {
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '500 14px "Inter", system-ui';
    ctx.fillText(payload.subtitle, 60, 250);
  }
}

function renderSync(ctx: any, opts: Extract<CardOpts, { layout: 'Sync' }>) {
  const { payload, theme } = opts;
  let message = `global: ${payload.globalCount}\n`;
  const pg = typeof payload.purgedGlobal === 'number' ? payload.purgedGlobal : 0;
  message += `Purged global: ${pg}\n`;
  if (payload.perGuild.length === 0) {
    message += 'Purged per-guild: none';
  } else {
    message += 'Purged per-guild:\n';
    const shown = payload.perGuild.slice(0, 15);
    message += shown.map(p => `• ${p.guildId} (purged ${p.purged})`).join('\n');
    const extra = payload.perGuild.length - shown.length;
    if (extra > 0) {
      message += `\n... and ${extra} more`;
    }
  }
  message += `\n\nToday at ${new Date().toLocaleTimeString()}`;
  ctx.fillStyle = theme.warn;
  ctx.font = '700 20px "Inter", system-ui';
  ctx.fillText('Command Sync', 60, 140);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '500 14px "Inter", system-ui';
  wrapText(ctx, message, 60, 180, 880, 24);
}

function renderLoanDetails(ctx: any, opts: Extract<CardOpts, { layout: 'LoanDetails' }>) {
  const { payload, theme } = opts;
  let message = '';
  if (payload.loans.length === 0) {
    message = 'No loans on file.';
  } else {
    const shown = payload.loans.slice(0, 10);
    for (const loan of shown) {
      const statusIcon = loan.status === 'late' ? '⚠️ ' : '';
      message += `${statusIcon}Amount: ${payload.fmt.pretty(loan.principal)} (${payload.fmt.exactSmall(loan.principal)})\n`;
      message += `APR: ${payload.fmt.percent(loan.aprBps)}\n`;
      message += `Term: ${loan.termDays} days\n`;
      message += `Status: ${loan.status}\n`;
      message += `Remaining: ${payload.fmt.pretty(loan.remaining)} (${payload.fmt.exactSmall(loan.remaining)})\n`;
      message += `Due: ${payload.fmt.relDue(loan.dueAtTs)} (${payload.fmt.absDue(loan.dueAtTs)})\n\n`;
    }
    const extra = payload.loans.length - shown.length;
    if (extra > 0) {
      message += `... and ${extra} more`;
    }
  }
  if (payload.creditScore !== undefined) {
    message += `\nCredit score: ${payload.creditScore}/100`;
  }
  ctx.fillStyle = theme.warn;
  ctx.font = '700 20px "Inter", system-ui';
  ctx.fillText('Loan Details', 60, 140);
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '500 14px "Inter", system-ui';
  wrapText(ctx, message, 60, 180, 880, 24);
}

function wrapText(ctx: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line + w + ' ';
    const { width } = ctx.measureText(test);
    if (width > maxWidth && line !== '') {
      ctx.fillText(line, x, y);
      line = w + ' ';
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

// Simple helper to send a lightweight announcement card to a channel.
// Uses themed embed (no heavy image render) for quick notices.
export async function sendChannelCard(
  guildId: string,
  channelId: string,
  opts: { title: string; lines: string[] },
) {
  try {
    const client = getClient();
    const ch = await client.channels.fetch(channelId);
    if (!ch || !('send' in (ch as any))) return;
    const theme = getGuildTheme(guildId);
    const embed = themedEmbed(theme, opts.title, opts.lines.join('\n'));
    await (ch as TextChannel).send({ embeds: [embed] });
  } catch { /* ignore send errors */ }
}

export async function buildCommandSyncCard(result: { globalCount: number; purged: Array<{ guildId: string; count: number }>; purgedDisabled: number; purgedLegacyGlobal?: number }, theme: Theme): Promise<{ buffer: Buffer; filename: string }> {
  const res = { globalCount: result.globalCount, perGuild: result.purged.map(p => ({ guildId: p.guildId, purged: p.count })), purgedGlobal: result.purgedLegacyGlobal ?? 0 };
  return generateCard({ layout: 'Sync', theme, payload: res });
}

export async function buildLoanDetailsCard(
  loans: LoanView[],
  creditScore: number | undefined,
  fmt: {
    pretty: (b: bigint) => string;
    exactSmall: (b: bigint) => string;
    percent: (bps: number) => string;
    relDue: (ts?: number) => string;
    absDue: (ts?: number) => string;
  },
  theme: Theme
): Promise<{ buffer: Buffer; filename: string }> {
  return generateCard({ layout: 'LoanDetails', theme, payload: { loans, creditScore, fmt } });
}


function getGameVals(payload: GameResultPayload) {
  const betN = 'bet' in payload ? payload.bet : 0;
  const payoutN = 'payout' in payload ? payload.payout : 0;
  const deltaN = 'delta' in payload ? payload.delta : 0;
  const balanceN = 'balance' in payload ? payload.balance : 0;
  return { betN, payoutN, deltaN, balanceN };
}

function drawSlotsGrid(ctx: any, grid: string[][], theme: Theme, x: number, y: number, w: number, h: number) {
  const cellW = Math.floor(w / 3);
  const cellH = Math.floor(h / 3);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = x + c * cellW;
      const cy = y + r * cellH;
      drawRoundedRect(ctx, cx + 6, cy + 6, cellW - 12, cellH - 12, 12, '#00000010');
      ctx.fillStyle = theme.textPrimary;
      ctx.font = '700 40px "Segoe UI Symbol", "Noto Emoji"';
      const s = symbolEmoji(grid[r][c]);
      ctx.fillText(s, cx + cellW / 2 - 12, cy + cellH / 2 + 14);
    }
  }
}

function drawWheel(ctx: any, number: number, color: string, theme: Theme, cx: number, cy: number, radius: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#222';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 20, 0, Math.PI * 2);
  ctx.fillStyle = '#ddd';
  ctx.fill();
  ctx.fillStyle = color === 'green' ? '#2ecc71' : color === 'red' ? '#e63946' : '#1f2937';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius - 20, 0, Math.PI / 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = theme.textPrimary;
  ctx.font = '700 28px "Cascadia Mono", monospace';
  ctx.fillText(String(number), cx - 12, cy + radius + 36);
}

function drawBJ(ctx: any, dealer: string[], player: string[], theme: Theme, x: number, y: number) {
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 18px "Segoe UI", Arial';
  ctx.fillText('Dealer', x, y);
  ctx.fillText('You', x, y + 120);
  // simple card boxes
  drawCards(ctx, dealer, x, y + 12);
  drawCards(ctx, player, x, y + 132);
}

function drawCards(ctx: any, cards: string[], x: number, y: number) {
  for (let i = 0; i < cards.length; i++) {
    drawRoundedRect(ctx, x + i * 70, y, 60, 90, 8, '#ffffff');
    ctx.fillStyle = '#111';
    ctx.font = '600 18px "Segoe UI", Arial';
    ctx.fillText(cards[i], x + i * 70 + 10, y + 30);
  }
}

function drawHoldem(ctx: any, board: string[], hero: string[], theme: Theme, x: number, y: number) {
  ctx.fillStyle = theme.textSecondary;
  ctx.font = '600 18px "Segoe UI", Arial';
  ctx.fillText('Board', x, y);
  drawCards(ctx, board, x, y + 12);
  ctx.fillText('Hero', x, y + 120);
  drawCards(ctx, hero, x, y + 132);
}

function symbolEmoji(s: string): string {
  switch (s) {
    case '7':
      return '7';
    case 'BAR':
      return 'B';
    case 'BELL':
      return '🔔';
    case 'CHERRY':
      return '🍒';
    case 'W':
      return '*';
    case 'A':
      return 'A';
    case 'B':
      return 'B';
    case 'C':
      return 'C';
    default:
      return s;
  }
}
