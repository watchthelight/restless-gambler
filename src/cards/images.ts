import fs from 'node:fs';
import path from 'node:path';
import type { Card } from './Card.js';
import { AttachmentBuilder } from 'discord.js';

const CACHE_DIR = path.resolve('data/cache/cards/72px');

function ensureDir(p: string) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function idOf(card: Card): string { return `${card.suit}-${card.rank}`; }

function svgFor(card: Card, size = 72): string {
  const w = Math.round(size * 0.72);
  const h = size;
  const r = 10;
  const suitGlyph: Record<'S'|'H'|'D'|'C', string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const fill = (card.suit === 'H' || card.suit === 'D') ? '#e11d48' : '#0f172a';
  const textColor = fill;
  const rank = card.rank;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff" filter="url(#shadow)"/>
    <text x="10" y="20" font-family="Inter, Segoe UI, Arial" font-size="16" fill="${textColor}">${rank}</text>
    <text x="${w-18}" y="${h-8}" text-anchor="end" font-family="Inter, Segoe UI, Arial" font-size="16" fill="${textColor}">${suitGlyph[card.suit]}</text>
  </svg>`;
}

async function toPngBuffer(svg: string, height = 72): Promise<Buffer> {
  try {
    // Lazy import sharp
    const sharp = (await import('sharp')).default;
    const img = sharp(Buffer.from(svg)).resize({ height, kernel: 'lanczos3' as any }).png();
    return await img.toBuffer();
  } catch (e) {
    throw new Error('sharp_not_available');
  }
}

async function ensureCardPng(card: Card, height = 72): Promise<string> {
  ensureDir(CACHE_DIR);
  const file = path.join(CACHE_DIR, `${idOf(card)}.png`);
  if (fs.existsSync(file)) return file;
  const svg = svgFor(card, height);
  const png = await toPngBuffer(svg, height);
  fs.writeFileSync(file, png);
  return file;
}

export async function renderHandsImage(player: Card[], dealer: Card[]): Promise<AttachmentBuilder> {
  // Compose two strips vertically into one image
  try {
    const sharp = (await import('sharp')).default as any;
    const height = 72;
    const gap = 8;
    const pad = 12;
    const filesP = await Promise.all(player.map((c) => ensureCardPng(c, height)));
    const filesD = await Promise.all(dealer.map((c) => ensureCardPng(c, height)));
    const imgsP = await Promise.all(filesP.map((f) => sharp(f).toBuffer()));
    const imgsD = await Promise.all(filesD.map((f) => sharp(f).toBuffer()));

    const widthsP = await Promise.all(filesP.map(async (f) => (await sharp(f).metadata()).width || 52));
    const widthsD = await Promise.all(filesD.map(async (f) => (await sharp(f).metadata()).width || 52));
    const stripW = Math.max(widthsP.reduce((a,b)=>a+b, 0) + gap * Math.max(0, imgsP.length-1), widthsD.reduce((a,b)=>a+b, 0) + gap * Math.max(0, imgsD.length-1));
    const stripH = height;

    const makeStrip = async (buffers: Buffer[], widths: number[]) => {
      const canv = sharp({ create: { width: stripW, height: stripH, channels: 4, background: { r: 17, g: 24, b: 39, alpha: 1 } } });
      let x = 0;
      const comps = buffers.map((b, idx) => ({ input: b, left: (idx===0?0:x), top: 0 }));
      for (let i = 0; i < widths.length; i++) { if (i>0) x += gap; x += widths[i]; }
      return await canv.composite(comps).png().toBuffer();
    };

    const stripP = await makeStrip(imgsP, widthsP);
    const stripD = await makeStrip(imgsD, widthsD);
    const totalW = stripW + pad*2;
    const totalH = stripH*2 + gap + pad*2;
    const base = sharp({ create: { width: totalW, height: totalH, channels: 4, background: { r: 31, g: 41, b: 55, alpha: 1 } } });
    const out = await base.composite([
      { input: stripP, left: pad, top: pad },
      { input: stripD, left: pad, top: pad + stripH + gap },
    ]).png().toBuffer();
    const name = `hand-${Date.now()}.png`;
    return new AttachmentBuilder(out, { name });
  } catch (e) {
    throw new Error('image_render_failed');
  }
}

