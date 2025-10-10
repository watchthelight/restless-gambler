import { BaseInteraction, AttachmentBuilder } from 'discord.js';
import { themedEmbed } from '../ui/embeds.js';
import { getGuildTheme } from '../ui/theme.js';
import { generateCard } from '../ui/cardFactory.js';

export class UserError extends Error {}

export async function handleInteractionError(interaction: BaseInteraction, err: unknown) {
  const message = err instanceof UserError ? err.message : 'Something went wrong. Try again.';
  if (!interaction.isRepliable()) return;
  const ephemeral = true;
  try {
    const theme = getGuildTheme(interaction.guildId);
    const card = await generateCard({ layout: 'Notice', theme, payload: { title: 'Notice', message } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const embed = themedEmbed(theme, 'Notice', message.slice(0, 120)).setImage(`attachment://${card.filename}`);
    const payload = { embeds: [embed], files: [file] } as any;
    if (interaction.replied || interaction.deferred) await (interaction as any).followUp(payload);
    else await (interaction as any).reply(payload);
  } catch {
    // ignore
  }
}
