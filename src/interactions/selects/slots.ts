import { StringSelectMenuInteraction, AttachmentBuilder, MessageFlags } from 'discord.js';
import { getBalance, adjustBalance } from '../../economy/wallet.js';
import { spin, defaultConfig } from '../../games/slots/engine.js';
import { cryptoRNG } from '../../util/rng.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { themedEmbed } from '../../ui/embeds.js';
import { safeReply } from '../../interactions/reply.js';

export async function handleSlotsSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, action, userId] = interaction.customId.split(':');
  if (prefix !== 'slots' || action !== 'betpreset') return;
  if (interaction.user.id !== userId) {
    await safeReply(interaction, { content: 'This selection is not for you.', flags: MessageFlags.Ephemeral });
    return;
  }
  const bet = parseInt(interaction.values[0], 10);
  if (!interaction.guildId) { await safeReply(interaction, { content: 'This bot only works in servers.', flags: MessageFlags.Ephemeral }); return; }
  const current = getBalance(interaction.guildId, userId);
  if (current < bet) {
    await safeReply(interaction, { content: `Insufficient balance for ${bet}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate().catch(() => { });
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
