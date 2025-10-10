import fs from 'node:fs';
import path from 'node:path';
import type { Card } from './Card.js';
import { AttachmentBuilder } from 'discord.js';
import { DPR, css, dev } from '../ui/canvas/dpi.js';

const CACHE_DIR = path.resolve('data/cache/cards');

type LayoutOpts = {
  maxRowCards?: number;   // when > this, wrap to two rows
  pad?: number;           // outer padding (CSS px)
  gap?: number;           // gap between cards (CSS px)
  cardW?: number;         // card width (CSS px)
  cardH?: number;         // card height (CSS px)
  bg?: string;            // background color
};

const DEFAULTS: Required<LayoutOpts> = {
  maxRowCards: 6,
  pad: 12,
  gap: 8,
  cardW: 120,
  cardH: 168,
  bg: '#111827'
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function idOf(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

/**
 * Generate a professional playing card SVG
 */
function svgFor(card: Card, width: number, height: number): string {
  const r = 12; // corner radius

  const suitGlyph: Record<'S'|'H'|'D'|'C', string> = {
    S: '♠',
    H: '♥',
    D: '♦',
    C: '♣'
  };

  const isRed = (card.suit === 'H' || card.suit === 'D');
  const fill = isRed ? '#DC2626' : '#1F2937';
  const rank = card.rank;
  const suit = suitGlyph[card.suit];

  const centerY = height / 2;
  const centerX = width / 2;

  // Scale font sizes proportionally
  const rankSize = Math.floor(height * 0.15);
  const suitSize = Math.floor(height * 0.13);
  const centerSuitSize = Math.floor(height * 0.4);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow-${idOf(card)}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
    <style>
      .card-rank { font-family: 'Inter', 'Segoe UI', 'Arial', sans-serif; font-weight: 700; }
      .card-suit { font-family: 'Segoe UI Symbol', 'Arial Unicode MS', sans-serif; }
    </style>
  </defs>

  <!-- Card background -->
  <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#FFFFFF" filter="url(#shadow-${idOf(card)})"/>
  <rect x="2" y="2" width="${width-4}" height="${height-4}" rx="${r-1}" ry="${r-1}" fill="none" stroke="#E5E7EB" stroke-width="2"/>

  <!-- Top left rank and suit -->
  <text class="card-rank" x="8" y="${rankSize + 4}" font-size="${rankSize}" fill="${fill}" text-anchor="start">${rank}</text>
  <text class="card-suit" x="8" y="${rankSize + suitSize + 8}" font-size="${suitSize}" fill="${fill}" text-anchor="start">${suit}</text>

  <!-- Large center suit symbol -->
  <text class="card-suit" x="${centerX}" y="${centerY + centerSuitSize/3}" font-size="${centerSuitSize}" fill="${fill}" text-anchor="middle" opacity="0.9">${suit}</text>

  <!-- Bottom right rank and suit (rotated) -->
  <g transform="rotate(180 ${width/2} ${height/2})">
    <text class="card-rank" x="8" y="${rankSize + 4}" font-size="${rankSize}" fill="${fill}" text-anchor="start">${rank}</text>
    <text class="card-suit" x="8" y="${rankSize + suitSize + 8}" font-size="${suitSize}" fill="${fill}" text-anchor="start">${suit}</text>
  </g>
</svg>`;
}

/**
 * Generate a card back SVG
 */
function svgForCardBack(width: number, height: number): string {
  const r = 12;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow-back" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
    </filter>
    <pattern id="back-pattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="40" height="40" fill="#1E40AF"/>
      <circle cx="20" cy="20" r="8" fill="#3B82F6" opacity="0.6"/>
    </pattern>
  </defs>

  <!-- Card background -->
  <rect x="0" y="0" width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#FFFFFF" filter="url(#shadow-back)"/>
  <rect x="6" y="6" width="${width-12}" height="${height-12}" rx="${r-2}" ry="${r-2}" fill="url(#back-pattern)"/>
  <rect x="6" y="6" width="${width-12}" height="${height-12}" rx="${r-2}" ry="${r-2}" fill="none" stroke="#1E40AF" stroke-width="3"/>
</svg>`;
}

async function ensureCardPng(card: Card, widthCss: number, heightCss: number): Promise<string> {
  ensureDir(CACHE_DIR);
  const file = path.join(CACHE_DIR, `${idOf(card)}-${widthCss}x${heightCss}.png`);
  if (fs.existsSync(file)) return file;

  try {
    const sharp = (await import('sharp')).default;
    const svg = svgFor(card, widthCss, heightCss);
    const width = dev(widthCss);
    const height = dev(heightCss);

    const png = await sharp(Buffer.from(svg))
      .resize({ width, height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    fs.writeFileSync(file, png);
    return file;
  } catch (e) {
    throw new Error('Failed to generate card PNG: ' + String(e));
  }
}

async function ensureCardBackPng(widthCss: number, heightCss: number): Promise<string> {
  ensureDir(CACHE_DIR);
  const file = path.join(CACHE_DIR, `back-${widthCss}x${heightCss}.png`);
  if (fs.existsSync(file)) return file;

  try {
    const sharp = (await import('sharp')).default;
    const svg = svgForCardBack(widthCss, heightCss);
    const width = dev(widthCss);
    const height = dev(heightCss);

    const png = await sharp(Buffer.from(svg))
      .resize({ width, height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    fs.writeFileSync(file, png);
    return file;
  } catch (e) {
    throw new Error('Failed to generate card back PNG: ' + String(e));
  }
}

/** Compute CSS canvas size to fit n cards with wrapping. */
function measureCanvas(n: number, cfg: Required<LayoutOpts>) {
  const rows = n <= cfg.maxRowCards ? 1 : 2;
  const row1 = Math.min(n, cfg.maxRowCards);
  const row2 = Math.max(0, n - cfg.maxRowCards);
  const rowCards = rows === 1 ? row1 : Math.max(row1, row2);
  const widthCss = cfg.pad * 2 + rowCards * cfg.cardW + (rowCards - 1) * cfg.gap;
  const heightCss = cfg.pad * 2 + rows * cfg.cardH + (rows - 1) * cfg.gap;
  return { rows, row1, row2, widthCss: css(widthCss), heightCss: css(heightCss) };
}

/** Robust, size-safe composite of cards into a single PNG. */
async function renderHandImage(cards: Card[], opts: LayoutOpts = {}): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const cfg = { ...DEFAULTS, ...opts };
  const { rows, row1, row2, widthCss, heightCss } = measureCanvas(cards.length, cfg);
  const width = dev(widthCss);
  const height = dev(heightCss);

  // Preload and pre-size all card file paths
  const files: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    files.push(await ensureCardPng(cards[i], cfg.cardW, cfg.cardH));
  }

  // Compute composite placements in device pixels
  const comp: any[] = [];
  const placeRow = (startIdx: number, count: number, row: number) => {
    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const leftCss = cfg.pad + i * (cfg.cardW + cfg.gap);
      const topCss = cfg.pad + row * (cfg.cardH + cfg.gap);
      comp.push({
        input: files[idx],
        left: dev(leftCss),
        top: dev(topCss)
      });
    }
  };
  placeRow(0, row1, 0);
  if (rows === 2) placeRow(row1, row2, 1);

  try {
    const base = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: cfg.bg
      }
    });

    return await base.composite(comp).png().toBuffer();
  } catch (err: any) {
    // Log helpful diagnostics
    console.error(JSON.stringify({
      msg: 'card_composite_error',
      base: { width, height },
      cardCount: cards.length,
      comp: comp.map(c => ({ left: c.left, top: c.top, file: path.basename(c.input) })),
      error: String(err)
    }));
    throw new Error('image_render_failed: ' + String(err));
  }
}

/** Render dealer and player hands vertically stacked with proper spacing. */
export async function renderHandsImage(player: Card[], dealer: Card[], hideDealer = false): Promise<AttachmentBuilder> {
  try {
    const sharp = (await import('sharp')).default;
    const gap = 16; // gap between dealer and player rows
    const opts = {
      cardW: 120,
      cardH: 168,
      pad: 12,
      gap: 8,
      maxRowCards: 6,
      bg: '#111827'
    };

    // Prepare dealer cards (with card backs if hidden)
    let dealerCards: Card[] = dealer;
    if (hideDealer && dealer.length > 1) {
      dealerCards = [dealer[0]];
      // Note: We'll handle card backs separately to avoid mixing types
    }

    const playerImg = await renderHandImage(player, opts);
    const dealerImg = await renderHandImage(dealerCards, opts);

    // If hiding dealer, add card back for remaining cards
    let dealerFinal = dealerImg;
    if (hideDealer && dealer.length > 1) {
      // Create a composite with dealer's first card + card backs for rest
      const dealerWithBacks: string[] = [];
      dealerWithBacks.push(await ensureCardPng(dealer[0], opts.cardW, opts.cardH));
      for (let i = 1; i < dealer.length; i++) {
        dealerWithBacks.push(await ensureCardBackPng(opts.cardW, opts.cardH));
      }

      const { rows, row1, row2, widthCss, heightCss } = measureCanvas(dealer.length, opts as Required<LayoutOpts>);
      const width = dev(widthCss);
      const height = dev(heightCss);

      const comp: any[] = [];
      for (let i = 0; i < dealerWithBacks.length; i++) {
        const leftCss = opts.pad + i * (opts.cardW + opts.gap);
        const topCss = opts.pad;
        comp.push({
          input: dealerWithBacks[i],
          left: dev(leftCss),
          top: dev(topCss)
        });
      }

      dealerFinal = await sharp({
        create: {
          width,
          height,
          channels: 4,
          background: opts.bg
        }
      }).composite(comp).png().toBuffer();
    }

    // Get dimensions of both images
    const pMeta = await sharp(playerImg).metadata();
    const dMeta = await sharp(dealerFinal).metadata();

    const totalWidth = Math.max(pMeta.width ?? 0, dMeta.width ?? 0);
    const totalHeight = (pMeta.height ?? 0) + gap + (dMeta.height ?? 0);

    // Combine vertically
    const final = await sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: opts.bg
      }
    }).composite([
      { input: playerImg, left: 0, top: 0 },
      { input: dealerFinal, left: 0, top: (pMeta.height ?? 0) + gap }
    ]).png().toBuffer();

    const name = `hand-${Date.now()}.png`;
    return new AttachmentBuilder(final, { name });
  } catch (e: any) {
    console.error('Failed to render hands image:', {
      error: String(e?.message || e),
      playerCount: player.length,
      dealerCount: dealer.length,
      hideDealer
    });
    throw new Error('image_render_failed: ' + String(e));
  }
}
