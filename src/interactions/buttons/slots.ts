import { ButtonInteraction } from 'discord.js';
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

export async function handleSlotsButton(interaction: ButtonInteraction) {
  const [prefix, action, userId, betStr] = interaction.customId.split(':');
  if (prefix !== 'slots' || action !== 'spin') return;
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'This button is not for you.' });
    return;
  }
  const bet = parseInt(betStr, 10);
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  const current = getBalance(interaction.guildId, userId);
  if (current < bet) {
    const db = getGuildDb(interaction.guildId);
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(current, sig) : formatBolts(current);
    await interaction.reply({
      content: `Insufficient balance for ${formatBolts(bet)}. Your balance is ${balText}.`,
    });
    return;
  }
  await interaction.deferReply({ ephemeral: false });
  const result = spin(bet, defaultConfig, cryptoRNG);
  const net = result.payout - bet;
  await adjustBalance(interaction.guildId, userId, -bet, 'slots:bet');
  if (result.payout > 0) await adjustBalance(interaction.guildId, userId, result.payout, 'slots:win');
  const newBal = getBalance(interaction.guildId, userId);
  const theme = getGuildTheme(interaction.guildId);
  const card = await generateCard({
    layout: 'GameResult',
    theme,
    payload: { kind: 'slots', grid: result.grid as any, bet, payout: result.payout, delta: net, balance: newBal },
  });
  const file = new AttachmentBuilder(card.buffer, { name: card.filename });
  const headline = net > 0 ? outcomeMessage('win', net) : net < 0 ? outcomeMessage('loss', Math.abs(net)) : outcomeMessage('push');
  const db = getGuildDb(interaction.guildId);
  const mode = uiExactMode(db, "guild");
  const sig = uiSigFigs(db);
  const balText = mode === "inline" ? renderAmountInline(newBal, sig) : formatBolt(newBal);
  const embed = themedEmbed(theme, '🎰 Slots', `${headline}
New balance: ${balText}`).setImage(
    `attachment://${card.filename}`,
  );
  await interaction.editReply({ embeds: [embed], files: [file], components: [] });
}
