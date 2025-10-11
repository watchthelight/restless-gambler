import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { requireAdmin } from '../../admin/guard.js';
import { runMigrations } from '../../db/migrate.js';
import { makePublicAdmin } from '../util/adminBuilder.js';

export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName('admin-repair')
    .setDescription('Admin: ensure DB schema/tables/columns • v2')
);

export async function run(i: ChatInputCommandInteraction) {
  await requireAdmin(i);
  runMigrations();
  await i.reply({ content: 'Schema checked: tables/columns ensured.' });
}
