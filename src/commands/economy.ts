import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { adjustBalance, getBalance, transfer } from '../economy/wallet.js';
import { claimDaily } from '../economy/faucet.js';
import { themedEmbed } from '../ui/embeds.js';
import { getGuildTheme } from '../ui/theme.js';
import { AttachmentBuilder, StringSelectMenuBuilder, ActionRowBuilder, StringSelectMenuOptionBuilder, MessageFlags } from 'discord.js';
import { generateCard } from '../ui/cardFactory.js';
import { topForGuild } from '../economy/leaderboard.js';
import { getUserMeta } from '../util/userMeta.js';
import { CURRENCY_NAME, CURRENCY_EMOJI, formatBolts } from '../economy/currency.js';
import { uiExactMode, uiSigFigs } from '../game/config.js';
import { renderAmountInline, componentsForExact } from '../util/amountRender.js';
import { getGuildDb } from '../db/connection.js';
import { dbToBigint, toBigInt, bigintToDb } from '../utils/bigint.js';
import { safeDefer } from '../interactions/reply.js';
import { formatBalance, formatExact } from '../util/formatBalance.js';
import { walletEmbed } from './shared/walletView.js';
import { send } from '../ui/reply.js';
import { ensureGuildInteraction } from '../interactions/guards.js';
import { isRateLimited, getRateLimitReset } from '../util/ratelimit.js';
import { withUserLuck } from '../rng/luck.js';
import { onGambleXP } from '../rank/xpEngine.js';
import { rememberUserChannel } from '../rank/announce.js';
import { getSetting } from '../db/kv.js';

export const commands = [
  new SlashCommandBuilder().setName('balance').setDescription('Show your play-money balance'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily bonus (24h cooldown)'),
  new SlashCommandBuilder()
    .setName('give')
    .setDescription('Give currency to another user')
    .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
    .addStringOption((o) => o.setName('amount').setDescription('Amount (e.g., 2.5m, 1b, 750k)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer chips to another user')
    .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
    .addStringOption((o) => o.setName('amount').setDescription('Amount (e.g., 2.5m, 1b, 750k)').setRequired(true)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show top balances')
    .addStringOption((o) =>
      o
        .setName('scope')
        .setDescription('Scope of leaderboard')
        .addChoices(
          { name: 'global', value: 'global' },
          { name: 'server', value: 'server' },
        ),
    ),
  new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Wager an amount with fair odds')
    .addStringOption((o) => o.setName('amount').setDescription('Amount to wager (e.g., 2.5m)').setRequired(true)),
  new SlashCommandBuilder().setName('cooldown').setDescription('Show your active cooldowns'),
  new SlashCommandBuilder().setName('resetme').setDescription('Reset your balance and stats (confirmation required)'),
  new SlashCommandBuilder().setName('help').setDescription('Show help and disclaimer'),
];

export async function handleEconomy(interaction: ChatInputCommandInteraction) {
  switch (interaction.commandName) {
    case 'balance': {
      if (!await ensureGuildInteraction(interaction)) break;
      await safeDefer(interaction, { ephemeral: false });
      const bal = getBalance(interaction.guildId!, interaction.user.id);
      const pretty = formatBalance(bal);
      const exact = formatExact(bal);
      const embed = walletEmbed({ title: 'Wallet', headline: 'Your balance:', pretty, exact });
      try {
        const { getScore } = await import('../loans/credit.js');
        const { getActiveLoans } = await import('../loans/store.js');
        const score = getScore(interaction.guildId!, interaction.user.id);
        const loans = getActiveLoans(interaction.guildId!, interaction.user.id);
        const active = loans.filter(l => l.status === 'active').length;
        const late = loans.filter(l => l.status === 'late').length;
        const def = loans.filter(l => l.status === 'defaulted').length;
        const lines: string[] = [];
        lines.push(`\nCredit score: ${score}/100`);
        if (loans.length) {
          lines.push(`Loans: ${active} active${late ? `, ${late} late` : ''}${def ? `, ${def} defaulted` : ''}`);
          // Oldest loan summary
          const loan = loans[0];
          const remaining = (loan.principal - loan.paid_principal) + (loan.accrued_interest - loan.paid_interest);
          const days = Math.ceil((loan.due_ts - Date.now())/86_400_000);
          const dueTxt = days >= 0 ? `${days}d` : `${-days}d overdue`;
          lines.push(`Next due: ${dueTxt} • Remaining: ${formatBalance(Number(remaining))} (exact: ${formatExact(remaining)})`);
        }
        const desc = (embed.data.description || '').toString() + lines.join('\n');
        (embed as any).data.description = desc;
      } catch { }
      await interaction.editReply({ embeds: [embed], components: [] });
      break;
    }
    case 'daily': {
      if (!await ensureGuildInteraction(interaction)) break;
      await safeDefer(interaction, { ephemeral: false });
      try {
        const bal = await claimDaily(interaction.guildId!, interaction.user.id);
        const pretty = formatBalance(bal);
        const exact = formatExact(bal);
        const embed = walletEmbed({ title: 'Daily', headline: 'Claimed daily bonus. New balance:', pretty, exact });
        console.log(JSON.stringify({ msg: 'econ', event: 'daily_claim', guildId: interaction.guildId, userId: interaction.user.id }));
        await interaction.editReply({ embeds: [embed], components: [] });
      } catch (e: any) {
        await interaction.editReply({ content: e.message || 'Daily is on cooldown.' });
      }
      break;
    }
    case 'give': {
      // Alias to transfer
      if (!await ensureGuildInteraction(interaction)) break;

      // Rate limit check
      if (isRateLimited(interaction.user.id, 'give')) {
        const resetMs = getRateLimitReset(interaction.user.id, 'give');
        const resetSec = Math.ceil(resetMs / 1000);
        await interaction.reply({
          content: `Rate limit exceeded. Try again in ${resetSec} second${resetSec !== 1 ? 's' : ''}.`,
          flags: MessageFlags.Ephemeral
        });
        break;
      }

      const user = interaction.options.getUser('user', true);
      const { getParsedAmount } = await import('../interactions/options.js');
      const parsed = await getParsedAmount(interaction, 'amount');
      const amount = Number(parsed.value);

      // Clamp amount to 10% of sender balance
      const senderBalance = Number(getBalance(interaction.guildId!, interaction.user.id));
      const maxGiveAmount = Math.floor(senderBalance * 0.1);
      const cappedAmount = Math.min(amount, maxGiveAmount);

      if (cappedAmount < amount) {
        await interaction.reply({
          content: `You can only give up to 10% of your balance (${formatBolts(maxGiveAmount)}). Amount clamped to ${formatBolts(cappedAmount)}.`,
          flags: MessageFlags.Ephemeral
        });
        break;
      }

      await safeDefer(interaction, { ephemeral: false });
      try {
        const { from } = await transfer(interaction.guildId!, interaction.user.id, user.id, amount);
        const pretty = formatBalance(from);
        const exact = formatExact(from);
        const headline = `Gave ${formatBolts(amount)} to ${user.tag}. New balance:`;
        const embed = walletEmbed({ title: 'Give', headline, pretty, exact });
        console.log(JSON.stringify({ msg: 'econ', event: 'transfer', from: interaction.user.id, to: user.id, amount }));
        await interaction.editReply({ embeds: [embed], components: [] });
      } catch (e: any) {
        await interaction.editReply({ content: e.message || 'Give failed.' });
      }
      break;
    }
    case 'transfer': {
      if (!await ensureGuildInteraction(interaction)) break;
      await safeDefer(interaction, { ephemeral: false });
      const user = interaction.options.getUser('user', true);
      const { getParsedAmount: getParsedAmount2 } = await import('../interactions/options.js');
      const parsed2 = await getParsedAmount2(interaction, 'amount');
      const amount = parsed2.value;
      try {
        const { from } = await transfer(interaction.guildId!, interaction.user.id, user.id, amount);
        const pretty = formatBalance(from);
        const exact = formatExact(from);
        const headline = `Sent ${formatBolts(amount)} to ${user.tag}. New balance:`;
        const embed = walletEmbed({ title: 'Transfer', headline, pretty, exact });
        await interaction.editReply({ embeds: [embed], components: [] });
      } catch (e: any) {
        await interaction.editReply({ content: e.message || 'Transfer failed.' });
      }
      break;
    }
    case 'leaderboard': {
      if (!await ensureGuildInteraction(interaction)) break;
      const theme = getGuildTheme(interaction.guildId!);
      const scope = (interaction.options.getString('scope') ?? 'server') as 'global' | 'server';
      // Treat global same as server under per-guild isolation
      let rows: { user_id: string; balance: number }[] = topForGuild(interaction.guildId!, 10);
      const metaRows: { rank: number; user: string; value: number; displayName?: string; avatarUrl?: string }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const meta = await getUserMeta(interaction.client, interaction.guildId, r.user_id);
        metaRows.push({ rank: i + 1, user: `<@${r.user_id}>`, value: r.balance, displayName: meta.displayName, avatarUrl: meta.avatarUrl });
      }
      const payload = { rows: metaRows } as any;
      const card = await generateCard({ layout: 'List', theme, payload });
      const file = new AttachmentBuilder(card.buffer, { name: card.filename });
      const embed = themedEmbed(theme, '🏆 Top Bolts Holders', 'Server top 10').setImage(`attachment://${card.filename}`);
      await interaction.reply({ embeds: [embed], files: [file] });
      break;
    }
    case 'gamble': {
      if (!await ensureGuildInteraction(interaction)) break;
      rememberUserChannel(interaction.guildId!, interaction.user.id, interaction.channelId);

      // Rate limit check
      if (isRateLimited(interaction.user.id, 'gamble')) {
        const resetMs = getRateLimitReset(interaction.user.id, 'gamble');
        const resetSec = Math.ceil(resetMs / 1000);
        await interaction.reply({
          content: `Rate limit exceeded. Try again in ${resetSec} second${resetSec !== 1 ? 's' : ''}.`,
          flags: MessageFlags.Ephemeral
        });
        break;
      }

      const { getParsedAmount: getParsedAmount3 } = await import('../interactions/options.js');
      const parsed3 = await getParsedAmount3(interaction, 'amount');
      const amount = Number(parsed3.value);
      if (amount <= 0) { await interaction.reply({ content: 'Amount must be positive.' }); break; }
      const max = parseInt(process.env.GAMBLE_MAX_BET || '0', 10);
      if (max > 0 && amount > max) { await interaction.reply({ content: `Max bet is ${max}.` }); break; }
      const odds = Math.max(0, Math.min(1, parseFloat(process.env.GAMBLE_ODDS_WIN || '0.48')));
      const cdSec = parseInt(process.env.GAMBLE_COOLDOWN_SEC || '0', 10) || 0;
      const { getRemaining, setCooldown } = await import('../economy/cooldowns.js');
      const nowLeft = getRemaining(interaction.guildId!, interaction.user.id, 'gamble');
      if (nowLeft > 0) { await interaction.reply({ content: `Cooldown: wait ${Math.ceil(nowLeft)}s.` }); break; }
      await safeDefer(interaction, { ephemeral: false });
      // Atomic update via wallet lock
      try {
        const { getGuildDb } = await import('../db/connection.js');
        const { userLocks } = await import('../util/locks.js');
        const db = getGuildDb(interaction.guildId!);
        const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
        const roll = ranksEnabled
          ? withUserLuck(interaction.guildId!, interaction.user.id, () => Math.random())
          : Math.random();
        const result = await userLocks.runExclusive(`wallet:${interaction.guildId!}:${interaction.user.id}`, async () => {
          const tx = db.transaction(() => {
            const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(interaction.user.id) as { balance?: number | string | bigint } | undefined;
            const bal = row?.balance != null ? dbToBigint(row.balance) : 0n;
            if (bal < BigInt(amount)) throw new Error('Insufficient balance');
            const loseOrWin = roll < odds ? 'win' : 'lose';
            const amt = toBigInt(amount);
            const delta = loseOrWin === 'win' ? amt : -amt;
            const newBal = bal + delta;
            db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance, updated_at=excluded.updated_at').run(
              interaction.user.id,
              bigintToDb(newBal),
              Date.now(),
            );
            db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES(?,?,?,?)').run(
              interaction.user.id,
              Number(delta),
              `gamble:${loseOrWin}`,
              Date.now(),
            );
            return { newBal, delta: Number(delta), result: loseOrWin };
          });
          return tx() as unknown as { newBal: bigint; delta: number; result: 'win' | 'lose' };
        });
        if (cdSec > 0) setCooldown(interaction.guildId!, interaction.user.id, 'gamble', cdSec);
        const pretty = formatBalance(result.newBal);
        const exact = formatExact(result.newBal);
        const betPretty = formatBolts(Math.abs(amount));
        const headline = result.result === 'win' ? `WIN +${betPretty} 🪙. New balance:` : `LOSE -${betPretty} 🪙. New balance:`;
        const embed = walletEmbed({ title: 'Gamble', headline, pretty, exact });
        console.log(JSON.stringify({ msg: 'econ_gamble_result', userId: interaction.user.id, bet: amount, result: result.result, delta: result.delta, guildId: interaction.guildId }));
        await interaction.editReply({ embeds: [embed], components: [], allowedMentions: { parse: [] } });

        // XP grant once per completed round
        try {
          if (ranksEnabled) {
            const wallet = getBalance(interaction.guildId!, interaction.user.id);
            onGambleXP(interaction.guildId!, interaction.user.id, amount, Number(wallet));
          }
        } catch { }
      } catch (e: any) {
        await interaction.editReply({ content: e.message || 'Gamble failed.' });
      }
      break;
    }
    case 'cooldown': {
      if (!await ensureGuildInteraction(interaction)) break;
      const { listCooldowns } = await import('../economy/cooldowns.js');
      const list = listCooldowns(interaction.guildId!, interaction.user.id);
      const rows = list
        .map((c) => ({ key: c.key, left: Math.max(0, Math.floor((c.next_at - Date.now()) / 1000)) }))
        .filter((r) => r.left > 0)
        .map((r) => `• **${r.key}**: \`${r.left}s\``);
      const desc = rows.length ? rows.join('\n') : 'No active cooldowns.';
      const emb = themedEmbed('neutral', 'Cooldowns', desc, undefined, { user: interaction.user, guildName: interaction.guild?.name });
      await send(interaction, { embeds: [emb] });
      break;
    }
    case 'resetme': {
      if (!await ensureGuildInteraction(interaction)) break;
      const djs: any = await import('discord.js');
      const customId = `econ:resetme:confirm:${interaction.user.id}:${Date.now()}`;
      const row = new djs.ActionRowBuilder().addComponents(
        new djs.ButtonBuilder().setCustomId(customId).setStyle(djs.ButtonStyle.Danger).setLabel('Confirm Reset'),
      );
      await interaction.reply({ content: 'This will reset your balance and cooldowns. Are you sure?', components: [row], flags: djs.MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      break;
    }
    case 'help': {
      const embed = themedEmbed('info', 'Help', 'Play-money casino minigames with rich cards.', undefined, { user: interaction.user, guildName: interaction.guild?.name }).addFields(
        { name: 'Economy', value: '/balance /daily /transfer /leaderboard', inline: false },
        { name: 'Games', value: '/slots /roulette /blackjack /holdem', inline: false },
        { name: 'Currency', value: `Currency: ${CURRENCY_NAME} (${CURRENCY_EMOJI}). Play-money only; has no real-world value. Example: /slots bet:100 => Bets ${formatBolts(100)}.`, inline: false },
      );
      await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      break;
    }
  }
}
