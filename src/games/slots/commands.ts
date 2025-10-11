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
import { onGambleXP } from '../../rank/xpEngine.js';
import { rememberUserChannel } from '../../rank/announce.js';
import { getSetting } from '../../db/kv.js';

export const data = new SlashCommandBuilder()
  .setName('slots')
  .setDescription('Spin the 3x3 slots')
  .addIntegerOption((opt) =>
    opt.setName('bet').setDescription('Bet amount').setMinValue(1).setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!await ensureGuildInteraction(interaction)) return;
  rememberUserChannel(interaction.guildId!, interaction.user.id, interaction.channelId);
  await safeDefer(interaction, false);
  try {
    const bet = interaction.options.getInteger('bet', true);
    const userId = interaction.user.id;
    const current = getBalance(interaction.guildId!, userId);
    // limits
    const db = getGuildDb(interaction.guildId!);
    const { minBet, maxBet } = slotsLimits(db);
    if (bet < minBet) {
      return safeEdit(interaction, { flags: MessageFlags.Ephemeral, content: `Minimum bet is ${formatBolts(minBet)}.` });
    }
    if (bet > maxBet) {
      return safeEdit(interaction, { flags: MessageFlags.Ephemeral, content: `Maximum bet is ${formatBolts(maxBet)}.` });
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
    const embed = themedEmbed(theme, '🎰 Slots', `${headline}
New balance: ${balText}`).setImage(
      `attachment://${card.filename}`,
    );

    const primary = new Row<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`slots:spin:${userId}:${bet}`).setStyle(ButtonStyle.Primary).setLabel('Spin Again'),
      new ButtonBuilder().setCustomId(`slots:change:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Change Bet'),
    );
    const betSelect = new StringSelectMenuBuilder()
      .setCustomId(`slots:betpreset:${userId}`)
      .setPlaceholder('Quick bet sizes')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel(`1% (${formatBolts(Math.max(1, Math.floor(Number(newBal) * 0.01)))})`).setValue(String(Math.max(1, Math.floor(Number(newBal) * 0.01)))),
        new StringSelectMenuOptionBuilder().setLabel(`5% (${formatBolts(Math.max(1, Math.floor(Number(newBal) * 0.05)))})`).setValue(String(Math.max(1, Math.floor(Number(newBal) * 0.05)))),
        new StringSelectMenuOptionBuilder().setLabel(`10% (${formatBolts(Math.max(1, Math.floor(Number(newBal) * 0.1)))})`).setValue(String(Math.max(1, Math.floor(Number(newBal) * 0.1)))),
        new StringSelectMenuOptionBuilder().setLabel(`25% (${formatBolts(Math.max(1, Math.floor(Number(newBal) * 0.25)))})`).setValue(String(Math.max(1, Math.floor(Number(newBal) * 0.25)))),
      );
    // XP grant once per completed round
    try {
      if (ranksEnabled) {
        onGambleXP(interaction.guildId!, userId, bet, Number(newBal));
      }
    } catch { }
    return safeEdit(interaction, { embeds: [embed], files: [file], components: [primary, new Row<any>().addComponents(betSelect as any)] });
  } catch (e: any) {
    return replyError(interaction, "ERR-SLOTS", console, { err: String(e) });
  }
}

export function makeSpinAgainButtonId(userId: string, bet: number) {
  return `slots:spin:${userId}:${bet}`;
}
