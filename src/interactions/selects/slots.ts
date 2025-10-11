import { StringSelectMenuInteraction, AttachmentBuilder, MessageFlags } from 'discord.js';
import { getBalance, adjustBalance } from '../../economy/wallet.js';
import { spin, defaultConfig } from '../../games/slots/engine.js';
import { cryptoRNG } from '../../util/rng.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { themedEmbed } from '../../ui/embeds.js';
import { safeReply } from '../../interactions/reply.js';
import { getGuildDb } from '../../db/connection.js';
import { withUserLuck } from '../../rng/luck.js';
import { onGambleXP } from '../../rank/xpEngine.js';
import { getSetting } from '../../db/kv.js';
import { rememberUserChannel } from '../../rank/announce.js';

export async function handleSlotsSelect(interaction: StringSelectMenuInteraction) {
  const [prefix, action, userId] = interaction.customId.split(':');
  if (prefix !== 'slots' || action !== 'betpreset') return;
  if (interaction.user.id !== userId) {
    await safeReply(interaction, { content: 'This selection is not for you.', flags: MessageFlags.Ephemeral });
    return;
  }
  const bet = parseInt(interaction.values[0], 10);
  if (!interaction.guildId) { await safeReply(interaction, { content: 'This bot only works in servers.', flags: MessageFlags.Ephemeral }); return; }
  rememberUserChannel(interaction.guildId, interaction.user.id, interaction.channelId);
  const current = getBalance(interaction.guildId, userId);
  if (current < BigInt(bet)) {
    await safeReply(interaction, { content: `Insufficient balance for ${bet}.`, flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferUpdate().catch(() => { });
  const ranksEnabled = (getSetting(getGuildDb(interaction.guildId!), 'features.ranks.enabled') !== 'false');
  const rng = (max: number) => Math.floor(((ranksEnabled ? withUserLuck(interaction.guildId!, userId, () => Math.random()) : Math.random())) * max);
  const result = spin(bet, defaultConfig, rng);
  const net = result.payout - bet;
  await adjustBalance(interaction.guildId, userId, -bet, 'slots:bet');
  if (result.payout > 0) await adjustBalance(interaction.guildId, userId, result.payout, 'slots:win');
  const newBal = getBalance(interaction.guildId, userId);
  const theme = getGuildTheme(interaction.guildId);
  const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'slots', grid: result.grid as any, bet, payout: result.payout, delta: net, balance: newBal } });
  const file = new AttachmentBuilder(card.buffer, { name: card.filename });
  const embed = themedEmbed(theme, '🎰 Slots', net >= 0 ? `Win +${net}` : `Loss ${net}`).setImage(`attachment://${card.filename}`);
  try { if (ranksEnabled) onGambleXP(interaction.guildId, userId, bet, Number(newBal)); } catch { }
  await interaction.editReply({ embeds: [embed], files: [file] });
}
