import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { isValidSnowflake } from '../../util/discord.js';
import { ensureSuperAdminsSchema, superAdminInsertSQL } from '../../db/adminSchema.js';

function getTargetUserId(interaction: ChatInputCommandInteraction): string | null {
    // Real USER option (type 6) - required by command builder
    const u = interaction.options.getUser("user", true);
    return u?.id ?? null;
}

export async function runAdminAddNormal(interaction: ChatInputCommandInteraction, ctx: any) {
    const userId = getTargetUserId(interaction);
    if (!isValidSnowflake(userId)) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Invalid user. Provide a Discord ID or mention like <@123456789012345678>." }).catch(() => { });
        return;
    }
    if (interaction.user?.id === userId) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "You can't add yourself." }).catch(() => { });
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
            flags: MessageFlags.Ephemeral,
            content: already ? `Added <@${userId}> as **admin** for this server.` : `Added <@${userId}> as **admin** for this server.`
        });
    } catch (e: any) {
        ctx.log.error?.({ msg: 'admin_add_normal_error', err: String(e), userId, guildId: interaction.guildId });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Failed to add admin (ERR-ADMIN-NORMAL).' }).catch(() => { });
    }
}

export async function runAdminAddSuper(interaction: ChatInputCommandInteraction, ctx: any) {
    // only existing super admins can run this
    const actorId = interaction.user?.id;
    const isSuper = !!ctx.adminDb.prepare(`SELECT 1 FROM super_admins WHERE user_id = ?`).get(actorId);
    if (!isSuper) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Only a super admin can add another super admin.' }).catch(() => { });
        return;
    }
    const userId = getTargetUserId(interaction);
    if (!isValidSnowflake(userId)) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Invalid user. Provide a Discord ID or mention like <@123456789012345678>." }).catch(() => { });
        return;
    }
    if (actorId === userId) {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: "You're already a super admin." }).catch(() => { });
        return;
    }
    try {
        ensureSuperAdminsSchema(ctx.adminDb, ctx.log);
        const { sql } = superAdminInsertSQL(ctx.adminDb);
        ctx.adminDb.prepare(sql).run(userId);
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: `Added <@${userId}> as **super admin**.` });
    } catch (e: any) {
        const msg = String(e?.message || e);
        if (/UNIQUE|PRIMARY KEY/i.test(msg)) {
            await interaction.reply({ flags: MessageFlags.Ephemeral, content: `<@${userId}> is already a super admin.` }).catch(() => { });
            return;
        }
        ctx.log.error?.({ msg: 'admin_add_super_error', err: msg, userId });
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Failed to add super admin (ERR-ADMIN-SUPER).' }).catch(() => { });
    }
}
