import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { respondOnce } from '../../util/interactions.js';
import { requireAdmin } from '../../admin/guard.js';
import { makePublicAdmin } from '../util/adminBuilder.js';

export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName('canary')
    .setDescription('Ping the router (admin only) • v2')
);

export async function run(interaction: ChatInputCommandInteraction) {
  await requireAdmin(interaction);
  await respondOnce(interaction, () => ({ content: '🐤 Canary OK' }));
}
