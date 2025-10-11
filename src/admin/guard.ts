import type { BaseInteraction } from 'discord.js';
import { themedEmbed } from '../ui/embeds.js';
import { send } from '../ui/reply.js';
import { getGuildDb, getGlobalAdminDb } from '../db/connection.js';
import { isAdmin as hasAdminRole, isSuperAdmin as hasSuper } from './permissions.js';

export class AuthzError extends Error { constructor(msg = 'Not authorized') { super(msg); } }

export async function requireAdmin(interaction: BaseInteraction) {
  const uid = (interaction as any).user?.id as string | undefined;
  const gid = (interaction as any).guildId as string | undefined;
  let ok = false;
  if (uid && gid) {
    try {
      const db = getGuildDb(gid);
      ok = hasAdminRole(db, uid);
    } catch {
      // Fallback to local guild_admins and then to global super_admins via direct connection
      try {
        const db = getGuildDb(gid);
        ok = hasAdminRole(db, uid);
      } catch {
        try {
          const adb = getGlobalAdminDb();
          const r = adb.prepare('SELECT 1 FROM super_admins WHERE user_id = ? LIMIT 1').get(uid) as any;
          ok = !!r;
        } catch { ok = false; }
      }
    }
  }
  if (!ok) {
    try { console.warn(JSON.stringify({ msg: 'admin_check_miss', guildId: gid, userId: uid })); } catch { }
    const emb = themedEmbed('error', 'Access Denied', 'You don\u2019t have permission to use this command.', undefined, {
      user: (interaction as any).user ?? null,
      guildName: (interaction as any).guild?.name ?? null,
    });
    await send(interaction as any, { embeds: [emb], ephemeral: true });
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
        ok = hasSuper(db, uid);
      } else {
        const adb = getGlobalAdminDb();
        const row = adb.prepare('SELECT 1 FROM super_admins WHERE user_id = ? LIMIT 1').get(uid) as any;
        ok = !!row;
      }
    } catch {
      try {
        const adb = getGlobalAdminDb();
        const row = adb.prepare('SELECT 1 FROM super_admins WHERE user_id = ? LIMIT 1').get(uid) as any;
        ok = !!row;
      } catch { ok = false; }
    }
  }
  if (!ok) {
    const emb = themedEmbed('error', 'Access Denied', 'Super admin required.', undefined, {
      user: (interaction as any).user ?? null,
      guildName: (interaction as any).guild?.name ?? null,
    });
    await send(interaction as any, { embeds: [emb], ephemeral: true });
    throw new AuthzError();
  }
}
