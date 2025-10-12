import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { adjustBalance, getBalance } from '../../economy/wallet.js';
import { themedEmbed } from '../../ui/embeds.js';
import { spin, defaultConfig, renderGrid } from './engine.js';
import { cryptoRNG } from '../../util/rng.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { AttachmentBuilder, ActionRowBuilder as Row, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags } from 'discord.js';
import { formatBolts } from '../../economy/currency.js';
import { getGuildDb } from '../../db/connection.js';
import { outcomeMessage, formatBolt } from '../../ui/outcome.js';
import { slotsLimits, safeDefer, safeEdit, replyError, uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline } from '../../util/amountRender.js';
import { ensureGuildInteraction } from '../../interactions/guards.js';
import { withUserLuck } from '../../rng/luck.js';
import { awardGameXp } from '../../rank/xp.js';
import { formatXpLine } from '../../ui/xpLine.js';
import { rememberUserChannel } from '../../rank/announce.js';
import { getSetting } from '../../db/kv.js';
import { assertWithinMaxBet } from '../../config/maxBet.js';
import { toBigInt } from '../../utils/bigint.js';

export const data = new SlashCommandBuilder()
  .setName('slots')
  .setDescription('Spin the 3x3 slots')
  .addStringOption((opt) =>
    opt.setName('bet').setDescription('Bet amount (e.g., 2.5m, 1b)').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!await ensureGuildInteraction(interaction)) return;
  rememberUserChannel(interaction.guildId!, interaction.user.id, interaction.channelId);
  await safeDefer(interaction, false);
  try {
    const { getParsedAmount } = await import('../../interactions/options.js');
    const parsed = await getParsedAmount(interaction as any, 'bet');
    const bet = Number(parsed.value);
    const userId = interaction.user.id;
    const current = getBalance(interaction.guildId!, userId);
    // limits
    const db = getGuildDb(interaction.guildId!);
    const { minBet } = slotsLimits(db);
    // Centralized max bet guard
    try { assertWithinMaxBet(db, BigInt(parsed.value)); } catch (e: any) {
      if (e?.code === 'ERR_MAX_BET') {
        try { console.debug({ msg: 'bet_blocked', code: 'ERR_MAX_BET', guildId: interaction.guildId, userId, bet: String(bet) }); } catch {}
        return safeEdit(interaction, { content: e.message });
      }
      throw e;
    }
    if (bet < minBet) {
      return safeEdit(interaction, { flags: MessageFlags.Ephemeral, content: `Minimum bet is ${formatBolts(minBet)}.` });
    }
    if (current < BigInt(bet)) {
      const mode = uiExactMode(db, "guild");
      const sig = uiSigFigs(db);
      const balText = mode === "inline" ? renderAmountInline(current, sig) : formatBolts(current);
      return safeEdit(interaction, { flags: MessageFlags.Ephemeral, content: `Insufficient balance. Your balance is ${balText}.` });
    }
    const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
    const biasedRng = (max: number) => Math.floor(((ranksEnabled ? withUserLuck(interaction.guildId!, userId, () => Math.random()) : Math.random())) * max);
    const result = spin(bet, defaultConfig, biasedRng);
    const net = result.payout - bet;
    await adjustBalance(interaction.guildId!, userId, -bet, 'slots:bet');
    if (result.payout > 0) await adjustBalance(interaction.guildId!, userId, result.payout, 'slots:win');
    const newBal = getBalance(interaction.guildId!, userId);
    const theme = getGuildTheme(interaction.guildId!);
    const card = await generateCard({
      layout: 'GameResult',
      theme,
      payload: { kind: 'slots', grid: result.grid as any, bet, payout: result.payout, delta: net, balance: newBal },
    });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const headline = net > 0 ? outcomeMessage('win', net) : net < 0 ? outcomeMessage('loss', Math.abs(net)) : outcomeMessage('push');
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(newBal, sig) : formatBolt(newBal);

    // Award XP for completed round
    let xpLine = '';
    try {
      const grant = await awardGameXp(interaction.guildId!, userId, {
        wager: BigInt(bet),
        game: 'slots',
        rounds: 1
      });
      const xpText = formatXpLine(grant);
      if (xpText) {
        xpLine = `\n${xpText}`;
      }
    } catch { }

    const embed = themedEmbed(theme, '🎰 Slots', `${headline}
New balance: ${balText}${xpLine}`).setImage(
      `attachment://${card.filename}`,
    );

    const primary = new Row<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`slots:spin:${userId}:${bet}`).setStyle(ButtonStyle.Primary).setLabel('Spin Again'),
      new ButtonBuilder().setCustomId(`slots:change:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Change Bet'),
    );
    const betSelect = new StringSelectMenuBuilder()
      .setCustomId(`slots:betpreset:${userId}`)
      .setPlaceholder('Quick bet sizes');
    // Build unique preset bet options to avoid duplicate values
    const base = Number(newBal);
    const presets: Array<{ pct: number; val: number }> = [0.01, 0.05, 0.1, 0.25]
      .map(p => ({ pct: p, val: Math.max(1, Math.floor(base * p)) }))
      .filter(x => Number.isFinite(x.val));
    const seen = new Set<number>();
    for (const x of presets) {
      if (seen.has(x.val)) continue;
      seen.add(x.val);
      betSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${Math.round(x.pct * 100)}% (${formatBolts(x.val)})`)
          .setValue(String(x.val))
      );
    }
    return safeEdit(interaction, { embeds: [embed], files: [file], components: [primary, new Row<any>().addComponents(betSelect as any)] });
  } catch (e: any) {
    return replyError(interaction, "ERR-SLOTS", console, { err: String(e) });
  }
}

export function makeSpinAgainButtonId(userId: string, bet: number) {
  return `slots:spin:${userId}:${bet}`;
}
