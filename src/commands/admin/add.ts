import { ChatInputCommandInteraction } from 'discord.js';
import { extractUserId, isValidSnowflake } from '../../util/discord.js';
import { ensureSuperAdminsSchema, superAdminInsertSQL } from '../../db/adminSchema.js';

function getTargetUserId(interaction: any): string | null {
    // Preferred: real USER option (type 6)
    const u = interaction.options.getUser?.("user");
    if (u?.id) return u.id;
    // Fallback: string option (legacy payloads)
    const s = interaction.options.getString?.("user");
    const id = extractUserId(s ?? "");
    return id ?? null;
}

export async function runAdminAddNormal(interaction: ChatInputCommandInteraction, ctx: any) {
    const userId = getTargetUserId(interaction);
    if (!isValidSnowflake(userId)) {
        await interaction.reply({ ephemeral: true, content: 'Invalid user. Provide a Discord ID or mention like `<@123456789012345678>`.' }).catch(() => { });
        return;
    }
    if (interaction.user?.id === userId) {
        await interaction.reply({ ephemeral: true, content: 'You can’t add yourself.' }).catch(() => { });
        return;
    }
    try {
        // Ensure table exists (should be created by migrations, but be defensive)
        ctx.guildDb.exec(`CREATE TABLE IF NOT EXISTS guild_admins(user_id TEXT PRIMARY KEY, added_at INTEGER NOT NULL)`);
        // Idempotent insert
        ctx.guildDb.prepare(`
      INSERT OR IGNORE INTO guild_admins(user_id, added_at)
      VALUES (?, strftime('%s','now'))
    `).run(userId);
        const already = ctx.guildDb.prepare(`SELECT 1 FROM guild_admins WHERE user_id = ?`).get(userId);
        await interaction.reply({
            ephemeral: true,
            content: already ? `Added <@${userId}> as **admin** for this server.` : `Added <@${userId}> as **admin** for this server.`
        });
    } catch (e: any) {
        ctx.log.error?.({ msg: 'admin_add_normal_error', err: String(e), userId, guildId: interaction.guildId });
        await interaction.reply({ ephemeral: true, content: 'Failed to add admin (ERR-ADMIN-NORMAL).' }).catch(() => { });
    }
}

export async function runAdminAddSuper(interaction: ChatInputCommandInteraction, ctx: any) {
    // only existing super admins can run this
    const actorId = interaction.user?.id;
    const isSuper = !!ctx.adminDb.prepare(`SELECT 1 FROM super_admins WHERE user_id = ?`).get(actorId);
    if (!isSuper) {
        await interaction.reply({ ephemeral: true, content: 'Only a super admin can add another super admin.' }).catch(() => { });
        return;
    }
    const userId = getTargetUserId(interaction);
    if (!isValidSnowflake(userId)) {
        await interaction.reply({ ephemeral: true, content: 'Invalid user. Provide a Discord ID or mention like `<@123456789012345678>`.' }).catch(() => { });
        return;
    }
    if (actorId === userId) {
        await interaction.reply({ ephemeral: true, content: 'You’re already a super admin.' }).catch(() => { });
        return;
    }
    try {
        ensureSuperAdminsSchema(ctx.adminDb, ctx.log);
        const { sql } = superAdminInsertSQL(ctx.adminDb);
        ctx.adminDb.prepare(sql).run(userId);
        await interaction.reply({ ephemeral: true, content: `Added <@${userId}> as **super admin**.` });
    } catch (e: any) {
        const msg = String(e?.message || e);
        if (/UNIQUE|PRIMARY KEY/i.test(msg)) {
            await interaction.reply({ ephemeral: true, content: `<@${userId}> is already a super admin.` }).catch(() => { });
            return;
        }
        ctx.log.error?.({ msg: 'admin_add_super_error', err: msg, userId });
        await interaction.reply({ ephemeral: true, content: 'Failed to add super admin (ERR-ADMIN-SUPER).' }).catch(() => { });
    }
}
