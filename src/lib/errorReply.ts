// ESM
import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { ensurePublicDefer, channelFallback } from './publicReply.js';
import { errorCard } from '../ui/cards.js';

export type AnyIx =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

export function newErrorId() {
  return randomBytes(5).toString('hex'); // short, human-friendly
}

export function buildPublicErrorEmbed(title: string, message: string, errorId: string) {
  return errorCard({ command: title.replace(/ failed$/i, ''), type: 'Error', message, errorId });
}

/**
 * Ensures an interaction is acknowledged, then posts/edits a public error.
 * - If not yet replied/deferred: reply (public).
 * - If deferred or already replied: editReply.
 * - Final fallback: followUp (public).
 * Swallows secondary InteractionNotReplied errors.
 */
export async function sendPublicError(ix: AnyIx, opts: { title: string; message: string; errorId: string; details?: string }) {
  const embed = buildPublicErrorEmbed(opts.title, opts.message, opts.errorId);
  try { await ensurePublicDefer(ix as any); } catch {}
  await channelFallback(ix as any, { embeds: [embed] } as any);
}
