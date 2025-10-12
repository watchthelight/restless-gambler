import type {
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  InteractionEditReplyOptions,
  MessageCreateOptions,
  TextBasedChannel,
} from 'discord.js';

export async function ensurePublicDefer(i: ChatInputCommandInteraction | MessageComponentInteraction) {
  if ((i as any).deferred || (i as any).replied) return;
  await (i as any).deferReply({ ephemeral: false });
}

export async function replyPublic(
  i: ChatInputCommandInteraction | MessageComponentInteraction,
  payload: InteractionEditReplyOptions,
) {
  if (!(i as any).deferred && !(i as any).replied) {
    return (i as any).reply({ ...(payload as any), ephemeral: false });
  }
  return (i as any).editReply(payload);
}

export async function channelFallback(
  i: ChatInputCommandInteraction | MessageComponentInteraction,
  payload: MessageCreateOptions,
) {
  try {
    return await replyPublic(i, payload as any);
  } catch {
    const ch = (i as any).channel as TextBasedChannel | null;
    if (ch) return await (ch as any).send(payload);
  }
}
