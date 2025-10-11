import { ButtonInteraction, MessageFlags } from 'discord.js';
import { spin, defaultConfig, renderGrid } from '../../games/slots/engine.js';
import { adjustBalance, getBalance } from '../../economy/wallet.js';
import { themedEmbed } from '../../ui/embeds.js';
import { cryptoRNG } from '../../util/rng.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { AttachmentBuilder } from 'discord.js';
import { formatBolts } from '../../economy/currency.js';
import { outcomeMessage, formatBolt } from '../../ui/outcome.js';
import { uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline } from '../../util/amountRender.js';
import { getGuildDb } from '../../db/connection.js';
import { safeReply } from '../../interactions/reply.js';
import { withLock } from '../../util/locks.js';
import { withUserLuck } from '../../rng/luck.js';
import { onGambleXP } from '../../rank/xpEngine.js';
import { getSetting } from '../../db/kv.js';
import { rememberUserChannel } from '../../rank/announce.js';
import { assertWithinMaxBet } from '../../config/maxBet.js';
import { toBigInt } from '../../utils/bigint.js';

export async function handleSlotsButton(interaction: ButtonInteraction) {
  const [prefix, action, userId, betStr] = interaction.customId.split(':');
  if (prefix !== 'slots' || action !== 'spin') return;
  if (interaction.user.id !== userId) {
    await safeReply(interaction, { content: 'This button is not for you.', flags: MessageFlags.Ephemeral });
    return;
  }
  const bet = parseInt(betStr, 10);
  if (!interaction.guildId) { await safeReply(interaction, { content: 'This bot only works in servers.', flags: MessageFlags.Ephemeral }); return; }
  rememberUserChannel(interaction.guildId, interaction.user.id, interaction.channelId);
  const current = getBalance(interaction.guildId, userId);
  // Centralized max gate
  try { assertWithinMaxBet(getGuildDb(interaction.guildId), toBigInt(bet)); } catch (e: any) {
    if (e?.code === 'ERR_MAX_BET') { try { console.debug({ msg: 'bet_blocked', code: 'ERR_MAX_BET', guildId: interaction.guildId, userId, bet: String(bet) }); } catch {} await safeReply(interaction, { content: e.message, flags: MessageFlags.Ephemeral }); return; }
  }
  if (current < BigInt(bet)) {
    const db = getGuildDb(interaction.guildId);
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(current, sig) : formatBolts(current);
    await safeReply(interaction, {
      content: `Insufficient balance for ${formatBolts(bet)}. Your balance is ${balText}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await withLock(`slots:${interaction.message?.id || interaction.id}`, async () => {
    await interaction.deferUpdate().catch(() => { });
    const db = getGuildDb(interaction.guildId!);
    const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
    const rng = (max: number) => Math.floor(((ranksEnabled ? withUserLuck(interaction.guildId!, userId, () => Math.random()) : Math.random())) * max);
    const result = spin(bet, defaultConfig, rng);
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
    // XP grant once per completed round
    try { if (ranksEnabled) onGambleXP(interaction.guildId!, userId, bet, Number(newBal)); } catch { }
    await interaction.editReply({ embeds: [embed], files: [file], components: [] }).catch(() => { });
  });
}
