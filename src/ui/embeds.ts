import { EmbedBuilder } from 'discord.js';
import type { Theme } from './theme.js';
import { CURRENCY_NAME, CURRENCY_EMOJI } from '../economy/currency.js';

export function themedEmbed(theme: Theme, title: string, description?: string): EmbedBuilder {
  const emb = new EmbedBuilder().setColor(theme.accent).setTitle(title).setTimestamp();
  if (description) emb.setDescription(description);
  return emb;
}
