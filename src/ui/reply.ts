// NEW FILE: src/ui/reply.ts
import { MessageFlags, type InteractionReplyOptions } from 'discord.js';

export type SendPayload = InteractionReplyOptions & { ephemeral?: boolean };

function withDefaults(p: SendPayload): InteractionReplyOptions {
  const flags = p.ephemeral ? MessageFlags.Ephemeral : (p as any).flags;
  const base: InteractionReplyOptions = { ...p };
  if (flags !== undefined) (base as any).flags = flags;
  // Always avoid accidental mentions
  (base as any).allowedMentions = { parse: [] };
  // Do not pass our custom field downstream
  delete (base as any).ephemeral;
  return base;
}

export async function send(interaction: any, payload: SendPayload) {
  const opts = withDefaults(payload);
  try {
    if (!interaction.deferred && !interaction.replied) {
      return await interaction.reply(opts);
    }
    return await interaction.editReply(opts);
  } catch (err) {
    try { return await interaction.followUp(opts); } catch {}
    throw err;
  }
}

