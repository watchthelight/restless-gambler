import { EmbedBuilder, time, TimestampStyles } from 'discord.js';
import { formatBolts } from '../economy/currency.js';

export function buildLoanReminderEmbed(d: {
  borrowerMention: string;
  principal: bigint;
  remaining: bigint;
  aprBps: number;
  termDays: number;
  dueAtIso: string;
}) {
  const due = new Date(d.dueAtIso);
  const dueRel = time(due, TimestampStyles.RelativeTime);
  const dueAbs = time(due, TimestampStyles.ShortDateTime);

  return new EmbedBuilder()
    .setColor(0xffc107)
    .setTitle('Loan Reminder')
    .setDescription(
      `${d.borrowerMention}, you have an active loan.\n` +
      `Pay early to avoid interest and credit penalties.`
    )
    .addFields(
      { name: 'Principal',  value: formatBolts(d.principal), inline: true },
      { name: 'Remaining',  value: formatBolts(d.remaining), inline: true },
      { name: 'APR',        value: `${(d.aprBps/100).toFixed(2)}%`, inline: true },
      { name: 'Term',       value: `${d.termDays} days`, inline: true },
      { name: 'Due',        value: `${dueAbs} (${dueRel})`, inline: true },
    )
    .setFooter({ text: 'Use /loan pay to make a payment.' });
}

