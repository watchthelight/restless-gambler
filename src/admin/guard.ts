import type { BaseInteraction } from 'discord.js';
import { ensurePublicDefer, replyPublic } from '../lib/publicReply.js';
import { errorCard } from '../ui/cards.js';
import { getGuildDb, getGlobalAdminDb } from '../db/connection.js';
import { ensureAttached, isSuper as storeIsSuper, isGuildAdmin as storeIsGuildAdmin } from './adminStore.js';

export class AuthzError extends Error { constructor(msg = 'Not authorized') { super(msg); } }

export async function requireAdmin(interaction: BaseInteraction) {
  const uid = (interaction as any).user?.id as string | undefined;
  const gid = (interaction as any).guildId as string | undefined;
  let ok = false;
  if (uid && gid) {
    try {
      const db = getGuildDb(gid);
      try { ensureAttached(db as any); } catch { }
      ok = storeIsSuper(db as any, uid) || storeIsGuildAdmin(db as any, gid, uid);
      if (!ok) {
        // Back-compat: accept local guild_admins in main schema
        try { ok = !!(db.prepare('SELECT 1 FROM guild_admins WHERE user_id = ? LIMIT 1').get(uid) as any); } catch { /* ignore */ }
      }
    } catch { ok = false; }
  }
  if (!ok) {
    try { console.warn(JSON.stringify({ msg: 'admin_check_miss', guildId: gid, userId: uid })); } catch { }
    const card = errorCard({ command: 'admin', type: 'AccessDenied', message: 'You don\u2019t have permission to use this command.', errorId: 'NA' });
    await ensurePublicDefer(interaction as any as any);
    await replyPublic(interaction as any, { embeds: [card] });
    throw new AuthzError();
  }
}

export async function requireSuper(interaction: BaseInteraction) {
  const uid = (interaction as any).user?.id as string | undefined;
  let ok = false;
  if (uid) {
    try {
      const gid = (interaction as any).guildId as string | undefined;
      if (gid) {
        const db = getGuildDb(gid);
        try { ensureAttached(db as any); } catch { }
        ok = storeIsSuper(db as any, uid);
      } else {
        // DM context: check global supers via attached admin DB on a transient connection
        const adb = getGlobalAdminDb();
        ok = !!(adb.prepare('SELECT 1 FROM super_admins WHERE user_id = ? LIMIT 1').get(uid) as any);
      }
    } catch { ok = false; }
  }
  if (!ok) {
    const card = errorCard({ command: 'admin', type: 'AccessDenied', message: 'Super admin required.', errorId: 'NA' });
    await ensurePublicDefer(interaction as any as any);
    await replyPublic(interaction as any, { embeds: [card] });
    throw new AuthzError();
  }
}
