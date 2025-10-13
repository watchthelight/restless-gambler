import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  StringSelectMenuInteraction,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import { getGuildTheme } from '../../ui/theme.js';
import { themedEmbed } from '../../ui/embeds.js';
import { formatBalance, formatExact } from '../../util/formatBalance.js';
import { walletEmbed } from '../shared/walletView.js';
import { formatBolts } from '../../economy/currency.js';
import { safeDefer } from '../../interactions/reply.js';
import { getBalance, adjustBalance } from '../../economy/wallet.js';
import { buildChart } from '../../loans/chart.js';
import { schedule, accrueInterest, status as statusCalc } from '../../loans/calculator.js';
import { getScore, bumpOnTime, penalizeLate, resetScore } from '../../loans/credit.js';
import { listUserLoans, getActiveLoans, createAndCredit, accrueOnTouch, applyPayment, setUserPrefs, forgiveAll } from '../../loans/store.js';
import { Loan } from '../../loans/types.js';
import { buildLoanDetailsCard } from '../../ui/cardFactory.js';
import { underwrite } from '../../loans/underwrite.js';
import { offersForAmount } from '../../loans/offers.js';
import { markOnce } from '../../util/once.js';
import { getReminderPref, setReminderPref } from '../../loans/prefs.js';
import { replyOnce } from '../../interactions/replyOnce.js';
import { getGuildDb } from '../../db/connection.js';
import { ensureAdminAttached, isAdminUser } from '../../db/adminGlobal.js';

export const data = new SlashCommandBuilder()
  .setName('loan')
  .setDescription('Short-term loans')
  .addSubcommand((s) =>
    s
      .setName('apply')
      .setDescription('Apply for a loan')
      .addStringOption((o) => o.setName('amount').setDescription('Requested amount (e.g., 10k, 2.5m)').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('pay').setDescription('Make a payment').addStringOption(o => o.setName('amount').setDescription('Payment amount (e.g., 10k)').setRequired(true)))
  .addSubcommandGroup((g) =>
    g
      .setName('reminders')
      .setDescription('Loan reminder preferences')
      .addSubcommand((sc) => sc.setName('opt-out').setDescription('Stop receiving loan reminders'))
      .addSubcommand((sc) => sc.setName('opt-in').setDescription('Receive loan reminders'))
      .addSubcommand((sc) => sc.setName('status').setDescription('Show your reminder status'))
      .addSubcommand((sc) => sc.setName('on').setDescription('Turn reminders ON'))
      .addSubcommand((sc) => sc.setName('off').setDescription('Turn reminders OFF'))
      .addSubcommand((sc) => sc
        .setName('snooze')
        .setDescription('Snooze reminders')
        .addIntegerOption((o) => o.setName('hours').setDescription('Hours to snooze').setMinValue(1).setMaxValue(72).setRequired(true)))
  )
  .addSubcommand((s) => s.setName('details').setDescription('Show your loan details'))
  // Admin-only subcommands (hidden at runtime via permission check)
  .addSubcommand((s) =>
    s
      .setName('credit-reset')
      .setDescription('Admin only — use /loan-admin credit-reset')
      .addUserOption((o) => o.setName('user').setDescription('User to reset').setRequired(true))
  )
  .addSubcommand((s) =>
    s
      .setName('forgive')
      .setDescription('Admin only — use /loan-admin forgive')
      .addUserOption((o) => o.setName('user').setDescription('User to forgive').setRequired(true))
  )
  ;

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  const sub = interaction.options.getSubcommand(false);
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  if (!sub) {
    // Base: show offers and chart
    await safeDefer(interaction, { ephemeral: false });
    const score = getScore(guildId, userId);
    const offers = schedule([100, 500, 1000, 5000, 10000], score);
    const primary = offers[0];
    const { embed: chartEmbed, file } = await buildChart({ principal: primary.principal, aprBps: primary.aprBps, termDays: primary.termDays });
    const sel = new StringSelectMenuBuilder()
      .setCustomId(`loan:offer:${userId}`)
      .setPlaceholder('Select loan amount')
      .addOptions(
        ...offers.map(o => new StringSelectMenuOptionBuilder().setLabel(`${formatBolts(o.principal)} • ${(o.aprBps / 100).toFixed(2)}% • ${o.termDays}d`).setValue(`${o.principal}:${o.aprBps}:${o.termDays}`))
      );
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel);
    const theme = getGuildTheme(guildId);
    const header = themedEmbed(theme, 'Loan Offers', `Credit score: ${score}/100`);
    const files = file ? [file] : [];
    await interaction.editReply({ embeds: [header, chartEmbed], files, components: [row] });
    for (const o of offers) {
      console.log(JSON.stringify({ msg: 'loan_offer', userId, principal: o.principal, apr_bps: o.aprBps, term_days: o.termDays }));
    }
    return;
  }

  if (sub === 'pay') {
    await safeDefer(interaction, { ephemeral: false });
    const { getParsedAmount } = await import('../../interactions/options.js');
    const parsed = await getParsedAmount(interaction as any, 'amount');
    const amount = Number(parsed.value);
    const active = getActiveLoans(guildId, userId);
    if (!active.length) { await interaction.editReply({ content: 'You have no loans.' }); return; }
    // Oldest
    let loan = accrueOnTouch(guildId, active[0]);
    const split = applyPayment(guildId, loan, amount);
    await adjustBalance(guildId, userId, -amount, 'loan:payment');
    loan = split.loan;
    const remaining = split.remaining;
    const now = Date.now();
    const st = statusCalc(loan, now);
    if (st === 'paid') {
      if (now <= loan.due_ts) bumpOnTime(guildId, loan); else penalizeLate(guildId, loan);
    }
    const pretty = formatBalance(getBalance(guildId, userId));
    const exact = formatExact(getBalance(guildId, userId));
    const embed = walletEmbed({ title: 'Loan Payment', headline: `Paid ${formatBolts(amount)}. New balance:`, pretty, exact });
    await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  // Admin-only functions moved to /loan-admin

  if (sub === 'reminders') {
    const sub2 = interaction.options.getSubcommand();
    if (sub2 === 'status') {
      const on = getReminderPref(guildId, userId);
      await interaction.reply({ content: `🔔 Loan reminders: ${on ? 'ON' : 'OFF'}`, flags: MessageFlags.Ephemeral }).catch(() => { });
      return;
    }
    if (sub2 === 'on' || sub2 === 'opt-in') {
      setReminderPref(guildId, userId, true);
      await interaction.reply({ content: '🔔 Loan reminders turned ON.', flags: MessageFlags.Ephemeral }).catch(() => { });
      return;
    }
    if (sub2 === 'off' || sub2 === 'opt-out') {
      setReminderPref(guildId, userId, false);
      await interaction.reply({ content: '🔔 Loan reminders turned OFF.', flags: MessageFlags.Ephemeral }).catch(() => { });
      return;
    }
    if (sub2 === 'snooze') {
      const hours = interaction.options.getInteger('hours', true);
      const until = Date.now() + hours * 60 * 60 * 1000;
      setUserPrefs(guildId, userId, { snooze_until_ts: until });
      await interaction.reply({ content: `Snoozed until <t:${Math.floor(until / 1000)}:R>.` });
      return;
    }
    // Admin-only set-channel moved to /loan-admin reminders-set-channel
  }

  if (sub === 'apply') {
    const { getParsedAmount: getParsedAmount2 } = await import('../../interactions/options.js');
    const parsed2 = await getParsedAmount2(interaction as any, 'amount');
    const amount = Number(parsed2.value);
    await interaction.reply({ content: `📝 Reviewing your application for ${formatBolts(amount)}...` });
    const credit = getScore(guildId, userId);
    try { console.log(JSON.stringify({ msg: 'loan_apply_open', userId, amount, credit, guildId })); } catch { }
    const uw = await underwrite(guildId, userId, amount, credit);
    if (!uw.approved) {
      const balNow = getBalance(guildId, userId);
      const embed = new EmbedBuilder()
        .setTitle('Loan Application — Denied')
        .setColor(0xcc3333)
        .setDescription([
          `Requested: ${formatBolts(amount)}`,
          `Balance: ${formatBolts(balNow)}`,
          `Credit: ${credit}`,
          '',
          '**Reasons:**',
          ...uw.reasons.map((r) => `• ${r}`),
          '',
          'Improve your credit by paying on time. Late payments increase APR and reduce limits.',
          'Tip: enable alerts with /loan reminders.',
        ].join('\n'));
      await interaction.editReply({ content: '', embeds: [embed], components: [] });
      try { console.log(JSON.stringify({ msg: 'loan_apply_denied', userId, amount, reasons: uw.reasons, guildId })); } catch { }
      return;
    }
    // Approved: show preset term/APR options for the requested amount
    const offers = offersForAmount(amount, credit);
    const embed = new EmbedBuilder()
      .setTitle('Loan Application — Approved')
      .setColor(0x2a7a2a)
      .setDescription([
        `Requested: ${formatBolts(amount)}  •  Credit: ${credit}`,
        'Select a term to see APR and due date. Longer terms cost more.',
        '_Late payments damage your credit and may trigger collections._',
      ].join('\n'))
      .setFooter({ text: 'Notifications are configurable with /loan reminders.' });
    const select = new StringSelectMenuBuilder()
      .setCustomId(`loan:apply:select:${userId}:${amount}:${credit}`)
      .setPlaceholder('Choose your term')
      .addOptions(
        offers.map((o) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(`${o.termDays} days • ${(o.aprBps / 100).toFixed(2)}% APR`)
            .setDescription(`Due in ~${o.termDays} days`)
            .setValue(`${o.principal}:${o.termDays}:${o.aprBps}`),
        ),
      );
    const applyBtn = new ButtonBuilder().setCustomId(`loan:apply:confirm:${userId}`).setStyle(ButtonStyle.Success).setLabel('Apply').setDisabled(true);
    const remindersOn = getReminderPref(guildId, userId);
    const toggleBtn = new ButtonBuilder()
      .setCustomId(`loan:apply:toggleNotify:${userId}`)
      .setStyle(remindersOn ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setLabel(remindersOn ? 'Reminders: ON' : 'Reminders: OFF');
    const cancelBtn = new ButtonBuilder().setCustomId(`loan:apply:cancel:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Cancel');
    await interaction.editReply({
      content: '',
      embeds: [embed],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(applyBtn, toggleBtn, cancelBtn)],
    });
    // Disable after 15 minutes (remove components)
    setTimeout(async () => {
      try { await interaction.editReply({ components: [] }); } catch { }
    }, 15 * 60 * 1000);
    return;
  }

  if (sub === 'details') {
    await safeDefer(interaction, { ephemeral: false });
    const loans = listUserLoans(guildId, userId).map(l => accrueOnTouch(guildId, l));
    if (!loans.length) { await interaction.editReply({ content: 'You have no loans.' }); return; }
    // Build LoanView[]
    const loanViews = loans.map(l => ({
      id: l.id,
      principal: l.principal,
      aprBps: l.apr_bps,
      termDays: l.term_days,
      status: l.status === 'defaulted' ? 'late' : l.status as 'active' | 'paid' | 'late',
      remaining: (l.principal - l.paid_principal) + (l.accrued_interest - l.paid_interest),
      dueAtTs: l.due_ts,
    }));
    const creditScore = getScore(guildId, userId);
    const theme = getGuildTheme(guildId);
    const fmt = {
      pretty: (b: bigint) => formatBolts(Number(b)),
      exactSmall: (b: bigint) => formatExact(b),
      percent: (bps: number) => `${(bps / 100).toFixed(2)}%`,
      relDue: (ts?: number) => ts ? `<t:${Math.floor(ts / 1000)}:R>` : 'N/A',
      absDue: (ts?: number) => ts ? `<t:${Math.floor(ts / 1000)}:F>` : 'N/A',
    };
    const card = await buildLoanDetailsCard(loanViews, creditScore, fmt, theme);
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const embed = themedEmbed(theme, 'Loan Details', '').setImage(`attachment://${card.filename}`);
    await interaction.editReply({ embeds: [embed], files: [file] });
    return;
  }

  // Admin-only actions (credit-reset, forgive)
  if (sub === 'credit-reset' || sub === 'forgive') {
    const db = getGuildDb(guildId);
    try { ensureAdminAttached(db); } catch { /* ignore */ }
    const ok = isAdminUser(db, interaction.user.id);
    if (!ok) {
      await interaction.reply({ content: 'This is an admin-only action. Use `/loan-admin`.', flags: MessageFlags.Ephemeral }).catch(() => { });
      return;
    }
    if (sub === 'credit-reset') {
      const target = interaction.options.getUser('user', true);
      const s = resetScore(guildId, target.id);
      await interaction.reply({ content: `Credit score reset for <@${target.id}> to ${s}/100.`, flags: MessageFlags.Ephemeral }).catch(() => { });
      return;
    }
    if (sub === 'forgive') {
      const target = interaction.options.getUser('user', true);
      const n = forgiveAll(guildId, target.id);
      // Reset positive balances to 0
      const bal = getBalance(guildId, target.id);
      const { HugeDecimal } = await import('../../lib/num/index.js');
      if (bal.gt(HugeDecimal.ZERO)) await adjustBalance(guildId, target.id, bal.negate(), 'loan:forgive:reset');
      resetScore(guildId, target.id);
      await interaction.reply({ content: `Forgave ${n} loans; <@${target.id}>'s balance reset to 0 and credit score reset.`, flags: MessageFlags.Ephemeral }).catch(() => { });
      return;
    }
  }
}

export async function handleSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, action, uid] = interaction.customId.split(':');
  if (prefix !== 'loan') return;
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  if (action === 'offer') {
    if (interaction.user.id !== uid) { await interaction.reply({ content: 'This selection is not for you.', flags: MessageFlags.Ephemeral }).catch(() => { }); return; }
    const [amountStr, aprStr, termStr] = interaction.values[0].split(':');
    const amount = parseInt(amountStr, 10); const apr = parseInt(aprStr, 10); const term = parseInt(termStr, 10);
    await interaction.deferUpdate().catch(() => { });
    const loan = await createAndCredit(interaction.guildId, interaction.user.id, amount, apr, term);
    const daily = Math.floor((Number(loan.principal) * apr) / 10000 / 365);
    const theme = getGuildTheme(interaction.guildId);
    const headline = `Approved: ${formatBolts(Number(loan.principal))} • ${(apr / 100).toFixed(2)}% • ${term}d`;
    const bal = getBalance(interaction.guildId, interaction.user.id);
    const primary = walletEmbed({ title: 'Loan Created', headline, pretty: formatBalance(bal), exact: formatExact(bal) });
    const { embed: chartEmbed, file } = await buildChart({ principal: Number(loan.principal), aprBps: apr, termDays: term });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('loan:pay:min').setStyle(ButtonStyle.Secondary).setLabel(`Pay min (${formatBolts(daily)})`),
      new ButtonBuilder().setCustomId('loan:pay:half').setStyle(ButtonStyle.Secondary).setLabel('Pay half'),
      new ButtonBuilder().setCustomId('loan:pay:full').setStyle(ButtonStyle.Primary).setLabel('Pay full'),
    );
    const files = file ? [file] : [];
    await interaction.editReply({ embeds: [primary, chartEmbed], files, components: [row] });
    return;
  }
  if (action === 'apply' && interaction.customId.split(':')[2] === 'select') {
    const parts = interaction.customId.split(':');
    const reqUid = parts[3];
    const amount = parseInt(parts[4], 10);
    const credit = parseInt(parts[5], 10);
    if (interaction.user.id !== reqUid) { await replyOnce(interaction as any, () => interaction.reply({ content: 'Not your application.', flags: MessageFlags.Ephemeral })); return; }
    const [pStr, tStr, aStr] = interaction.values[0].split(':');
    const p = parseInt(pStr, 10); const t = parseInt(tStr, 10); const a = parseInt(aStr, 10);
    const totalAtMaturity = Math.round(p + p * (a / 10000) * (t / 365));
    const base = interaction.message.embeds?.[0];
    const embed = base ? EmbedBuilder.from(base) : new EmbedBuilder().setTitle('Loan Application — Approved').setColor(0x2a7a2a);
    const dueTs = Date.now() + t * 86_400_000;
    embed.setFields([
      { name: 'Principal', value: formatBolts(p), inline: true },
      { name: 'Term', value: `${t} days`, inline: true },
      { name: 'APR', value: `${(a / 100).toFixed(2)}%`, inline: true },
      { name: 'Due', value: `<t:${Math.floor(dueTs / 1000)}:F>  •  <t:${Math.floor(dueTs / 1000)}:R>`, inline: true },
      { name: 'If held to maturity', value: `${formatBolts(totalAtMaturity)}`, inline: true },
    ]);
    // Rebuild rows: preserve select options, plain description text
    const offers = offersForAmount(amount, credit);
    const sel = new StringSelectMenuBuilder()
      .setCustomId(`loan:apply:select:${reqUid}:${amount}:${credit}`)
      .setPlaceholder('Choose your term')
      .addOptions(
        offers.map((o) => new StringSelectMenuOptionBuilder()
          .setLabel(`${o.termDays} days • ${(o.aprBps / 100).toFixed(2)}% APR`)
          .setDescription(`Due in ~${o.termDays} days`)
          .setValue(`${o.principal}:${o.termDays}:${o.aprBps}`)
          .setDefault(o.termDays === t && o.aprBps === a)),
      );
    const applyBtn = new ButtonBuilder().setCustomId(`loan:apply:confirm:${reqUid}:${p}:${t}:${a}`).setStyle(ButtonStyle.Success).setLabel('Apply').setDisabled(false);
    const cancelBtn = new ButtonBuilder().setCustomId(`loan:apply:cancel:${reqUid}`).setStyle(ButtonStyle.Secondary).setLabel('Cancel');
    await interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel), new ActionRowBuilder<ButtonBuilder>().addComponents(applyBtn, cancelBtn)] });
    return;
  }
}

export async function handleButton(interaction: ButtonInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  const parts = interaction.customId.split(':');
  const [prefix, action] = parts;
  if (prefix !== 'loan') return;
  if (action === 'apply') {
    const subtype = parts[2];
    const uid = parts[3];
    if (interaction.user.id !== uid) { await interaction.reply({ content: 'Not your application.', flags: MessageFlags.Ephemeral }).catch(() => { }); return; }
    if (subtype === 'toggleNotify') {
      const guildId = interaction.guildId!;
      const on = !getReminderPref(guildId, uid);
      setReminderPref(guildId, uid, on);
      // Parse amount/credit from select customId
      const selectComp: any = (interaction.message.components?.[0] as any)?.components?.[0];
      let amount = 0; let credit = 0;
      try {
        const parts2 = String(selectComp?.customId || '').split(':');
        amount = parseInt(parts2[4], 10) || 0;
        credit = parseInt(parts2[5], 10) || 0;
      } catch { }
      // Rebuild select options
      const offers = offersForAmount(amount, credit);
      const sel = new StringSelectMenuBuilder()
        .setCustomId(`loan:apply:select:${uid}:${amount}:${credit}`)
        .setPlaceholder('Choose your term')
        .addOptions(
          offers.map((o) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(`${o.termDays} days • ${(o.aprBps / 100).toFixed(2)}% APR`)
              .setDescription(`Due <t:${Math.floor(o.dueTs / 1000)}:R>`)
              .setValue(`${o.principal}:${o.termDays}:${o.aprBps}`),
          ),
        );
      // Preserve apply enabled + confirm id
      const existApply: any = (interaction.message.components?.[1] as any)?.components?.[0];
      const existCancel: any = (interaction.message.components?.[1] as any)?.components?.[2];
      const applyBtn = new ButtonBuilder()
        .setCustomId(String(existApply?.customId || `loan:apply:confirm:${uid}`))
        .setStyle(ButtonStyle.Success)
        .setLabel('Apply')
        .setDisabled(!!existApply?.disabled);
      const toggleBtn = new ButtonBuilder()
        .setCustomId(`loan:apply:toggleNotify:${uid}`)
        .setStyle(on ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setLabel(on ? 'Reminders: ON' : 'Reminders: OFF');
      const cancelBtn = new ButtonBuilder()
        .setCustomId(String(existCancel?.customId || `loan:apply:cancel:${uid}`))
        .setStyle(ButtonStyle.Secondary)
        .setLabel('Cancel');
      await interaction.editReply({
        components: [
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sel),
          new ActionRowBuilder<ButtonBuilder>().addComponents(applyBtn, toggleBtn, cancelBtn),
        ],
      }).catch(() => { });
      return;
    }
    if (subtype === 'cancel') {
      await interaction.update({ content: `Application canceled by <@${uid}>.`, embeds: [], components: [] }).catch(() => { });
      return;
    }
    if (subtype === 'confirm') {
      if (markOnce(`loan_apply_${interaction.message.id}`)) { await interaction.deferUpdate().catch(() => { }); return; }
      const p = parseInt(parts[4], 10);
      const t = parseInt(parts[5], 10);
      const a = parseInt(parts[6], 10);
      const loan = await createAndCredit(interaction.guildId, interaction.user.id, p, a, t);
      try { console.log(JSON.stringify({ msg: 'loan_apply_commit', userId: interaction.user.id, loanId: loan.id, principal: p, aprBps: a, termDays: t, guildId: interaction.guildId })); } catch { }
      const embed = new EmbedBuilder()
        .setTitle('Loan Approved')
        .setColor(0x2a7a2a)
        .setDescription(`Disbursed ${formatBolts(p)} to <@${uid}>. Due <t:${Math.floor(loan.due_ts / 1000)}:R>.`);
      await interaction.update({ embeds: [embed], components: [] }).catch(() => { });
      await interaction.followUp({ content: `📣 New loan: <@${uid}> took ${formatBolts(p)} at ${(a / 100).toFixed(2)}% for ${t}d.` }).catch(() => { });
      return;
    }
  }
  const size = parts[2];
  if (action !== 'pay') return;
  await interaction.deferUpdate().catch(() => { });
  const active = getActiveLoans(interaction.guildId, interaction.user.id).map(l => accrueOnTouch(interaction.guildId!, l));
  if (!active.length) { await interaction.followUp({ content: 'You have no loans.', flags: MessageFlags.Ephemeral }).catch(() => { }); return; }
  const loan = active[0];
  const owedInterest = loan.accrued_interest - loan.paid_interest;
  const owedPrincipal = loan.principal - loan.paid_principal;
  let payAmt = 0;
  if (size === 'min') payAmt = Math.max(1, Number(owedInterest));
  else if (size === 'half') payAmt = Math.max(1, Math.floor(Number(owedInterest + owedPrincipal) / 2));
  else payAmt = Math.max(1, Number(owedInterest + owedPrincipal));
  const bal = getBalance(interaction.guildId, interaction.user.id);
  const { HugeDecimal } = await import('../../lib/num/index.js');
  if (bal.lt(HugeDecimal.fromBigInt(BigInt(payAmt)))) {
    await interaction.followUp({ content: `Insufficient balance to pay ${formatBolts(payAmt)}.`, flags: MessageFlags.Ephemeral }).catch(() => { });
    return;
  }
  applyPayment(interaction.guildId, loan, payAmt);
  await adjustBalance(interaction.guildId, interaction.user.id, -payAmt, 'loan:payment');
  const newBal = getBalance(interaction.guildId, interaction.user.id);
  const primary = walletEmbed({ title: 'Payment Applied', headline: `Paid ${formatBolts(payAmt)}. New balance:`, pretty: formatBalance(newBal), exact: formatExact(newBal) });
  await interaction.editReply({ embeds: [primary], components: [] }).catch(() => { });
}
