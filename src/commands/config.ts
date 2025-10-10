import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, MessageFlags } from 'discord.js';
import { getGuildDb } from '../db/connection.js';
import { getSetting, getSettingNum, setSetting } from '../db/kv.js';

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
    await interaction.reply({ content: 'Guild-only command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'set') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
      return;
    }
    const key = interaction.options.getString('key', true);
    const value = interaction.options.getString('value', true);
    const db = getGuildDb(interaction.guildId);
    const now = Date.now();
    const set = (k: string, v: string) => setSetting(db, k, v);
    if (key === 'public_results') {
      set('public_results', value === 'true' ? '1' : '0');
    } else if (key === 'theme') {
      set('theme', value);
    } else if (key === 'min_bet') {
      const v = String(Math.max(0, Math.floor(parseInt(value, 10) || 0)));
      set('slots.min_bet', v);
      set('blackjack.min_bet', v);
    } else if (key === 'max_bet') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 1)));
      set('slots.max_bet', v);
      set('blackjack.max_bet', v);
      set('roulette.max_bet', v);
    } else if (key === 'faucet_limit') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 100)));
      set('faucet_limit', v);
    } else {
      await interaction.reply({ content: `Unknown key: ${key}`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `Set ${key} to ${value}`, flags: MessageFlags.Ephemeral });
  } else if (sub === 'get') {
    const key = interaction.options.getString('key', true);
    const db = getGuildDb(interaction.guildId);
    let value: string | number | null = null;
    if (key === 'min_bet') {
      const v = getSetting(db, 'slots.min_bet') ?? getSetting(db, 'blackjack.min_bet');
      value = v ?? '10';
    } else if (key === 'max_bet') {
      const v = getSetting(db, 'slots.max_bet') ?? getSetting(db, 'blackjack.max_bet') ?? getSetting(db, 'roulette.max_bet');
      value = v ?? '1000';
    } else if (key === 'faucet_limit') {
      value = getSetting(db, 'faucet_limit') ?? '100';
    } else if (key === 'public_results') {
      value = getSetting(db, 'public_results') ?? '1';
    } else if (key === 'theme') {
      value = getSetting(db, 'theme') ?? 'midnight';
    }
    await interaction.reply({ content: `${key} = ${value}`, flags: MessageFlags.Ephemeral });
  }
}
