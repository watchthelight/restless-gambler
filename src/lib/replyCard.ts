import type { ChatInputCommandInteraction, MessageComponentInteraction, InteractionReplyOptions } from 'discord.js';
import { themedEmbed } from '../ui/embeds.js';
import { ensurePublicDefer, replyPublic } from './publicReply.js';

type Field = { name: string; value: string; inline?: boolean };

export async function replyCard(
  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
  opts: { title: string; description?: string; fields?: Field[] }
) {
  try { await ensurePublicDefer(interaction as any); } catch {}
  const embed = themedEmbed('info', opts.title, opts.description, opts.fields);
  const payload: InteractionReplyOptions = { embeds: [embed] } as any;
  return replyPublic(interaction as any, payload as any);
}

