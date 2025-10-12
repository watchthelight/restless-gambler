import type Database from 'better-sqlite3';

export type GuildSettings = { guild_id: string; home_channel_id?: string | null };

// Stored in existing KV table `guild_settings` using key 'home_channel_id'
export function getGuildSettings(db: Database.Database, guildId: string): GuildSettings {
  try {
    const row = db.prepare("SELECT value FROM guild_settings WHERE key = 'home_channel_id'").get() as { value?: string } | undefined;
    const home = (row?.value ?? '').trim();
    return { guild_id: guildId, home_channel_id: home || null };
  } catch {
    return { guild_id: guildId, home_channel_id: null };
  }
}

export function setHomeChannel(db: Database.Database, guildId: string, channelId: string) {
  db.prepare(`
    INSERT INTO guild_settings(key, value, updated_at)
    VALUES('home_channel_id', ?, strftime('%s','now'))
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `).run(channelId);
}

