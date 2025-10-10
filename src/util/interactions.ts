import { MessageFlags } from 'discord.js';
import { VISIBILITY_MODE } from '../config/runtime.js';

export async function safeReply(i: any, payload: any) {
  try {
    const publicMode = VISIBILITY_MODE === 'public';
    const p = { ...payload };
    if (publicMode && 'flags' in p) delete (p as any).flags;
    if (!i.deferred && !i.replied) return await i.reply(p);
    return await i.editReply(p);
  } catch (e: any) {
    const code = e?.code ?? e?.status;
    if (code === 50013) {
      console.warn(
        JSON.stringify({ msg: 'permission_error', code, guildId: (i as any).guildId ?? null, channelId: (i as any).channelId ?? null }),
      );
    }
    throw e;
  }
}

export async function ensureDeferred(i: any, flags: number = MessageFlags.Ephemeral) {
  if (!i.deferred && !i.replied) {
    try {
      const publicMode = VISIBILITY_MODE === 'public';
      await i.deferReply(publicMode ? {} : { flags });
      (i as any).__autoDeferred = true;
    } catch {}
  }
}

// One-and-only-one response path: optional immediate, then final edit
export async function respondOnce(
  i: any,
  buildFirst?: () => any,
  buildFinal?: () => Promise<any> | any,
) {
  if (buildFirst) {
    const first = buildFirst();
    await safeReply(i, first).catch(() => {});
  } else {
    await ensureDeferred(i);
  }
  if (buildFinal) {
    const finalPayload = await buildFinal();
    const publicMode = VISIBILITY_MODE === 'public';
    const p = { ...finalPayload };
    if (publicMode && 'flags' in p) delete (p as any).flags;
    await i.editReply(p).catch(() => {});
  }
}
