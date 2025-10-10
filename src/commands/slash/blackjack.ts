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
import { requireAdmin } from '../../admin/roles.js';
import { blackjackLimits, validateBet, safeDefer, safeEdit, replyError } from '../../game/config.js';
import { safeReply } from '../../interactions/reply.js';
import { withLock } from '../../util/locks.js';
import { findActiveSession, createSession, updateSession, settleSession, abortSession } from '../../game/blackjack/sessionStore.js';

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
  if (handRender.kind === 'image') {
    const att = handRender.attachment;
    embed.setImage(`attachment://${(att as any).name}`);
    const payload: any = { embeds: [embed], files: [att], components: [row] };
    if ((i as any).replied || (i as any).deferred) return (i as any).followUp(payload);
    return (i as any).reply(payload);
  } else {
    // Add unicode as a single field content
    embed.setDescription(`${desc}\n\n${handRender.text}`);
    const payload: any = { embeds: [embed], components: [row] };
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
      settleSession(db, session.id);
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
          await msg.edit({ embeds: [themeEmbed], components: [] });
        } catch { }
      }
      console.info(JSON.stringify({ msg: 'blackjack', action: 'auto-stand', guild_id: guildId, channel_id: channelId, user_id: userId }));
    } catch { }
  }, TIMEOUT_MS);
  tmap.set(k, t);
}

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.guildId) { await i.reply({ content: 'This bot only works in servers.' }); return; }
  const sub = i.options.getSubcommand(true);
  const guildId = i.guildId;
  const channelId = i.channelId;
  const userId = i.user.id;
  const db = getGuildDb(guildId);
  if (sub === 'start') {
    const bet = i.options.getInteger('bet', true);
    const limits = blackjackLimits(db);
    const v = validateBet(bet, limits);
    if (!v.ok) { await i.reply({ content: v.reason }); return; }
    const bal = getBalance(guildId, userId);
    if (bal < bet) {
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
    const state = dealInitial(bet);
    (state as any).channelId = channelId;
    saveSession(guildId, userId, state);
    const m = await renderAndReply(i, state, { revealDealer: false, disableDouble: false, finished: state.finished });
    try { const msg = await (m as any); const mid = (msg?.id || (await i.fetchReply())?.id) as string; if (mid) { (state as any).messageId = mid; saveSession(guildId, userId, state); } } catch { }
    ensureTimeout(guildId, channelId, userId, i.client);
    // Auto settle if immediate blackjack conditions
    if (isBlackjack(state.playerHands[0].cards) || isBlackjack(state.dealer.cards)) {
      bjStand(state);
      const result = settle(state);
      if (result.payout > 0) await adjustBalance(guildId, userId, result.payout, 'blackjack:win');
      const session = findActiveSession(db, guildId, userId);
      if (session) settleSession(db, session.id);
      const delta = result.payout - bet;
      const balNow = getBalance(guildId, userId);
      const mode = uiExactMode(db, "guild");
      const sig = uiSigFigs(db);
      const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
      const headline = delta > 0 ? `Blackjack! +${formatBolts(delta)}\nNew balance: ${balText}` : delta === 0 ? `Push. Bet refunded.\nNew balance: ${balText}` : `You lost ${formatBolts(-delta)}.\nNew balance: ${balText}`;
      await renderAndReply(i, state, { revealDealer: true, headline, finished: true, disableDouble: true });
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
      await renderAndReply(i, state, { revealDealer: false, disableDouble: true, finished, headline });
      ensureTimeout(guildId, (state as any).channelId || channelId, userId, i.client);
    } else if (sub === 'stand') {
      bjStand(state);
      const result = settle(state);
      if (result.payout > 0) await adjustBalance(guildId, userId, result.payout, 'blackjack:win');
      settleSession(db, session.id);
      const delta = result.payout - state.bet;
      const balNow = getBalance(guildId, userId);
      const mode = uiExactMode(db, "guild");
      const sig = uiSigFigs(db);
      const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
      const headline = delta > 0 ? `You won +${formatBolts(delta)}!!!\nNew balance: ${balText}` : delta === 0 ? `Push. Bet refunded.\nNew balance: ${balText}` : `You lost ${formatBolts(-delta)}.\nNew balance: ${balText}`;
      await renderAndReply(i, state, { revealDealer: true, disableDouble: true, finished: true, headline });
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
      settleSession(db, session.id);
      const delta = result.payout - state.bet * 2;
      const balNow = getBalance(guildId, userId);
      const mode = uiExactMode(db, "guild");
      const sig = uiSigFigs(db);
      const balText = mode === "inline" ? renderAmountInline(balNow, sig) : formatBolts(balNow);
      const headline = delta > 0 ? `You won +${formatBolts(delta)}!!!\nNew balance: ${balText}` : delta === 0 ? `Push. Bet refunded.\nNew balance: ${balText}` : `You lost ${formatBolts(-delta)}.\nNew balance: ${balText}`;
      await renderAndReply(i, state, { revealDealer: true, disableDouble: true, finished: true, headline });
    }
    console.info(JSON.stringify({ msg: 'blackjack', action: sub, guild_id: guildId, channel_id: channelId, user_id: userId }));
  } else if (sub === 'cancel') {
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
        abortSession(db, session.id);
        // Refund inside same txn to keep atomic with cancel
        const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(userId) as { balance?: number } | undefined;
        const cur = row?.balance ?? 0;
        const next = cur + bet;
        db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET balance = excluded.balance, updated_at = excluded.updated_at').run(
          userId,
          next,
          Date.now(),
        );
        db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?,?,?,?)').run(userId, bet, 'blackjack:cancel', Date.now());
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
          if (!(i as any).replied && !(i as any).deferred) await (i as any).reply({ content: 'Blackjack is updating its data. Try again in a moment.', flags: MessageFlags.Ephemeral });
          return;
        }
      }
      if (!(i as any).replied && !(i as any).deferred) await (i as any).reply({ content: 'Something went wrong processing your request.', flags: MessageFlags.Ephemeral });
    }
  }
}

export async function handleButton(i: ButtonInteraction) {
  const [prefix, action, g, c, u] = i.customId.split(':');
  if (prefix !== 'blackjack') return;
  if (!i.guildId || i.guildId !== g) { await safeReply(i, { content: 'This bot only works in servers.', flags: MessageFlags.Ephemeral }); return; }
  if (i.user.id !== u) { await safeReply(i, { content: `Only <@${u}> can act on this hand.`, flags: MessageFlags.Ephemeral }); return; }
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
