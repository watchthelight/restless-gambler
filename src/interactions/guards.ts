import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

/**
 * Ensures the interaction is from a guild (server), not a DM.
 * If not in a guild, replies with an ephemeral error message.
 * @param interaction The command interaction
 * @returns true if in guild, false if not
 */
export async function ensureGuildInteraction(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild()) {
    const content = 'This command only works in servers.';
    // Handle both deferred and non-deferred states
    if (interaction.deferred) {
      await interaction.editReply({ content }).catch(() => {});
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return false;
  }
  return true;
}
