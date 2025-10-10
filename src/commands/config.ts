import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField } from 'discord.js';
import { getGuildDb } from '../db/connection.js';

export const data = new SlashCommandBuilder()
  .setName('config')
  .setDescription('Guild configuration')
  .addSubcommand((sc) =>
    sc
      .setName('set')
      .setDescription('Set a config key (admin only)')
      .addStringOption((o) =>
        o
          .setName('key')
          .setDescription('Key')
          .setRequired(true)
          .addChoices(
            { name: 'max_bet', value: 'max_bet' },
            { name: 'min_bet', value: 'min_bet' },
            { name: 'faucet_limit', value: 'faucet_limit' },
            { name: 'public_results', value: 'public_results' },
            { name: 'theme', value: 'theme' },
          ),
      )
      .addStringOption((o) => o.setName('value').setDescription('Value or theme preset').setRequired(true).setAutocomplete(false)),
  )
  .addSubcommand((sc) =>
    sc
      .setName('get')
      .setDescription('Get a config value')
      .addStringOption((o) =>
        o
          .setName('key')
          .setDescription('Key')
          .setRequired(true)
          .addChoices(
            { name: 'max_bet', value: 'max_bet' },
            { name: 'min_bet', value: 'min_bet' },
            { name: 'faucet_limit', value: 'faucet_limit' },
            { name: 'public_results', value: 'public_results' },
            { name: 'theme', value: 'theme' },
          ),
      ),
  );

export async function handleConfig(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Guild-only command.' });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'set') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'Admin only.' });
      return;
    }
    const key = interaction.options.getString('key', true);
    const value = interaction.options.getString('value', true);
    const db = getGuildDb(interaction.guildId);
    const row = db.prepare('SELECT * FROM guild_settings LIMIT 1').get();
    const obj: any = row || {};
    if (key === 'public_results') obj.public_results = value === 'true' ? 1 : 0;
    else if (key === 'theme') obj.theme = value;
    else obj[key] = parseInt(value, 10);
    db.prepare('DELETE FROM guild_settings').run();
    db.prepare('INSERT INTO guild_settings(max_bet, min_bet, faucet_limit, public_results, theme) VALUES(?,?,?,?,?)').run(
      obj.max_bet ?? 10000,
      obj.min_bet ?? 10,
      obj.faucet_limit ?? 100,
      obj.public_results ?? 1,
      obj.theme ?? 'midnight',
    );
    await interaction.reply({ content: `Set ${key} to ${value}` });
  } else if (sub === 'get') {
    const key = interaction.options.getString('key', true);
    const db = getGuildDb(interaction.guildId);
    const row = db.prepare('SELECT * FROM guild_settings LIMIT 1').get() as any;
    const value = row ? row[key] : null;
    await interaction.reply({ content: `${key} = ${value}` });
  }
}
