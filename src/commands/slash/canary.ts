import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { respondOnce } from '../../util/interactions.js';

export const data = new SlashCommandBuilder()
  .setName('canary')
  .setDescription('Ping the router');

export async function run(interaction: ChatInputCommandInteraction) {
  await respondOnce(interaction, () => ({ content: '🐤 Canary OK' }));
}
