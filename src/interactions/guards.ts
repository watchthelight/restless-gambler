import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

/**
 * Ensures the interaction is from a guild (server), not a DM.
 * If not in a guild, replies with an ephemeral error message.
 * @param interaction The command interaction
 * @returns true if in guild, false if not
 */
export async function ensureGuildInteraction(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'This command only works in servers.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return false;
  }
  return true;
}
