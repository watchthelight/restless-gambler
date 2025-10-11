import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { adjustBalance, getBalance } from '../../economy/wallet.js';
import { themedEmbed } from '../../ui/embeds.js';
import { cryptoRNG } from '../../util/rng.js';
import { resolveBets, spinWheel } from './engine.js';
import type { Bet } from './types.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } from 'discord.js';
import { formatBolts } from '../../economy/currency.js';
import { getGuildDb } from '../../db/connection.js';
import { outcomeMessage, formatBolt } from '../../ui/outcome.js';
import { getSettingNum } from '../../db/kv.js';
import { safeDefer, safeEdit, replyError, uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline } from '../../util/amountRender.js';
import { ensureGuildInteraction } from '../../interactions/guards.js';
import { withUserLuck } from '../../rng/luck.js';
import { onGambleXP } from '../../rank/xpEngine.js';
import { rememberUserChannel } from '../../rank/announce.js';
import { getSetting } from '../../db/kv.js';
import { assertWithinMaxBet } from '../../config/maxBet.js';
import { toBigInt } from '../../utils/bigint.js';

export const data = new SlashCommandBuilder()
  .setName('roulette')
  .setDescription('Place a roulette bet')
  .addIntegerOption((opt) =>
    opt.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1),
  )
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Bet type')
      .setRequired(true)
      .addChoices(
        { name: 'straight', value: 'straight' },
        { name: 'split', value: 'split' },
        { name: 'street', value: 'street' },
        { name: 'corner', value: 'corner' },
        { name: 'line', value: 'line' },
        { name: 'dozen', value: 'dozen' },
        { name: 'column', value: 'column' },
        { name: 'red', value: 'red' },
        { name: 'black', value: 'black' },
        { name: 'odd', value: 'odd' },
        { name: 'even', value: 'even' },
        { name: 'low', value: 'low' },
        { name: 'high', value: 'high' },
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName('selection')
      .setDescription('Selection (e.g., 17 or comma-separated for splits)')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!await ensureGuildInteraction(interaction)) return;

  const userId = interaction.user.id;
  rememberUserChannel(interaction.guildId!, interaction.user.id, interaction.channelId);
  const betAmount = interaction.options.getInteger('bet', true);
  const type = interaction.options.getString('type', true) as Bet['type'];
  const selection = interaction.options.getString('selection') ?? '';
  const db = getGuildDb(interaction.guildId!);

  // KV-driven with sane defaults
  let minBet = getSettingNum(db, 'roulette.min_bet', 10);
  let maxBet = getSettingNum(db, 'roulette.max_bet', 1000);
  let maxMult = getSettingNum(db, 'roulette.max_mult', 36);
  let delayS = getSettingNum(db, 'roulette.timeout_s', 2);

  // Optional legacy fallback if KV is unset and a legacy table exists
  try {
    const hasLegacy = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='roulette_config'").get();
    if (hasLegacy) {
      const row = db.prepare("SELECT min_bet, max_bet, max_mult, timeout_s FROM roulette_config LIMIT 1").get() as { min_bet?: number; max_bet?: number; max_mult?: number; timeout_s?: number } | undefined;
      if (row) {
        if (!Number.isFinite(minBet)) minBet = row.min_bet ?? minBet;
        if (!Number.isFinite(maxBet)) maxBet = row.max_bet ?? maxBet;
        if (!Number.isFinite(maxMult)) maxMult = row.max_mult ?? maxMult;
        if (!Number.isFinite(delayS)) delayS = row.timeout_s ?? delayS;
      }
    }
  } catch { }

  // Centralized max bet guard
  try { assertWithinMaxBet(db, toBigInt(betAmount)); } catch (e: any) {
    if (e?.code === 'ERR_MAX_BET') { try { console.debug({ msg: 'bet_blocked', code: 'ERR_MAX_BET', guildId: interaction.guildId, userId, bet: String(betAmount) }); } catch {}
      await interaction.reply({ content: e.message }); return; }
    throw e;
  }
  if (betAmount < minBet) {
    await interaction.reply({ content: `Minimum bet is ${formatBolts(minBet)}.` });
    return;
  }
  const bal = getBalance(interaction.guildId!, userId);
  if (bal < betAmount) {
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(bal, sig) : formatBolts(bal);
    await interaction.reply({ content: `Insufficient balance (${balText}).` });
    return;
  }

  await safeDefer(interaction, false);
  try {
    const bet: Bet = { type, amount: betAmount, selection };
    const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
    const rng = (max: number) => Math.floor(((ranksEnabled ? withUserLuck(interaction.guildId!, userId, () => Math.random()) : Math.random())) * max);
    const outcome = spinWheel(rng);
    const summary = resolveBets(outcome, [bet]);
    await adjustBalance(interaction.guildId!, userId, -betAmount, 'roulette:bet');
    if (summary.payout > 0) await adjustBalance(interaction.guildId!, userId, summary.payout, 'roulette:win');
    const newBal = getBalance(interaction.guildId!, userId);

    const theme = getGuildTheme(interaction.guildId!);
    const delta = summary.payout - betAmount;
    const card = await generateCard({
      layout: 'GameResult',
      theme,
      payload: { kind: 'roulette', number: summary.number, color: summary.color, bet: betAmount, payout: summary.payout, delta, balance: newBal },
    });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const headline = delta > 0 ? outcomeMessage('win', delta) : delta < 0 ? outcomeMessage('loss', Math.abs(delta)) : outcomeMessage('push');
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(newBal, sig) : formatBolt(newBal);
    const embed = themedEmbed(theme, '🎡 Roulette', `${summary.number} (${summary.color})
${headline}
New balance: ${balText}`).setImage(`attachment://${card.filename}`);

    const primary = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`roulette:repeat:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Repeat Bet'),
      new ButtonBuilder().setCustomId(`roulette:clear:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Clear'),
      new ButtonBuilder().setCustomId(`roulette:preset:${userId}:red`).setStyle(ButtonStyle.Success).setLabel('Red'),
      new ButtonBuilder().setCustomId(`roulette:preset:${userId}:black`).setStyle(ButtonStyle.Danger).setLabel('Black'),
    );
    const selects = new StringSelectMenuBuilder()
      .setCustomId(`roulette:presets:${userId}`)
      .setPlaceholder('Even/Odd/Dozens')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Even').setValue('even'),
        new StringSelectMenuOptionBuilder().setLabel('Odd').setValue('odd'),
        new StringSelectMenuOptionBuilder().setLabel('1st 12').setValue('dozen:1'),
        new StringSelectMenuOptionBuilder().setLabel('2nd 12').setValue('dozen:2'),
        new StringSelectMenuOptionBuilder().setLabel('3rd 12').setValue('dozen:3'),
      );
    // XP grant once per completed round
    try { if (ranksEnabled) onGambleXP(interaction.guildId!, userId, betAmount, Number(newBal)); } catch { }
    await safeEdit(interaction, { embeds: [embed], files: [file], components: [primary, new ActionRowBuilder<any>().addComponents(selects as any)] });
  } catch (e: any) {
    await replyError(interaction, "ERR-ROULETTE", console, { err: String(e) });
  }
}

export async function handleRouletteButton(interaction: any) {
  const [prefix, action, userId] = interaction.customId.split(':');
  if (prefix !== 'roulette' || interaction.user.id !== userId) return;
  await safeDefer(interaction, true);
  try {
    // For now, just update with a message
    await safeEdit(interaction, { content: `Roulette button ${action} pressed.`, components: [] });
  } catch (e: any) {
    await replyError(interaction, "ERR-ROULETTE-BTN", console, { err: String(e) });
  }
}
