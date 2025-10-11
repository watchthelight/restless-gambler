import { SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, AttachmentBuilder } from 'discord.js';
import { adjustBalance, getBalance } from '../../economy/wallet.js';
import { themedEmbed } from '../../ui/embeds.js';
import { BJState, Card } from './types.js';
import { dealInitial, hit as bjHit, stand as bjStand, doubleDown as bjDouble, split as bjSplit, settle } from './engine.js';
import { getGuildDb } from '../../db/connection.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { formatBolts } from '../../economy/currency.js';
import { outcomeMessage, formatBolt } from '../../ui/outcome.js';
import { uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline } from '../../util/amountRender.js';
import { withUserLuck } from '../../rng/luck.js';
import { onGambleXP } from '../../rank/xpEngine.js';
import { rememberUserChannel } from '../../rank/announce.js';
import { getSetting } from '../../db/kv.js';

export const data = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Play a hand of blackjack')
  .addIntegerOption((opt) => opt.setName('bet').setDescription('Bet amount').setMinValue(1).setRequired(true));

function renderCard(c: Card): string {
  const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[c.s];
  return `${c.r}${suit}`;
}

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  rememberUserChannel(interaction.guildId, interaction.user.id, interaction.channelId);
  const bet = interaction.options.getInteger('bet', true);
  const userId = interaction.user.id;
  const bal = getBalance(interaction.guildId, userId);
  if (bal < BigInt(bet)) {
    const db = getGuildDb(interaction.guildId);
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(bal, sig) : formatBolts(bal);
    await interaction.reply({ content: `Insufficient balance (${balText}).` });
    return;
  }
  await interaction.deferReply();
  // reserve bet
  await adjustBalance(interaction.guildId, userId, -bet, 'blackjack:bet');

  // Apply luck bias to RNG for card draws (very subtle)
  const db = getGuildDb(interaction.guildId);
  const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
  const luckyRng = ranksEnabled
    ? () => withUserLuck(interaction.guildId!, userId, () => Math.random())
    : () => Math.random();
  const state = dealInitial(bet, luckyRng);
  persistState(interaction.guildId, interaction.channelId, userId, state);
  const theme = getGuildTheme(interaction.guildId);
  const hand = state.playerHands[state.activeIndex];
  const dealerUp = [renderCard(state.dealer.cards[0]), '??'];
  const player = hand.cards.map(renderCard);
  const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'blackjack', dealer: dealerUp, player, bet, payout: 0, delta: 0, balance: getBalance(interaction.guildId, userId) } });
  const file = new AttachmentBuilder(card.buffer, { name: card.filename });
  const embed = themedEmbed(theme, '🂡 Blackjack', 'Dealer stands on soft 17.').setImage(`attachment://${card.filename}`);
  const row = new ActionRowBuilder<ButtonBuilder>();
  row.addComponents(
    new ButtonBuilder().setCustomId(`bj:hit:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit'),
    new ButtonBuilder().setCustomId(`bj:stand:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand'),
    new ButtonBuilder().setCustomId(`bj:double:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double'),
    new ButtonBuilder().setCustomId(`bj:split:${userId}`).setStyle(ButtonStyle.Danger).setLabel('Split'),
  );
  await interaction.editReply({ embeds: [embed], files: [file], components: [row] } as any);
}

function persistState(guildId: string, channelId: string, userId: string, state: BJState) {
  const db = getGuildDb(guildId);
  const now = Date.now();
  const up = db.prepare(
    "INSERT INTO blackjack_sessions(channel_id, user_id, deck_json, player_json, dealer_json, bet, status, created_at, updated_at) VALUES (?,?,?,?,?,?, 'active', ?, ?) ON CONFLICT(channel_id, user_id) WHERE status='active' DO UPDATE SET deck_json=excluded.deck_json, player_json=excluded.player_json, dealer_json=excluded.dealer_json, bet=excluded.bet, updated_at=excluded.updated_at"
  );
  up.run(channelId, userId, JSON.stringify(state.deck), JSON.stringify(state.playerHands), JSON.stringify(state.dealer), state.bet, now, now);
}

function loadState(guildId: string, channelId: string, userId: string): BJState | null {
  const db = getGuildDb(guildId);
  const row = db
    .prepare("SELECT deck_json, player_json, dealer_json, bet FROM blackjack_sessions WHERE channel_id = ? AND user_id = ? AND status='active'")
    .get(channelId, userId) as { deck_json: string; player_json: string; dealer_json: string; bet: number } | undefined;
  if (!row) return null;
  const deck = JSON.parse(row.deck_json);
  const playerHands = JSON.parse(row.player_json);
  const dealer = JSON.parse(row.dealer_json);
  const state: BJState = { deck, playerHands, dealer, bet: row.bet, activeIndex: 0, finished: false } as any;
  return state;
}

function clearState(guildId: string, channelId: string, userId: string) {
  const db = getGuildDb(guildId);
  db.prepare("UPDATE blackjack_sessions SET status='settled', updated_at = ? WHERE channel_id = ? AND user_id = ? AND status='active'").run(
    Date.now(),
    channelId,
    userId,
  );
}

export async function handleButton(interaction: ButtonInteraction) {
  const [prefix, action, userId] = interaction.customId.split(':');
  if (prefix !== 'bj') return;
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'This button is not for you.' });
    return;
  }
  if (!interaction.guildId) { await interaction.reply({ content: 'This bot only works in servers.' }); return; }
  const state = loadState(interaction.guildId, interaction.channelId, userId);
  if (!state) {
    await interaction.reply({ content: 'No active blackjack hand.' });
    return;
  }
  switch (action) {
    case 'hit':
      bjHit(state);
      break;
    case 'stand':
      bjStand(state);
      break;
    case 'double':
      bjDouble(state);
      break;
    case 'split':
      bjSplit(state);
      break;
  }
  if (state.finished) {
    // reveal dealer and settle
    const result = settle(state);
    const payout = result.payout;
    if (payout > 0) await adjustBalance(interaction.guildId, userId, payout, 'blackjack:win');
    const theme = getGuildTheme(interaction.guildId);
    const delta = payout - state.bet; // approx for single hand
    const dealerCards = state.dealer.cards.map(renderCard);
    const playerCards = state.playerHands[0].cards.map(renderCard);
    const balanceNow = getBalance(interaction.guildId, userId);
    const db = getGuildDb(interaction.guildId);
    const mode = uiExactMode(db, "guild");
    const sig = uiSigFigs(db);
    const balText = mode === "inline" ? renderAmountInline(balanceNow, sig) : formatBolt(balanceNow);
    const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'blackjack', dealer: dealerCards, player: playerCards, bet: state.bet, payout, delta, balance: balanceNow } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const headline = delta > 0 ? outcomeMessage('win', delta) : delta < 0 ? outcomeMessage('loss', Math.abs(delta)) : outcomeMessage('push');
    const final = themedEmbed(theme, '🂡 Blackjack Result', `${headline}
New balance: ${balText}`).setImage(`attachment://${card.filename}`);

    // Award XP for completed hand
    try {
      const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
      if (ranksEnabled) {
        onGambleXP(interaction.guildId, userId, state.bet, Number(balanceNow));
      }
    } catch { }

    clearState(interaction.guildId, interaction.channelId, userId);
    await interaction.reply({ embeds: [final], files: [file] });
  } else {
    persistState(interaction.guildId, interaction.channelId, userId, state);
    const theme = getGuildTheme(interaction.guildId);
    const hand = state.playerHands[state.activeIndex];
    const dealerUp = [renderCard(state.dealer.cards[0]), '??'];
    const player = hand.cards.map(renderCard);
    const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'blackjack', dealer: dealerUp, player, bet: state.bet, payout: 0, delta: 0, balance: getBalance(interaction.guildId!, userId) } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const embed = themedEmbed(theme, '🂡 Blackjack', 'Dealer stands on soft 17.').setImage(`attachment://${card.filename}`);
    const row = new ActionRowBuilder<ButtonBuilder>();
    row.addComponents(
      new ButtonBuilder().setCustomId(`bj:hit:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit'),
      new ButtonBuilder().setCustomId(`bj:stand:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand'),
      new ButtonBuilder().setCustomId(`bj:double:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double'),
      new ButtonBuilder().setCustomId(`bj:split:${userId}`).setStyle(ButtonStyle.Danger).setLabel('Split'),
    );
    await interaction.reply({ embeds: [embed], files: [file], components: [row] } as any);
  }
}
