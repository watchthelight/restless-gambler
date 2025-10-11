import type { BaseInteraction, InteractionResponse } from 'discord.js';

/** Run handler exactly once for this interaction. Avoids InteractionAlreadyReplied. */
export async function replyOnce<T>(
  i: BaseInteraction,
  fn: () => Promise<T>,
): Promise<T | InteractionResponse<boolean> | void> {
  if ((i as any).replied || (i as any).deferred) {
    return;
  }
  return fn();
}

