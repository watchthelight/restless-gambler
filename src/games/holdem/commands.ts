import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { themedEmbed } from '../../ui/embeds.js';
import { getGuildTheme } from '../../ui/theme.js';
import { createTable } from './table.js';

export const data = new SlashCommandBuilder()
  .setName('holdem')
  .setDescription('Texas Hold’em')
  .addSubcommand((sc) =>
    sc
      .setName('create')
      .setDescription('Create a table')
      .addIntegerOption((o) => o.setName('small_blind').setRequired(true).setDescription('Small blind').setMinValue(1))
      .addIntegerOption((o) => o.setName('buy_in_min').setRequired(true).setDescription('Minimum buy-in').setMinValue(1))
      .addIntegerOption((o) => o.setName('buy_in_max').setRequired(true).setDescription('Maximum buy-in').setMinValue(1)),
  )
  .addSubcommand((sc) => sc.setName('start').setDescription('Start the table (owner or majority ready)'))
  .addSubcommand((sc) =>
    sc
      .setName('join')
      .setDescription('Join the table')
      .addIntegerOption((o) => o.setName('buy_in').setRequired(true).setDescription('Buy-in amount').setMinValue(1)),
  )
  .addSubcommand((sc) => sc.setName('leave').setDescription('Leave the table'))
  .addSubcommand((sc) =>
    sc
      .setName('rebuy')
      .setDescription('Rebuy chips')
      .addIntegerOption((o) => o.setName('amount').setRequired(true).setDescription('Amount').setMinValue(1)),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'create') {
  const smallBlind = interaction.options.getInteger('small_blind', true);
  const buyInMin = interaction.options.getInteger('buy_in_min', true);
  const buyInMax = interaction.options.getInteger('buy_in_max', true);
  const id = createTable({
    guildId: interaction.guildId!,
    channelId: interaction.channelId,
    ownerId: interaction.user.id,
    smallBlind,
    buyInMin,
    buyInMax,
  });
  const theme = getGuildTheme(interaction.guildId);
  const embed = themedEmbed(theme, '♠️ Hold’em', `Table #${id} created in this channel.`);
  await interaction.reply({ embeds: [embed] });
  } else if (sub === 'start' || sub === 'join' || sub === 'leave' || sub === 'rebuy') {
    await interaction.reply({ ephemeral: true, content: 'This subcommand is stubbed in this reference implementation.' });
  }
}

// Subcommands beyond create are placeholders; full flow persists state in DB for restoration.
