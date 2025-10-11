import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { requireAdmin } from '../../admin/guard.js';
import { getGuildTheme } from '../../ui/theme.js';
import { themedEmbed } from '../../ui/embeds.js';
import { resetScore } from '../../loans/credit.js';
import { forgiveAll, setReminderChannelId } from '../../loans/store.js';
import { getBalance, adjustBalance } from '../../economy/wallet.js';
import { runOneGuildReminderSweep } from '../../loans/reminders.js';
import { makePublicAdmin } from '../util/adminBuilder.js';

export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName('loan-admin')
    .setDescription('Admin tools for the loan system • v2')
)
  .addSubcommand((sc) =>
    sc
      .setName('credit-reset')
      .setDescription("Reset a user's credit score")
      .addUserOption((o) =>
        o.setName('user').setDescription('Target').setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName('forgive')
      .setDescription('Forgive all loans and reset balance to 0')
      .addUserOption((o) =>
        o.setName('user').setDescription('Target').setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('remind-all').setDescription('Run a reminder sweep now'),
  )
  .addSubcommand((sc) =>
    sc
      .setName('reminders-set-channel')
      .setDescription('Set reminder channel (or clear)')
      .addChannelOption((o) =>
        o
          .setName('channel')
          .setDescription('Channel (omit to clear)')
          .setRequired(false),
      ),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: 'This bot only works in servers.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await requireAdmin(interaction);

  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand(true);

  if (sub === 'credit-reset') {
    const target = interaction.options.getUser('user', true);
    const s = resetScore(guildId, target.id);
    const theme = getGuildTheme(guildId);
    const embed = themedEmbed(theme, 'Credit Reset', `<@${target.id}> → ${s}/100`);
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (sub === 'forgive') {
    const target = interaction.options.getUser('user', true);
    const n = forgiveAll(guildId, target.id);
    // Reset balance to 0
    const bal = getBalance(guildId, target.id);
    if (bal > 0n)
      await adjustBalance(guildId, target.id, -bal, 'loan:forgive:reset');
    resetScore(guildId, target.id);
    const theme = getGuildTheme(guildId);
    const embed = themedEmbed(
      theme,
      'Loans Forgiven',
      `<@${target.id}> • ${n} loans marked forgiven; balance reset to 0; credit score reset.`,
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (sub === 'remind-all') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    const count = await runOneGuildReminderSweep(interaction.client as any, guildId);
    await interaction.editReply({ content: `Reminder sweep done. Notices sent: ${count}` });
    return;
  }

  if (sub === 'reminders-set-channel') {
    const chan = interaction.options.getChannel('channel', false);
    setReminderChannelId(guildId, (chan as any)?.id ?? null);
    await interaction.reply({
      content: chan
        ? `Reminder channel set to ${chan}`
        : 'Reminder channel cleared (DMs only).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

