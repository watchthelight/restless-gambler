import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import { getGuildDb } from '../../db/connection.js';
import { adjustBalance, getBalance } from '../../economy/wallet.js';
import { themedEmbed } from '../../ui/embeds.js';
import { getGuildTheme } from '../../ui/theme.js';
import { formatBolts } from '../../economy/currency.js';
import { uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline } from '../../util/amountRender.js';
import { renderHands, handValueBJ } from '../../ui/cardsDisplay.js';
import { dealInitial, hit as bjHit, stand as bjStand, doubleDown as bjDouble, handTotal, isBlackjack, settle } from '../../games/blackjack/engine.js';
import type { Card, BJState } from '../../games/blackjack/types.js';
import { requireAdmin } from '../../admin/guard.js';
import { blackjackLimits, validateBet, safeDefer, safeEdit, replyError } from '../../game/config.js';
import { assertWithinMaxBet } from '../../config/maxBet.js';
import { safeReply } from '../../interactions/reply.js';
import { withLock } from '../../util/locks.js';
import { findActiveSession, createSession, updateSession, settleSession, abortSession, endSession } from '../../game/blackjack/sessionStore.js';
import { ensureGuildInteraction } from '../../interactions/guards.js';
import { withUserLuck } from '../../rng/luck.js';
import { onGambleXP } from '../../rank/xpEngine.js';
import { rememberUserChannel } from '../../rank/announce.js';
import { getSetting } from '../../db/kv.js';
import { dbToBigint, bigintToDb, toBigInt } from '../../utils/bigint.js';
import type { RNG } from '../../util/rng.js';

type SessionRow = {
  id: number;
  channel_id: string;
  user_id: string;
  deck_json: string;
  player_json: string;
  dealer_json: string;
  bet: number;
  status: string;
  message_id?: string | null;
  created_at: number;
  updated_at: number;
};

const TIMEOUT_MS = 2 * 60 * 1000;
const tmap = new Map<string, NodeJS.Timeout>(); // key: g:c:u

export const data = new SlashCommandBuilder()
  .setName('blackjack')
  .setDescription('Blackjack 21')
  .addSubcommand((s) => s.setName('start').setDescription('Start a round').addIntegerOption((o) => o.setName('bet').setDescription('Bet amount').setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName('hit').setDescription('Hit (draw one card)'))
  .addSubcommand((s) => s.setName('stand').setDescription('Stand; dealer plays out'))
  .addSubcommand((s) => s.setName('double').setDescription('Double down (first decision only)'))
  .addSubcommand((s) => s.setName('cancel').setDescription('Admin: cancel round and refund'));

function key(g: string, c: string, u: string) { return `${g}:${c}:${u}`; }

function renderCardGlyph(c: Card): string {
  const suitMap: Record<'S' | 'H' | 'D' | 'C', string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const suit = suitMap[c.s];
  return `${c.r}${suit}`;
}

async function renderAndReply(i: ChatInputCommandInteraction | ButtonInteraction, state: BJState, opts: { revealDealer?: boolean; headline?: string; disableDouble?: boolean; finished?: boolean }) {
  const theme = getGuildTheme(i.guildId);
  const ph = state.playerHands[state.activeIndex]?.cards || state.playerHands[0].cards;
  const toCard = (c: any) => ({ suit: c.s as any, rank: (c.r as any) });
  const playerCards = ph.map(toCard);
  const dealerCards = state.dealer.cards.map(toCard);
  const pVal = handValueBJ(playerCards);
  const dVal = opts.revealDealer ? handValueBJ(dealerCards) : undefined;
  const title = '🂡 Blackjack';
  const desc = opts.headline ? opts.headline : 'Your move.';
  const embed = themedEmbed(theme, title, desc);
  embed.addFields(
    { name: `YOUR HAND — value: ${pVal.total}${pVal.soft ? ' (soft)' : ''}`, value: '\u200b', inline: false },
    { name: `DEALER HAND — value: ${dVal ? dVal.total + (dVal.soft ? ' (soft)' : '') : 'hidden'}`, value: '\u200b', inline: false },
  );
  // Dev override style via optional option 'style' if present and user is admin
  let override: 'unicode' | 'image' | undefined;
  try { const s = (i as any).options?.getString?.('style') as any; if (s === 'unicode' || s === 'image') override = s; } catch { }
  const handRender = await renderHands(i.guildId!, playerCards, dealerCards, !!opts.revealDealer, override);
  const row = new ActionRowBuilder<ButtonBuilder>();
  const uid = (i as any).user.id as string;
  const g = i.guildId!;
  const cid = (i as any).channelId as string;
  const dis = !!opts.finished;
  row.addComponents(
    new ButtonBuilder().setCustomId(`blackjack:hit:${g}:${cid}:${uid}`).setStyle(ButtonStyle.Primary).setLabel('Hit').setDisabled(dis),
    new ButtonBuilder().setCustomId(`blackjack:stand:${g}:${cid}:${uid}`).setStyle(ButtonStyle.Secondary).setLabel('Stand').setDisabled(dis),
    new ButtonBuilder().setCustomId(`blackjack:double:${g}:${cid}:${uid}`).setStyle(ButtonStyle.Success).setLabel('Double Down').setDisabled(dis || !!opts.disableDouble),
  );
  const playAgainRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:again:${g}:${uid}:${state.bet}`)
      .setStyle(ButtonStyle.Success)
      .setLabel('Play Again')
      .setDisabled(!dis)
  );
  if (handRender.kind === 'image') {
    const att = handRender.attachment;
    embed.setImage(`attachment://${(att as any).name}`);
    const payload: any = { embeds: [embed], files: [att], components: dis ? [row, playAgainRow] : [row] };
    if ((i as any).replied || (i as any).deferred) return (i as any).followUp(payload);
    return (i as any).reply(payload);
  } else {
    // Add unicode as a single field content
    embed.setDescription(`${desc}\n\n${handRender.text}`);
    const payload: any = { embeds: [embed], components: dis ? [row, playAgainRow] : [row] };
    if ((i as any).replied || (i as any).deferred) return (i as any).followUp(payload);
    return (i as any).reply(payload);
}
}

function loadActive(guildId: string, userId: string): { session: import('../../game/blackjack/sessionStore.js').BjSession; state: BJState } | null {
  const db = getGuildDb(guildId);
  const session = findActiveSession(db, guildId, userId);
  if (!session) return null;
  const state: BJState = JSON.parse(session.state_json);
  return { session, state };
}

function saveSession(guildId: string, userId: string, state: BJState, sessionId?: string) {
  const db = getGuildDb(guildId);
  const stateJson = JSON.stringify(state);
  if (sessionId) {
    updateSession(db, sessionId, stateJson);
  } else {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    createSession(db, {
      id,
      guild_id: guildId,
      user_id: userId,
      state_json: stateJson,
    });
  }
}

function setStatus(guildId: string, channelId: string, userId: string, status: 'settled' | 'canceled') {
  const db = getGuildDb(guildId);
  db.prepare('UPDATE blackjack_sessions SET status = ?, updated_at = ? WHERE channel_id = ? AND user_id = ? AND status = "active"').run(status, Date.now(), channelId, userId);
}

function setMessageId(guildId: string, channelId: string, userId: string, messageId: string) {
  const db = getGuildDb(guildId);
  try { db.prepare('ALTER TABLE blackjack_sessions ADD COLUMN message_id TEXT').run(); } catch { }
  db.prepare('UPDATE blackjack_sessions SET message_id = ? WHERE channel_id = ? AND user_id = ? AND status = "active"').run(messageId, channelId, userId);
}

function ensureTimeout(guildId: string, channelId: string, userId: string, client: any) {
  const k = key(guildId, channelId, userId);
  if (tmap.has(k)) clearTimeout(tmap.get(k)!);
  const t = setTimeout(async () => {
    try {
      const active = loadActive(guildId, userId);
      if (!active) return;
      const { session, state } = active;
      const db = getGuildDb(guildId);
      // Auto-stand
      bjStand(state);
      const result = settle(state);
      // Credit payout (initial bet already debited)
      if (result.payout > 0) await adjustBalance(guildId, userId, result.payout, 'blackjack:win');
      endSession(guildId, userId);
      try {
        const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
        const balAfter = getBalance(guildId, userId);
        if (ranksEnabled) onGambleXP(guildId, userId, state.bet, Number(balAfter));
      } catch {}
      // Try to edit original message to disable buttons
      const messageId = (state as any).messageId;
      if (messageId) {
        try {
          const ch = await client.channels.fetch((state as any).channelId || channelId);
          const msg = await (ch as any).messages.fetch(messageId);
          const theme = getGuildTheme(guildId);
          const bal = getBalance(guildId, userId);
          const delta = result.payout - state.bet;
          const db = getGuildDb(guildId);
          const mode = uiExactMode(db, "guild");
          const sig = uiSigFigs(db);
          const balText = mode === "inline" ? renderAmountInline(bal, sig) : formatBolts(bal);
          const outcome = delta > 0 ? `Auto-stand: You won +${formatBolts(delta)}. New balance: ${balText}` : delta === 0 ? `Auto-stand due to inactivity. Push. Bet refunded.` : `Auto-stand: You lost ${formatBolts(-delta)}. New balance: ${balText}`;
          const themeEmbed = themedEmbed(theme, '🂡 Blackjack', outcome);
          const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder().setCustomId(`blackjack:hit:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit').setDisabled(true),
              new ButtonBuilder().setCustomId(`blackjack:stand:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand').setDisabled(true),
              new ButtonBuilder().setCustomId(`blackjack:double:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double Down').setDisabled(true),
            );
          const again = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`bj:again:${guildId}:${userId}:${state.bet}`).setStyle(ButtonStyle.Success).setLabel('Play Again')
          );
          await msg.edit({ embeds: [themeEmbed], components: [row, again] });
        } catch { }
      }
      console.info(JSON.stringify({ msg: 'blackjack', action: 'auto-stand', guild_id: guildId, channel_id: channelId, user_id: userId }));
    } catch { }
  }, TIMEOUT_MS);
  tmap.set(k, t);
}

export async function execute(i: ChatInputCommandInteraction) {
  if (!await ensureGuildInteraction(i)) return;
  const sub = i.options.getSubcommand(true);
  const guildId = i.guildId!;
  const channelId = i.channelId;
  const userId = i.user.id;
  const db = getGuildDb(guildId);
  try { rememberUserChannel(guildId, userId, channelId); } catch {}
  if (sub === 'start') {
    const bet = i.options.getInteger('bet', true);
    const limits = blackjackLimits(db);
    // Only enforce min here; max is handled centrally by assertWithinMaxBet
    if (bet < limits.minBet) { await i.reply({ content: `Minimum bet is ${formatBolts(limits.minBet)}.` }); return; }
    try { assertWithinMaxBet(db, toBigInt(bet)); } catch (e: any) { if (e?.code === 'ERR_MAX_BET') { try { console.debug({ msg: 'bet_blocked', code: 'ERR_MAX_BET', guildId, userId, bet: String(bet) }); } catch {} await i.reply({ content: e.message }); return; } throw e; }
    const bal = getBalance(guildId, userId);
    if (bal < BigInt(bet)) {
      const db = getGuildDb(guildId);
      const mode = uiExactMode(db, "guild");
      const sig = uiSigFigs(db);
      const balText = mode === "inline" ? renderAmountInline(bal, sig) : formatBolts(bal);
      await i.reply({ content: `Insufficient balance (${balText}).` }); return;
    }
    // Prevent concurrent session
    const active = loadActive(guildId, userId);
    if (active) {
      const theme = getGuildTheme(guildId);
      const embed = themedEmbed(theme, 'Blackjack', 'You already have an active hand.').addFields({ name: 'Tip', value: 'Use Hit/Stand/Double Down buttons or /blackjack hit/stand/double.' });
      await i.reply({ embeds: [embed] });
      return;
    }
    // Reserve bet and deal
    await adjustBalance(guildId, userId, -bet, 'blackjack:bet');
    const ranksEnabled = (getSetting(db, 'features.ranks.enabled') !== 'false');
    const rng: RNG = (max: number) => Math.floor(((ranksEnabled ? withUserLuck(guildId, userId, () => Math.random()) : Math.random())) * max);
    const state = dealInitial(bet, rng);
    (state as any).channelId = channelId;
    saveSession(guildId, userId, state);
    const m = await renderAndReply(i, state, { revealDealer: false, disableDouble: false, finished: state.finished });
    try { const msg = await (m as any); const mid = (msg?.id || (await i.fetchReply())?.id) as string; if (mid) { (state as any).messageId = mid; saveSession(guildId, userId, state); } } catch { }
    ensureTimeout(guildId, channelId, userId, i.client);
    // Auto settle if immediate blackjack conditions
    if (isBlackjack(state.playerHands[0].cards) || isBlackjack(state.dealer.cards)) {
      await withLock(`bj:${guildId}:${userId}`, async () => {
        bjStand(state);
        const result = settle(state);
        if (result.payout > 0) await adjustBalance(guildId, userId, result.payout, 'blackjack:win');
        endSession(guildId, userId);
        const delta = result.payout - bet;
        const balNow = getBalance(guildId, userId);
        const mode = uiExactMode(db, "guild");
        const sig = uiSigFigs(db);
        const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
        const headline = delta > 0 ? `Blackjack! +${formatBolts(delta)}\nNew balance: ${balText}` : delta === 0 ? `Push. Bet refunded.\nNew balance: ${balText}` : `You lost ${formatBolts(-delta)}.\nNew balance: ${balText}`;
        // Edit the original reply if possible
        try { await i.editReply({}).catch(() => {}); } catch {}
        await (i as any).editReply ? (i as any).editReply(await (async () => {
          const theme = getGuildTheme(guildId);
          const ph = state.playerHands[state.activeIndex]?.cards || state.playerHands[0].cards;
          const toCard = (c: any) => ({ suit: c.s as any, rank: (c.r as any) });
          const playerCards = ph.map(toCard);
          const dealerCards = state.dealer.cards.map(toCard);
          const handRender = await renderHands(i.guildId!, playerCards, dealerCards, true);
          const embed = themedEmbed(theme, '🂡 Blackjack', headline);
          if (handRender.kind === 'image') embed.setImage(`attachment://${(handRender.attachment as any).name}`);
          const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder().setCustomId(`blackjack:hit:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit').setDisabled(true),
              new ButtonBuilder().setCustomId(`blackjack:stand:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand').setDisabled(true),
              new ButtonBuilder().setCustomId(`blackjack:double:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double Down').setDisabled(true),
            );
          const again = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`bj:again:${guildId}:${userId}:${bet}`).setStyle(ButtonStyle.Success).setLabel('Play Again')
          );
          const payload: any = { embeds: [embed], components: [row, again] };
          if (handRender.kind === 'image') payload.files = [handRender.attachment];
          return payload;
        })()) : await renderAndReply(i, state, { revealDealer: true, headline, finished: true, disableDouble: true });
        try { if ((getSetting(getGuildDb(guildId), 'features.ranks.enabled') !== 'false')) onGambleXP(guildId, userId, bet, Number(balNow)); } catch {}
      });
    }
    console.info(JSON.stringify({ msg: 'blackjack', action: 'start', guild_id: guildId, channel_id: channelId, user_id: userId, bet }));
  } else if (sub === 'hit' || sub === 'stand' || sub === 'double') {
    const active = loadActive(guildId, userId);
    if (!active) { await i.reply({ content: 'No active blackjack hand.' }); return; }
    const { session, state } = active;
    const db = getGuildDb(guildId);
    if (sub === 'hit') {
      bjHit(state);
      saveSession(guildId, userId, state, session.id);
      const p = handTotal(state.playerHands[state.activeIndex].cards);
      const headline = p.total > 21 ? `Bust. You lost ${formatBolts(state.bet)}.` : undefined;
      const finished = p.total >= 21;
      if (finished) {
        await withLock(`bj:${guildId}:${userId}`, async () => {
          const result = settle(state);
          // no payout on bust since initial bet was already debited
          endSession(guildId, userId);
          const balNow = getBalance(guildId, userId);
          const mode = uiExactMode(db, "guild");
          const sig = uiSigFigs(db);
          const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
          const headline2 = `Bust. You lost ${formatBolts(state.bet)}.\nNew balance: ${balText}`;
          const theme = getGuildTheme(guildId);
          const ph = state.playerHands[state.activeIndex]?.cards || state.playerHands[0].cards;
          const toCard = (c: any) => ({ suit: c.s as any, rank: (c.r as any) });
          const playerCards = ph.map(toCard);
          const dealerCards = state.dealer.cards.map(toCard);
          const handRender = await renderHands(i.guildId!, playerCards, dealerCards, true);
          const embed = themedEmbed(theme, '🂡 Blackjack', headline2);
          if (handRender.kind === 'image') embed.setImage(`attachment://${(handRender.attachment as any).name}`);
          const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
              new ButtonBuilder().setCustomId(`blackjack:hit:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit').setDisabled(true),
              new ButtonBuilder().setCustomId(`blackjack:stand:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand').setDisabled(true),
              new ButtonBuilder().setCustomId(`blackjack:double:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double Down').setDisabled(true),
            );
          const again = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`bj:again:${guildId}:${userId}:${state.bet}`).setStyle(ButtonStyle.Success).setLabel('Play Again')
          );
          const payload: any = { embeds: [embed], components: [row, again] };
          if (handRender.kind === 'image') payload.files = [handRender.attachment];
          await (i as any).editReply ? (i as any).editReply(payload) : (i as any).reply(payload);
          try { onGambleXP(guildId, userId, state.bet, Number(balNow)); } catch {}
        });
      } else {
        await renderAndReply(i, state, { revealDealer: false, disableDouble: true, finished, headline });
        ensureTimeout(guildId, (state as any).channelId || channelId, userId, i.client);
      }
    } else if (sub === 'stand') {
      await withLock(`bj:${guildId}:${userId}`, async () => {
        bjStand(state);
        const result = settle(state);
        if (result.payout > 0) await adjustBalance(guildId, userId, result.payout, 'blackjack:win');
        endSession(guildId, userId);
        const delta = result.payout - state.bet;
        const balNow = getBalance(guildId, userId);
        const mode = uiExactMode(db, "guild");
        const sig = uiSigFigs(db);
        const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
        const headline = delta > 0 ? `You won +${formatBolts(delta)}!!!\nNew balance: ${balText}` : delta === 0 ? `Push. Bet refunded.\nNew balance: ${balText}` : `You lost ${formatBolts(-delta)}.\nNew balance: ${balText}`;
        const theme = getGuildTheme(guildId);
        const ph = state.playerHands[state.activeIndex]?.cards || state.playerHands[0].cards;
        const toCard = (c: any) => ({ suit: c.s as any, rank: (c.r as any) });
        const playerCards = ph.map(toCard);
        const dealerCards = state.dealer.cards.map(toCard);
        const handRender = await renderHands(i.guildId!, playerCards, dealerCards, true);
        const embed = themedEmbed(theme, '🂡 Blackjack', headline);
        if (handRender.kind === 'image') embed.setImage(`attachment://${(handRender.attachment as any).name}`);
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId(`blackjack:hit:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit').setDisabled(true),
            new ButtonBuilder().setCustomId(`blackjack:stand:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand').setDisabled(true),
            new ButtonBuilder().setCustomId(`blackjack:double:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double Down').setDisabled(true),
          );
        const again = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`bj:again:${guildId}:${userId}:${state.bet}`).setStyle(ButtonStyle.Success).setLabel('Play Again')
        );
        const payload: any = { embeds: [embed], components: [row, again] };
        if (handRender.kind === 'image') payload.files = [handRender.attachment];
        await (i as any).editReply ? (i as any).editReply(payload) : (i as any).reply(payload);
        try { onGambleXP(guildId, userId, state.bet, Number(balNow)); } catch {}
      });
    } else if (sub === 'double') {
      // Must have funds to double
      const bal = getBalance(guildId, userId);
      if (bal < state.bet) {
        const mode = uiExactMode(db, "guild");
        const sig = uiSigFigs(db);
        const balText = mode === "inline" ? renderAmountInline(bal, sig) : formatBolts(bal);
        await i.reply({ content: `Insufficient funds to double (${balText}).` }); return;
      }
      // Charge extra bet
      await adjustBalance(guildId, userId, -state.bet, 'blackjack:double');
      bjDouble(state);
      const result = settle(state);
      if (result.payout > 0) await adjustBalance(guildId, userId, result.payout, 'blackjack:win');
      await withLock(`bj:${guildId}:${userId}`, async () => {
        endSession(guildId, userId);
        const delta = result.payout - state.bet * 2;
        const balNow = getBalance(guildId, userId);
        const mode = uiExactMode(db, "guild");
        const sig = uiSigFigs(db);
        const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
        const headline = delta > 0 ? `You won +${formatBolts(delta)}!!!\nNew balance: ${balText}` : delta === 0 ? `Push. Bet refunded.\nNew balance: ${balText}` : `You lost ${formatBolts(-delta)}.\nNew balance: ${balText}`;
        const theme = getGuildTheme(guildId);
        const ph = state.playerHands[state.activeIndex]?.cards || state.playerHands[0].cards;
        const toCard = (c: any) => ({ suit: c.s as any, rank: (c.r as any) });
        const playerCards = ph.map(toCard);
        const dealerCards = state.dealer.cards.map(toCard);
        const handRender = await renderHands(i.guildId!, playerCards, dealerCards, true);
        const embed = themedEmbed(theme, '🂡 Blackjack', headline);
        if (handRender.kind === 'image') embed.setImage(`attachment://${(handRender.attachment as any).name}`);
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder().setCustomId(`blackjack:hit:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Primary).setLabel('Hit').setDisabled(true),
            new ButtonBuilder().setCustomId(`blackjack:stand:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Secondary).setLabel('Stand').setDisabled(true),
            new ButtonBuilder().setCustomId(`blackjack:double:${guildId}:${channelId}:${userId}`).setStyle(ButtonStyle.Success).setLabel('Double Down').setDisabled(true),
          );
        const again = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`bj:again:${guildId}:${userId}:${state.bet}`).setStyle(ButtonStyle.Success).setLabel('Play Again')
        );
        const payload: any = { embeds: [embed], components: [row, again] };
        if (handRender.kind === 'image') payload.files = [handRender.attachment];
        await (i as any).editReply ? (i as any).editReply(payload) : (i as any).reply(payload);
      });
    }
    console.info(JSON.stringify({ msg: 'blackjack', action: sub, guild_id: guildId, channel_id: channelId, user_id: userId }));
  } else if (sub === 'cancel') {
    await requireAdmin(i);
    // New robust cancel flow with sessionStore usage and structured logs
    const db = getGuildDb(guildId);
    const tryOnce = () => {
      const txn = (db as any).transaction(() => {
        const session = findActiveSession(db, guildId, userId);
        if (!session) {
          // no active session
          console.log(JSON.stringify({ msg: 'blackjack', event: 'cancel_no_active', guildId, userId }));
          if (!(i as any).replied && !(i as any).deferred) return (i as any).reply({ content: 'You don’t have an active blackjack game.', flags: MessageFlags.Ephemeral });
          return;
        }
        const state: BJState = JSON.parse(session.state_json);
        const bet = state.bet || 0;
        // End session immediately to prevent lingering active state
        try { abortSession(db, session.id); } catch {}
        try { endSession(guildId, userId); } catch {}
        // Refund inside same txn to keep atomic with cancel
        const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as { balance?: number | string | bigint } | undefined;
        const cur = row?.balance != null ? dbToBigint(row.balance) : 0n;
        const next = cur + toBigInt(bet);
        db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at').run(
          userId,
          bigintToDb(next),
          Date.now(),
        );
        db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?,?,?,?)').run(userId, Number(bet), 'blackjack:cancel', Date.now());
        // Respond
        const msg = `Blackjack canceled. Your bet has been returned.`;
        if (!(i as any).replied && !(i as any).deferred) (i as any).reply({ content: msg, flags: MessageFlags.Ephemeral });
        console.log(JSON.stringify({ msg: 'blackjack', event: 'cancel_ok', guildId, userId, bet }));
      });
      txn();
    };
    try {
      await Promise.resolve(tryOnce());
    } catch (e: any) {
      const errMsg = `${e?.name || 'Error'}: ${e?.message || String(e)}`;
      const stack = (e?.stack || '').split('\n')[0] || '';
      console.error(JSON.stringify({ msg: 'handler_error', name: 'blackjack', sub: 'cancel', guildId, userId, error: errMsg, stack }));
      const isSchema = /no such column|no such table/i.test(String(e?.message || ''));
      if (isSchema) {
        try {
          const { ensureBlackjackSchema } = await import('../../db/migrations/blackjack.js');
          const { added } = ensureBlackjackSchema(db as any);
          console.log(JSON.stringify({ msg: 'migrate', event: 'blackjack_hotfix', added }));
          await Promise.resolve(tryOnce());
          return;
        } catch (ee: any) {
          const err2 = `${ee?.name || 'Error'}: ${ee?.message || String(ee)}`;
          const stack2 = (ee?.stack || '').split('\n')[0] || '';
          console.error(JSON.stringify({ msg: 'handler_error', name: 'blackjack', sub: 'cancel', guildId, userId, error: err2, stack: stack2 }));
          if (!(i as any).replied && !(i as any).deferred) await (i as any).reply({ content: 'Blackjack is updating its data. Try again in a moment.', allowedMentions: { parse: [] } });
          return;
        }
      }
      if (!(i as any).replied && !(i as any).deferred) await (i as any).reply({ content: 'Something went wrong processing your request.', allowedMentions: { parse: [] } });
    }
  }
}

export async function handleButton(i: ButtonInteraction) {
  const [prefix, action, g, c, u] = i.customId.split(':');
  if (prefix !== 'blackjack') return;
  if (!i.guildId || i.guildId !== g) { await safeReply(i, { content: 'This bot only works in servers.' }); return; }
  if (i.user.id !== u) { await safeReply(i, { content: `Only <@${u}> can act on this hand.` }); return; }
  // Map buttons to slash actions
  (i as any).options = { getSubcommand: () => action } as any;
  await withLock(`bj:${i.message?.id || i.id}`, async () => {
    await safeDefer(i, true);
    try {
      await execute(i as any);
      const active = loadActive(i.guildId!, i.user.id);
      if (!active) {
        try { await i.message.edit({ components: [] }); } catch { }
      }
    } catch (e: any) {
      await replyError(i, "ERR-BLACKJACK-BTN", console, { err: String(e) });
    }
  });
}

export async function handleAgainButton(i: ButtonInteraction) {
  const [prefix, action, g, u, betStr] = i.customId.split(':');
  if (prefix !== 'bj' || action !== 'again') return;
  if (!i.guildId || i.guildId !== g) return;
  if (i.user.id !== u) {
    await safeReply(i, { content: 'Only the original player can start a new hand from this card.' });
    return;
  }
  const bet = Number(betStr);
  await withLock(`bj:${g}:${u}`, async () => {
    // Router already deferred this button; do not defer again.
    const db = getGuildDb(i.guildId!);
    // Ensure no active session exists
    if (findActiveSession(db, i.guildId!, i.user.id)) return;
    // Validate funds and limits
    const limits = blackjackLimits(db);
    if (bet < limits.minBet) {
      await i.followUp({ content: `Minimum bet is ${formatBolts(limits.minBet)}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    try { assertWithinMaxBet(db, toBigInt(bet)); } catch (e: any) {
      if (e?.code === 'ERR_MAX_BET') { try { console.debug({ msg: 'bet_blocked', code: 'ERR_MAX_BET', guildId: i.guildId, userId: i.user.id, bet: String(bet) }); } catch {} await i.followUp({ content: e.message, flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
      throw e;
    }
    const bal = getBalance(i.guildId!, i.user.id);
    if (bal < BigInt(bet)) {
      await i.followUp({ content: 'Not enough funds for that bet.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    // Reserve and deal
    await adjustBalance(i.guildId!, i.user.id, -bet, 'blackjack:bet');
    const ranksEnabled = (getSetting(getGuildDb(i.guildId!), 'features.ranks.enabled') !== 'false');
    const rng: RNG = (max: number) => Math.floor(((ranksEnabled ? withUserLuck(i.guildId!, i.user.id, () => Math.random()) : Math.random())) * max);
    const state = dealInitial(bet, rng);
    (state as any).channelId = i.channelId;
    saveSession(i.guildId!, i.user.id, state);
    // Render initial hand as a NEW message
    const theme = getGuildTheme(i.guildId);
    const ph = state.playerHands[state.activeIndex]?.cards || state.playerHands[0].cards;
    const toCard = (c: any) => ({ suit: c.s as any, rank: (c.r as any) });
    const playerCards = ph.map(toCard);
    const dealerCards = state.dealer.cards.map(toCard);
    const handRender = await renderHands(i.guildId!, playerCards, dealerCards, false);
    const embed = themedEmbed(theme, '🂡 Blackjack', 'Your move.');
    if (handRender.kind === 'image') embed.setImage(`attachment://${(handRender.attachment as any).name}`);
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder().setCustomId(`blackjack:hit:${i.guildId}:${i.channelId}:${i.user.id}`).setStyle(ButtonStyle.Primary).setLabel('Hit'),
        new ButtonBuilder().setCustomId(`blackjack:stand:${i.guildId}:${i.channelId}:${i.user.id}`).setStyle(ButtonStyle.Secondary).setLabel('Stand'),
        new ButtonBuilder().setCustomId(`blackjack:double:${i.guildId}:${i.channelId}:${i.user.id}`).setStyle(ButtonStyle.Success).setLabel('Double Down'),
      );
    const payload: any = { embeds: [embed], components: [row] };
    if (handRender.kind === 'image') payload.files = [handRender.attachment];
    await i.followUp(payload).catch(() => {});
    ensureTimeout(i.guildId!, i.channelId, i.user.id, i.client);
  });
}
