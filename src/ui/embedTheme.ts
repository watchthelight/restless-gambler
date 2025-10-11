import { EmbedBuilder } from 'discord.js';

// Dark minimalist palette (Based on requested style)
const Palette = {
  info: 0x7AA2F7,     // #7AA2F7
  success: 0x9ECE6A,  // #9ECE6A
  error: 0xF7768E,    // #F7768E
  warn: 0xE0AF68,     // #E0AF68
  neutral: 0x414868,  // #414868
} as const;

type EmbedType = 'info' | 'success' | 'error' | 'warn' | 'default';

let cachedVersion: string | null = null;
function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    // Resolve at runtime without bundler tricks
    const fs = require('node:fs');
    const path = require('node:path');
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const text = fs.readFileSync(pkgPath, 'utf8');
    const json = JSON.parse(text);
    cachedVersion = String(json.version || '0.0.0');
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}

export function categoryEmoji(cat: 'economy' | 'help' | 'admin' | 'games' | 'config' | 'loans' | 'misc'): string {
  switch (cat) {
    case 'economy': return '💰';
    case 'help': return '🧭';
    case 'admin': return '🛠️';
    case 'games': return '🎮';
    case 'config': return '⚙️';
    case 'loans': return '🏦';
    default: return 'ℹ️';
  }
}

export function themedEmbed(
  type: EmbedType,
  title: string,
  desc?: string,
  fields?: { name: string; value: string; inline?: boolean }[],
  opts?: { guildName?: string; emoji?: string; }
): EmbedBuilder {
  const color = (
    type === 'info' ? Palette.info :
    type === 'success' ? Palette.success :
    type === 'error' ? Palette.error :
    type === 'warn' ? Palette.warn :
    Palette.neutral
  );
  const t = [opts?.emoji, title].filter(Boolean).join(' ');
  const emb = new EmbedBuilder()
    .setColor(color)
    .setTitle(t)
    .setTimestamp();
  if (desc) emb.setDescription(desc);
  if (fields?.length) emb.addFields(fields);

  const v = getVersion();
  const suffix = opts?.guildName ? ` | ${opts.guildName}` : '';
  emb.setFooter({ text: `Restless Gambler • v${v}${suffix}` });

  return emb;
}

