import type { Card } from '../cards/Card.js';
import { handToUnicode, PLAYING_CARD_BACK } from '../cards/unicode.js';
import { renderHandsImage } from '../cards/images.js';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { getGuildDb } from '../db/connection.js';

export type HandRender = { kind: 'unicode'; text: string } | { kind: 'image'; attachment: AttachmentBuilder };

export function handValueBJ(cards: Card[]): { total: number; soft: boolean } {
  let total = 0; let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces++; }
    else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J') total += 10;
    else total += parseInt(c.rank, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  const soft = aces > 0 && total <= 21;
  return { total, soft };
}

export function getCardsStyle(guildId: string, override?: 'unicode' | 'image'): 'unicode' | 'image' {
  if (override) return override;
  const db = getGuildDb(guildId);
  try {
    const row = db.prepare('SELECT cards_style FROM guild_settings LIMIT 1').get() as { cards_style?: string } | undefined;
    const v = (row?.cards_style || 'unicode').toLowerCase();
    return v === 'image' ? 'image' : 'unicode';
  } catch { return 'unicode'; }
}

export async function renderHands(guildId: string, player: Card[], dealer: Card[], revealDealer: boolean, override?: 'unicode' | 'image'): Promise<HandRender> {
  const style = getCardsStyle(guildId, override);
  if (style === 'image') {
    try {
      const deal = revealDealer ? dealer : [dealer[0]];
      const att = await renderHandsImage(player, deal);
      return { kind: 'image', attachment: att };
    } catch {
      // fallback to unicode
    }
  }
  const dealerCards = revealDealer ? dealer : [dealer[0]];
  const text = `${handToUnicode(player)}\n${handToUnicode(dealerCards)}`;
  return { kind: 'unicode', text };
}

export function cardBack(): string { return PLAYING_CARD_BACK; }

