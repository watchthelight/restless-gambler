import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ChannelType,
  TextChannel,
} from 'discord.js';
import { requireAdmin } from '../../admin/guard.js';
import { getGuildTheme } from '../../ui/theme.js';
import { themedEmbed } from '../../ui/embeds.js';
import { resetScore } from '../../loans/credit.js';
import { forgiveAll, setReminderChannelId } from '../../loans/store.js';
import { getBalance, adjustBalance } from '../../economy/wallet.js';
import { runOneGuildReminderSweep } from '../../loans/reminders.js';
import { getGuildDb } from '../../db/connection.js';
import { getGuildSettings } from '../../db/guildSettings.js';
import { buildLoanReminderEmbed } from '../../ui/loanReminderCard.js';
import { getReminderPref } from '../../loans/prefs.js';
import { jsonStringifySafeBigint } from '../../utils/json.js';
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
    const { HugeDecimal } = await import('../../lib/num/index.js');
    if (bal.gt(HugeDecimal.ZERO))
      await adjustBalance(guildId, target.id, bal.negate(), 'loan:forgive:reset');
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
    const guild = interaction.guild;
    if (!guild) { await interaction.editReply({ content: 'Guild only.' }); return; }

    const db = getGuildDb(guildId);
    const gs = getGuildSettings(db, guildId);

    // Resolve target channel: saved home channel → fallback to current text channel → error
    let targetChannel: TextChannel | null = null;
    if (gs.home_channel_id) {
      const ch = await guild.channels.fetch(gs.home_channel_id).catch(() => null);
      if (ch && ch.type === ChannelType.GuildText && ch.isTextBased()) targetChannel = ch as TextChannel;
    }
    if (!targetChannel && interaction.channel?.type === ChannelType.GuildText) {
      targetChannel = interaction.channel as TextChannel;
    }
    if (!targetChannel) {
      await interaction.editReply({ content: 'No suitable text channel to post reminders. Run a command once in the desired channel first.' });
      return;
    }

    const rows = db.prepare(`SELECT id, user_id, principal, apr_bps, term_days, start_ts, due_ts, accrued_interest, paid_principal, paid_interest, status FROM loans WHERE status IN ('active','late','defaulted') ORDER BY due_ts ASC`).all() as any[];
    let sent = 0, skippedOptOut = 0, skippedNoMember = 0, failed = 0;

    for (const l of rows) {
      const userId = String(l.user_id);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) { skippedNoMember++; continue; }
      if (!getReminderPref(guildId, userId)) { skippedOptOut++; continue; }

      const principal = BigInt(l.principal || 0);
      const remaining = BigInt(l.principal || 0) - BigInt(l.paid_principal || 0) + (BigInt(l.accrued_interest || 0) - BigInt(l.paid_interest || 0));
      const embed = buildLoanReminderEmbed({
        borrowerMention: `<@${userId}>`,
        principal,
        remaining,
        aprBps: Number(l.apr_bps || 0),
        termDays: Number(l.term_days || 0),
        dueAtIso: new Date(Number(l.due_ts || 0)).toISOString(),
      });

      try {
        await targetChannel.send({
          content: `<@${userId}>`,
          embeds: [embed],
          allowedMentions: { users: [userId] },
        });
        sent++;
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        failed++;
      }
    }

    try {
      db.prepare('INSERT INTO audit_log(json) VALUES(?)').run(jsonStringifySafeBigint({ msg: 'loan_reminder_sweep', guildId, total: rows.length, sent, skippedOptOut, skippedNoMember, failed }));
    } catch { }

    await interaction.editReply({
      content: `Reminder sweep complete in ${targetChannel}.\n` +
        `• Notices sent: **${sent}**\n` +
        (skippedOptOut ? `• Skipped (opt-out): ${skippedOptOut}\n` : '') +
        (skippedNoMember ? `• Skipped (left server): ${skippedNoMember}\n` : '') +
        (failed ? `• Failed to post: ${failed}\n` : ''),
    });
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
