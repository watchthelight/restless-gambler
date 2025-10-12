import { MessageFlags, type InteractionReplyOptions } from "discord.js";

export async function safeReply(interaction: any, opts: InteractionReplyOptions) {
  const flags = (opts as any).flags ?? ((opts as any).ephemeral ? MessageFlags.Ephemeral : undefined);
  const norm = { ...opts, ...(flags !== undefined ? { flags } : {}) } as any;
  try {
    if (!interaction.deferred && !interaction.replied) {
      return await interaction.reply(norm);
    }
    return await interaction.editReply(norm);
  } catch (err: any) {
    if (typeof interaction.update === "function") {
      try { return await interaction.update(norm); } catch {}
    }
    try { return await interaction.followUp(norm); } catch {}
    throw err;
  }
}

export async function safeDefer(interaction: any, _opts?: { ephemeral?: boolean }) {
  if (interaction.deferred || interaction.replied) return;
  try {
    return await interaction.deferReply({ ephemeral: false });
  } catch {}
}

