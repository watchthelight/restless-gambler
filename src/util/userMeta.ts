import { getGuildDb } from '../db/connection.js';

export type UserMeta = { displayName: string; avatarUrl?: string };

export async function getUserMeta(client: any, guildId: string | null, userId: string): Promise<UserMeta> {
  if (!guildId) {
    // Fallback: fetch live without caching when not in a guild context
    try {
      const u = await client.users.fetch(userId);
      return { displayName: (u.globalName as string) || u.username || userId, avatarUrl: u.displayAvatarURL?.({ extension: 'png', size: 64 }) };
    } catch {
      return { displayName: userId };
    }
  }
  const db = getGuildDb(guildId);
  const row = db.prepare('SELECT display_name, avatar_url, updated_at FROM users WHERE user_id = ?').get(userId) as any;
  const now = Date.now();
  if (row && now - (row.updated_at || 0) < 24 * 3600 * 1000) {
    return { displayName: row.display_name || userId, avatarUrl: row.avatar_url || undefined };
  }
  let displayName = userId;
  let avatarUrl: string | undefined;
  try {
    if (guildId) {
      const m = await client.guilds.cache.get(guildId)?.members.fetch(userId);
      if (m) {
        displayName = m.displayName || m.user?.username || userId;
        avatarUrl = m.user?.displayAvatarURL?.({ extension: 'png', size: 64 });
      }
    }
    if (!avatarUrl) {
      const u = await client.users.fetch(userId);
      if (u) {
        displayName = (u.globalName as string) || u.username || displayName;
        avatarUrl = u.displayAvatarURL?.({ extension: 'png', size: 64 });
      }
    }
  } catch {}
  db.prepare('INSERT INTO users(user_id, display_name, avatar_url, updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, avatar_url=excluded.avatar_url, updated_at=excluded.updated_at').run(
    userId,
    displayName,
    avatarUrl ?? null,
    now,
  );
  return { displayName, avatarUrl };
}
