import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { requireAdmin } from '../../admin/roles.js';
import { runMigrations } from '../../db/migrate.js';

export const data = new SlashCommandBuilder().setName('admin-repair').setDescription('Admin: ensure DB schema/tables/columns');

export async function run(i: ChatInputCommandInteraction) {
  await requireAdmin(i);
  runMigrations();
  await i.reply({ content: 'Schema checked: tables/columns ensured.' });
}
