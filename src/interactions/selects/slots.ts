import { StringSelectMenuInteraction, AttachmentBuilder } from 'discord.js';
import { getBalance, adjustBalance } from '../../economy/wallet.js';
import { spin, defaultConfig } from '../../games/slots/engine.js';
import { cryptoRNG } from '../../util/rng.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { themedEmbed } from '../../ui/embeds.js';

export async function handleSlotsSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, action, userId] = interaction.customId.split(':');
  if (prefix !== 'slots' || action !== 'betpreset') return;
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'This selection is not for you.' });
    return;
  }
  const bet = parseInt(interaction.values[0], 10);
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  const current = getBalance(interaction.guildId, userId);
  if (current < bet) {
    await interaction.reply({ content: `Insufficient balance for ${bet}.` });
    return;
  }
  await interaction.deferReply();
  const result = spin(bet, defaultConfig, cryptoRNG);
  const net = result.payout - bet;
  await adjustBalance(interaction.guildId, userId, -bet, 'slots:bet');
  if (result.payout > 0) await adjustBalance(interaction.guildId, userId, result.payout, 'slots:win');
  const newBal = getBalance(interaction.guildId, userId);
  const theme = getGuildTheme(interaction.guildId);
  const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'slots', grid: result.grid as any, bet, payout: result.payout, delta: net, balance: newBal } });
  const file = new AttachmentBuilder(card.buffer, { name: card.filename });
  const embed = themedEmbed(theme, '🎰 Slots', net >= 0 ? `Win +${net}` : `Loss ${net}`).setImage(`attachment://${card.filename}`);
  await interaction.editReply({ embeds: [embed], files: [file] });
}
