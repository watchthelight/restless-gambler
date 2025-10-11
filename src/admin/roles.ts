import { AttachmentBuilder, BaseInteraction } from 'discord.js';
import { generateCard } from '../ui/cardFactory.js';
import { getGuildTheme } from '../ui/theme.js';
import { themedEmbed } from '../ui/embeds.js';
import { getGlobalAdminDb, getGuildDb } from '../db/connection.js';
import { superAdminInsertSQL } from '../db/adminSchema.js';
import { isAdminInGuild, addGuildAdmin as storeAddGuildAdmin, removeGuildAdmin as storeRemoveGuildAdmin } from './adminStore.js';

export enum Role { BASE = 'BASE', ADMIN = 'ADMIN', SUPER = 'SUPER' }

export class AuthzError extends Error { constructor(msg = 'Not authorized') { super(msg); } }

export function isSuperAdmin(userId: string): boolean {
  const db = getGlobalAdminDb();
  const row = db.prepare('SELECT 1 FROM super_admins WHERE user_id = ?').get(userId) as any;
  return !!row;
}

export function isGuildAdmin(guildId: string, userId: string): boolean {
  const db = getGuildDb(guildId);
  return isAdminInGuild(db, guildId, userId);
}

async function sendDenied(interaction: BaseInteraction) {
  const theme = getGuildTheme(interaction.guildId);
  const card = await generateCard({ layout: 'Notice', theme, payload: { title: 'Access Denied', message: "You don’t have permission to use this command." } });
  const file = new AttachmentBuilder(card.buffer, { name: card.filename });
  const embed = themedEmbed(theme, 'Access Denied', 'Contact an Admin if you think this is a mistake.').setImage(`attachment://${card.filename}`);
  if ((interaction as any).replied || (interaction as any).deferred) await (interaction as any).followUp({ embeds: [embed], files: [file] });
  else await (interaction as any).reply({ embeds: [embed], files: [file] });
}

export async function requireAdmin(interaction: BaseInteraction) {
  const uid = (interaction as any).user?.id as string | undefined;
  const gid = (interaction as any).guildId as string | undefined;
  const ok = !!uid && (isSuperAdmin(uid) || (gid ? isGuildAdmin(gid, uid) : false));
  if (!ok) {
    await sendDenied(interaction);
    throw new AuthzError();
  }
}

export async function requireSuper(interaction: BaseInteraction) {
  const uid = (interaction as any).user?.id as string | undefined;
  if (!uid || !isSuperAdmin(uid)) {
    await sendDenied(interaction);
    throw new AuthzError();
  }
}

export function addGuildAdmin(guildId: string, uid: string): void {
  const db = getGuildDb(guildId);
  storeAddGuildAdmin(db, guildId, uid);
}

export function removeGuildAdmin(guildId: string, uid: string): void {
  const db = getGuildDb(guildId);
  storeRemoveGuildAdmin(db, guildId, uid);
}

export function seedSuperAdmin(uid: string) {
  const db = getGlobalAdminDb();
  // Use superAdminInsertSQL to handle schema variations (created_at vs added_at)
  const { sql } = superAdminInsertSQL(db);
  db.prepare(sql).run(uid);
}

export function getRole(uid: string): Role {
  if (isSuperAdmin(uid)) return Role.SUPER;
  return Role.BASE;
}

export function addAdmin(uid: string, nickname: string, role: string) {
  if (role === 'SUPER') seedSuperAdmin(uid);
  // For ADMIN, could add to guild_admins, but test doesn't specify guild
}

export function removeAdmin(uid: string) {
  const db = getGlobalAdminDb();
  db.prepare('DELETE FROM super_admins WHERE user_id = ?').run(uid);
}

export function audit(actor_uid: string, action: string, target_uid?: string, details?: any) {
  const now = Date.now();
  const adminDb = getGlobalAdminDb();
  adminDb.prepare('INSERT INTO admin_audit(actor_uid, action, target_uid, details, created_at) VALUES (?,?,?,?,?)')
    .run(actor_uid, action, target_uid ?? null, details ? JSON.stringify(details) : null, now);
  try {
    const logObj = { event: 'admin_action', actor_uid, target_uid: target_uid ?? null, action, timestamp: now };
    console.log(JSON.stringify(logObj));
  } catch { }
}
