/**
 * SUPER admin resolution and DM delivery for bug reports.
 */
import type { Client, EmbedBuilder } from 'discord.js';
import { getGuildDb } from '../db/connection.js';
import { ensureAttached, getSupers } from '../admin/adminStore.js';
import { sanitize } from './sanitize.js';

export interface BugReportDM {
  id: string;
  guildId: string;
  channelId: string;
  userId: string;
  command: string;
  expected: string;
  actual: string;
  createdAt: number;
  reporterTag: string;
  guildName: string;
  channelName?: string;
  messageId?: string;
  attachmentUrl?: string;
}

/**
 * Resolve SUPER admin user IDs for a guild.
 * Order of resolution:
 * 1. adminStore.getSupers() (existing admin system)
 * 2. SUPER_ADMIN_USER_IDS env var (global, comma-separated)
 * 3. SUPER_ADMIN_ROLE_IDS env var (per-guild role IDs, comma-separated)
 */
export async function getSuperAdminIds(client: Client, guildId: string): Promise<string[]> {
  const ids = new Set<string>();

  // 1. adminStore SUPER admins
  try {
    const db = getGuildDb(guildId);
    ensureAttached(db);
    const supers = getSupers(db);
    for (const { user_id } of supers) {
      if (user_id && /^\d{17,20}$/.test(user_id)) {
        ids.add(user_id);
      }
    }
  } catch (e) {
    console.error('[superAdmins] Failed to fetch from adminStore:', e);
  }

  // 2. SUPER_ADMIN_USER_IDS env var
  const envUserIds = process.env.SUPER_ADMIN_USER_IDS;
  if (envUserIds) {
    for (const id of envUserIds.split(',')) {
      const trimmed = id.trim();
      if (trimmed && /^\d{17,20}$/.test(trimmed)) {
        ids.add(trimmed);
      }
    }
  }

  // 3. SUPER_ADMIN_ROLE_IDS env var (fetch members with those roles)
  const envRoleIds = process.env.SUPER_ADMIN_ROLE_IDS;
  if (envRoleIds && client.guilds) {
    try {
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        const roleIds = envRoleIds.split(',').map(r => r.trim()).filter(Boolean);
        for (const roleId of roleIds) {
          try {
            const role = await guild.roles.fetch(roleId).catch(() => null);
            if (role) {
              // Fetch guild members if not cached
              if (guild.members.cache.size === 0) {
                await guild.members.fetch().catch(() => {});
              }
              for (const [memberId, member] of guild.members.cache) {
                if (member.roles.cache.has(roleId) && !member.user.bot) {
                  ids.add(memberId);
                }
              }
            }
          } catch (e) {
            console.error(`[superAdmins] Failed to fetch role ${roleId}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('[superAdmins] Failed to fetch guild for role resolution:', e);
    }
  }

  // Filter out bots (paranoid double-check)
  const filtered: string[] = [];
  for (const uid of ids) {
    try {
      const user = await client.users.fetch(uid).catch(() => null);
      if (user && !user.bot) {
        filtered.push(uid);
      }
    } catch {
      // If fetch fails, still include (best effort)
      filtered.push(uid);
    }
  }

  return [...new Set(filtered)];
}

/**
 * DM all SUPER admins with a prettified bug report embed.
 * Returns { attempted, succeeded } stats.
 */
export async function dmSupersWithBug(
  client: Client,
  report: BugReportDM,
  embed: EmbedBuilder
): Promise<{ attempted: number; succeeded: number }> {
  const ids = await getSuperAdminIds(client, report.guildId);
  if (!ids.length) return { attempted: 0, succeeded: 0 };

  const files = report.attachmentUrl ? [{ attachment: report.attachmentUrl }] : undefined;

  const results = await Promise.allSettled(
    ids.map(async (uid) => {
      const u = await client.users.fetch(uid);
      await u.send({ content: '🔔 Bug reported', embeds: [embed], files });
    })
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;

  // Log per-recipient outcomes
  for (let i = 0; i < ids.length; i++) {
    const result = results[i];
    const uid = ids[i];
    if (result.status === 'rejected') {
      console.warn(`[bugreport] DM failed for ${uid}:`, result.reason?.message || result.reason);
    }
  }

  return { attempted: ids.length, succeeded };
}
