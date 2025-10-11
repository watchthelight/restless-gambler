import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { Loan } from '../../loans/types.js';
import { formatBalance, formatExact } from '../../util/formatBalance.js';

function fmt(v: bigint | number, pretty = true): string {
  if (pretty) return formatBalance(v);
  return formatExact(typeof v === 'bigint' ? v : BigInt(Math.trunc(v)));
}

export function loanConfirmEmbed(opts: { loan: Loan; pretty?: boolean; withButtons?: boolean }) {
  const { loan, pretty = true, withButtons = true } = opts;
  const remaining = (loan.principal + loan.accrued_interest - loan.paid_principal - loan.paid_interest);
  const fields = [
    { name: 'Principal', value: fmt(loan.principal, pretty), inline: true },
    { name: 'APR', value: `${(loan.apr_bps / 100).toFixed(2)}%`, inline: true },
    { name: 'Term', value: `${loan.term_days} days`, inline: true },
    { name: 'Due', value: `<t:${Math.floor(loan.due_ts / 1000)}:R>`, inline: true },
    { name: 'Remaining', value: fmt(remaining, pretty), inline: true },
  ];
  const embed = new EmbedBuilder().setTitle('Loan Created').addFields(fields).setColor(0x2ecc71);
  const components = !withButtons
    ? []
    : [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('loan:pay:min').setLabel('Pay Min').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('loan:pay:half').setLabel('Pay Half').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('loan:pay:full').setLabel('Pay Full').setStyle(ButtonStyle.Primary),
        ),
      ];
  return { embeds: [embed], components };
}

