import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createTableInChannel, getTableInChannel, getTableById, joinTable, leaveAnyTable, tableStatus } from './store.js';
import { createdEmbed, joinedEmbed, leftEmbed, statusEmbed } from './view.js';

export const data = new SlashCommandBuilder()
  .setName('holdem')
  .setDescription('Texas Hold\'em')
  .addSubcommand(s => s
    .setName('create')
    .setDescription('Create a Hold\'em table in this channel')
    .addIntegerOption(o => o.setName('small_blind').setDescription('Small blind').setMinValue(1))
    .addIntegerOption(o => o.setName('big_blind').setDescription('Big blind (defaults to 2x small)'))
    .addIntegerOption(o => o.setName('min_buyin').setDescription('Minimum buy-in'))
    .addIntegerOption(o => o.setName('max_buyin').setDescription('Maximum buy-in'))
    .addIntegerOption(o => o.setName('seats').setDescription('Number of seats (2–10)').setMinValue(2).setMaxValue(10))
  )
  .addSubcommand(s => s
    .setName('join')
    .setDescription('Join a table')
    .addIntegerOption(o => o.setName('table').setDescription('Table ID').setRequired(true))
    .addIntegerOption(o => o.setName('buyin').setDescription('Buy-in amount').setRequired(true))
  )
  .addSubcommand(s => s
    .setName('leave')
    .setDescription('Leave your current table and cash out')
  )
  .addSubcommand(s => s
    .setName('status')
    .setDescription('Show table status')
    .addIntegerOption(o => o.setName('table').setDescription('Table ID'))
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === 'create') {
    const small_blind = interaction.options.getInteger('small_blind') ?? undefined;
    const big_blind = interaction.options.getInteger('big_blind') ?? undefined;
    const min_buyin = interaction.options.getInteger('min_buyin') ?? undefined;
    const max_buyin = interaction.options.getInteger('max_buyin') ?? undefined;
    const seats = interaction.options.getInteger('seats') ?? undefined;

    const table = createTableInChannel(guildId, interaction.channelId, { small_blind, big_blind, min_buyin, max_buyin, seats });
    await interaction.reply({ embeds: [createdEmbed(table)], allowedMentions: { parse: [] } });
    return;
  }

  if (sub === 'join') {
    const tableId = interaction.options.getInteger('table', true);
    const buyin = interaction.options.getInteger('buyin', true);
    try {
      const { table, seat, stack } = await joinTable(guildId, tableId, interaction.user.id, buyin);
      await interaction.reply({ embeds: [joinedEmbed(table, seat, stack)], allowedMentions: { parse: [] } });
    } catch (e: any) {
      const msg =
        e?.message === 'table_not_found' ? 'That table doesn\'t exist.' :
        e?.message === 'already_seated'   ? 'You\'re already seated at a table in this server.' :
        e?.message === 'buyin_out_of_range'? 'Buy-in must be within the table\'s min/max.' :
        e?.message === 'insufficient_funds'? 'You don\'t have enough funds for that buy-in.' :
        e?.message === 'table_full'        ? 'Table is full.' :
        'Could not join the table.';
      await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }
    return;
  }

  if (sub === 'leave') {
    const left = await leaveAnyTable(guildId, interaction.user.id);
    if (!left) {
      await interaction.reply({ content: 'You are not seated at any table.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [leftEmbed(left.table.id, left.stack)] });
    }
    return;
  }

  if (sub === 'status') {
    const provided = interaction.options.getInteger('table') ?? undefined;
    const table = provided ? getTableById(guildId, provided) : getTableInChannel(guildId, interaction.channelId);
    if (!table) {
      await interaction.reply({ content: 'No table found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const s = tableStatus(guildId, table.id)!;
    await interaction.reply({ embeds: [statusEmbed(s.table, s.players)] });
    return;
  }
}
