import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import os from 'node:os';
import { getGuildTheme } from '../../ui/theme.js';
import { themedEmbed } from '../../ui/embeds.js';
import { respondOnce } from '../../util/interactions.js';
import { getGlobalAdminDb, getGuildDb } from '../../db/connection.js';

export const data = new SlashCommandBuilder().setName('ping').setDescription('Detailed health and latency');

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${d}d ${h}:${m}:${s}`;
}

export async function run(i: ChatInputCommandInteraction) {
  const theme = getGuildTheme(i.guildId);
  const started = Date.now();
  await respondOnce(i, () => ({ content: 'Measuring…' }), async () => {
    // Timings
    const roundTripMs = Date.now() - i.createdTimestamp;
    const wsPing = Math.round(i.client.ws.ping);
    const t0 = Date.now();
    try { if (i.guildId) getGuildDb(i.guildId).prepare('SELECT 1').get(); } catch {}
    const dataDb = Date.now() - t0;
    const t1 = Date.now();
    try { getGlobalAdminDb().prepare('SELECT 1').get(); } catch {}
    const adminDb = Date.now() - t1;
    const uptime = fmtUptime(process.uptime());
    const mu = process.memoryUsage();
    const rss = Math.round(mu.rss / (1024 * 1024));
    const heap = Math.round(mu.heapUsed / (1024 * 1024));
    const cpu = process.platform === 'linux' ? os.loadavg()[0].toFixed(2) : 'n/a';
    const guilds = i.client.guilds.cache.size;
    const members = i.client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    const shardId = (i.client as any).shard?.ids?.[0] ?? 0;
    const canvasAvailable = (() => { try { require('canvas'); return true; } catch { return false; } })();

    const embed = themedEmbed(theme, 'Ping / Health')
      .addFields(
        { name: 'Gateway', value: `${wsPing} ms`, inline: true },
        { name: 'Round-trip', value: `${roundTripMs} ms`, inline: true },
        { name: 'DB (guild/admin)', value: `${dataDb} / ${adminDb} ms`, inline: true },
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'Memory', value: `${rss} / ${heap} MB`, inline: true },
        { name: 'CPU', value: `${cpu}`, inline: true },
        { name: 'Guilds/Members', value: `${guilds} / ${members}`, inline: true },
        { name: 'Shard', value: String(shardId), inline: true },
        { name: 'Canvas', value: canvasAvailable ? 'yes' : 'no', inline: true },
      );
    return { embeds: [embed] };
  });
}

export async function execute(i: ChatInputCommandInteraction) {
  return run(i);
}
