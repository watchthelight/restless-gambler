// ESM
import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type AnySelectMenuInteraction,
  type ModalSubmitInteraction,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import { randomBytes } from 'node:crypto';

export type AnyIx =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | AnySelectMenuInteraction
  | ModalSubmitInteraction;

export function newErrorId() {
  return randomBytes(5).toString('hex'); // short, human-friendly
}

export function buildPublicErrorEmbed(title: string, message: string, errorId: string) {
  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle(`❌ ${title}`)
    .setDescription(message)
    .addFields({ name: 'Error ID', value: `\`${errorId}\`` })
    .setTimestamp();
}

/**
 * Ensures an interaction is acknowledged, then posts/edits a public error.
 * - If not yet replied/deferred: reply (public).
 * - If deferred or already replied: editReply.
 * - Final fallback: followUp (public).
 * Swallows secondary InteractionNotReplied errors.
 */
export async function sendPublicError(ix: AnyIx, opts: { title: string; message: string; errorId: string }) {
  const embed = buildPublicErrorEmbed(opts.title, opts.message, opts.errorId);
  try {
    if (!ix.deferred && !ix.replied) {
      // public by default
      await ix.reply({ embeds: [embed] });
      return;
    }
    // Already acked -> prefer editReply; fall back to followUp
    await (ix as any).editReply?.({ embeds: [embed] });
  } catch {
    // Final fallback (rare race) – try followUp
    try { await (ix as any).followUp?.({ embeds: [embed] }); } catch {}
  }
}

