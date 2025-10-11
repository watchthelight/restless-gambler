// NEW FILE: src/ui/embeds.ts
import { EmbedBuilder, type APIEmbedField, type User } from 'discord.js';

export type EmbedFlavor = 'info' | 'success' | 'warn' | 'error' | 'neutral';

const Colors: Record<EmbedFlavor, number> = {
  info: 0x7AA2F7,
  success: 0x9ECE6A,
  warn: 0xE0AF68,
  error: 0xF7768E,
  neutral: 0x8A8F98,
};

const Icons: Record<EmbedFlavor, string> = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '⛔',
  neutral: '✨',
};

export function categoryEmoji(cat: 'economy' | 'help' | 'admin' | 'games' | 'config' | 'loans' | 'misc'): string {
  switch (cat) {
    case 'economy': return '💰';
    case 'help': return '🧭';
    case 'admin': return '🛠️';
    case 'games': return '🎮';
    case 'config': return '⚙️';
    case 'loans': return '🏦';
    default: return '✨';
  }
}

type Field = APIEmbedField;
type ThemedCtx = { user?: User | null; guildName?: string | null };

// Overloads: new flavor-first signature, plus legacy theme signature for compatibility
export function themedEmbed(flavor: EmbedFlavor, title: string, description?: string, fields?: Field[], ctx?: ThemedCtx): EmbedBuilder;
export function themedEmbed(theme: any, title: string, description?: string): EmbedBuilder;
export function themedEmbed(a: any, title: string, description?: string, fields?: Field[], ctx?: ThemedCtx): EmbedBuilder {
  const isFlavor = typeof a === 'string' && (['info','success','warn','error','neutral'] as string[]).includes(a);
  const emb = new EmbedBuilder().setTimestamp();
  if (isFlavor) {
    const flavor = a as EmbedFlavor;
    emb.setColor(Colors[flavor]).setTitle(`${Icons[flavor]} ${title}`);
  } else {
    // Legacy: treat as neutral with custom accent if provided
    const color = (a && typeof a === 'object' && typeof a.accent === 'number') ? a.accent : Colors.neutral;
    emb.setColor(color).setTitle(title);
  }
  if (description) emb.setDescription(description);
  if (fields?.length) emb.addFields(fields);
  // Author/footer via ctx when provided (new signature)
  if (isFlavor && ctx) {
    const u = ctx.user ?? null;
    if (u) {
      try {
        const tag = (u as any).tag || u.username;
        const avatar = (u as any).displayAvatarURL?.({ size: 64 }) || undefined;
        emb.setAuthor({ name: tag, iconURL: avatar });
      } catch {}
    }
    const guildName = ctx.guildName || undefined;
    if (guildName) emb.setFooter({ text: guildName });
  }
  return emb;
}
