import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, REST } from 'discord.js';
import { addGuildAdmin, audit, isSuperAdmin, removeGuildAdmin, requireAdmin, requireSuper } from '../../admin/roles.js';
import { themedEmbed } from '../../ui/embeds.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard } from '../../ui/cardFactory.js';
import { getGuildDb, getGlobalAdminDb } from '../../db/connection.js';
import { restartProcess } from '../../util/restart.js';
import { respondOnce } from '../../util/interactions.js';
import { extractUserId, isValidSnowflake } from '../../util/discord.js';
import { ensureSuperAdminsSchema, superAdminInsertSQL } from '../../db/adminSchema.js';
import { syncAll, listGlobal, listGuild, purgeGuildCommands } from '../../registry/sync.js';
import { updateBotPresence } from "../../metrics/project.js";
import { runAdminAddNormal, runAdminAddSuper } from './add.js';
import log from '../../cli/logger.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin controls')
  .addSubcommand((s) => s.setName('add').setDescription('Add admin for this guild').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('super-add').setDescription('Add super admin (SUPER only)').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Remove admin (SUPER only)').addStringOption((o) => o.setName('user').setDescription('User ID or mention').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('List admins'))
  .addSubcommand((s) => s.setName('whoami').setDescription('Show your role'))
  .addSubcommand((s) => s.setName('reboot').setDescription('Reboot the bot (Admin+)'))
  .addSubcommand((s) => s.setName('give').setDescription('Add admin for this guild (alias for add)').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) =>
    s
      .setName('take')
      .setDescription('Admin: take currency from a user (not below 0)')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to subtract').setRequired(true).setMinValue(1)),
  )
  .addSubcommand((s) =>
    s
      .setName('reset')
      .setDescription('Admin: reset user balance and stats to defaults')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('sync-commands')
      .setDescription('Sync slash commands globally and purge guild duplicates')
  )
  .addSubcommand((s) => s.setName('appinfo').setDescription('Show application info and global commands'))
  .addSubcommand((s) => s.setName('list-commands').setDescription('List global and guild-scoped commands'))
  .addSubcommand((s) => s.setName('force-purge').setDescription('Force purge guild-scoped commands across all guilds'))
  .addSubcommand((s) =>
    s
      .setName('refresh-status')
      .setDescription('Recompute counts and update the bot presence'));

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'add' || sub === 'give') {
    await requireAdmin(interaction);
    return runAdminAddNormal(interaction, { adminDb: getGlobalAdminDb(), guildDb: getGuildDb(interaction.guildId!), log });
  }
  else if (sub === 'super-add') {
    return runAdminAddSuper(interaction, { adminDb: getGlobalAdminDb(), guildDb: getGuildDb(interaction.guildId!), log });
  }
  else if (sub === 'remove') {
    await requireSuper(interaction);
    const input = interaction.options.getString('user', true);
    const userId = extractUserId(input);
    if (!isValidSnowflake(userId)) {
      await interaction.reply({
        ephemeral: true,
        content: "Invalid user. Provide a Discord ID or mention (e.g. `<@123456789012345678>`).",
      }).catch(() => { });
      return;
    }
    if (userId === '697169405422862417') {
      const theme = getGuildTheme(interaction.guildId);
      const card = await generateCard({ layout: 'Notice', theme, payload: { title: 'Access Denied', message: 'Cannot remove Super Admin.' } });
      await interaction.reply({ embeds: [themedEmbed(theme, 'Access Denied', 'Cannot remove Super Admin.').setImage(`attachment://${card.filename}`)], files: [new AttachmentBuilder(card.buffer, { name: card.filename })] });
      return;
    }
    try {
      const adminDb = getGlobalAdminDb();
      adminDb.prepare('DELETE FROM super_admins WHERE user_id = ?').run(userId);
      audit(interaction.user.id, 'admin_remove', userId);
      const theme = getGuildTheme(interaction.guildId);
      await interaction.reply({ embeds: [themedEmbed(theme, 'Super Admin Removed', `<@${userId}>`)] });
    } catch (e: any) {
      console.error('admin_remove_error', e?.message || e, userId);
      await interaction.reply({ ephemeral: true, content: 'Failed to remove super admin (ERR-ADMIN-REMOVE).' }).catch(() => { });
    }
  } else if (sub === 'list') {
    await requireAdmin(interaction);
    const adminDb = getGlobalAdminDb();
    const db = getGuildDb(interaction.guildId!);

    // Super admin header (usually exactly one)
    const superRow = adminDb.prepare(`
      SELECT user_id, COALESCE(created_at, added_at) AS created_at
      FROM super_admins
      ORDER BY COALESCE(created_at, added_at) DESC
      LIMIT 1
    `).get() as { user_id: string; created_at: number } | undefined;
    const superLine = superRow
      ? `<@${superRow.user_id}> (Super Admin)`
      : "(none)";

    // Normal admins in this guild
    const rows = db.prepare(`
      SELECT user_id, added_at
      FROM guild_admins
      ORDER BY added_at DESC
    `).all() as { user_id: string; added_at: number }[];

    const adminLines = rows.map(r => {
      const ts = Number(r.added_at) * 1000;
      const when = Number.isFinite(ts) ? new Date(ts).toISOString() : "unknown";
      return `• <@${r.user_id}> — ${when}`;
    });

    const body = [
      "**Admin List**",
      "",
      `Super admin: ${superLine}`,
      "",
      rows.length ? "Current admins:" : "No normal admins yet.",
      ...(rows.length ? ["", ...adminLines] : []),
    ].join("\n");

    await interaction.reply({ ephemeral: true, content: body });
  } else if (sub === 'whoami') {
    const role = isSuperAdmin(interaction.user.id) ? 'SUPER' : 'ADMIN';
    const theme = getGuildTheme(interaction.guildId);
    const card = await generateCard({ layout: 'Notice', theme, payload: { title: 'Role', message: `You are ${role}.` } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const embed = themedEmbed(theme, 'Who Am I', `Role: ${role}`).setImage(`attachment://${card.filename}`);
    await interaction.reply({ embeds: [embed], files: [file] });
  } else if (sub === 'reboot') {
    await requireAdmin(interaction);
    const theme = getGuildTheme(interaction.guildId);
    const now = Date.now();
    const customId = `admin:reboot:confirm:${interaction.user.id}:${now}`;
    const card = await generateCard({ layout: 'Notice', theme, payload: { title: 'Confirm Reboot', message: '⚠️ This will restart the bot for all servers. Press confirm within 10 seconds.' } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    const embed = themedEmbed(theme, 'Reboot', 'Confirm to restart').setImage(`attachment://${card.filename}`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(customId).setStyle(ButtonStyle.Danger).setLabel('Confirm Reboot'),
    );
    await respondOnce(interaction, () => ({ embeds: [embed], files: [file], components: [row] }));
  }
  else if (sub === 'sync-commands') {
    await requireAdmin(interaction);
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
    if (!appId) {
      await interaction.reply({ ephemeral: true, content: "Cannot sync commands: APP_ID missing. Set APP_ID or DISCORD_APP_ID (or CLIENT_ID)." }).catch(() => { });
      return;
    }
    await interaction.deferReply({ ephemeral: true }).catch(() => { });
    try {
      const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
      const result = await syncAll(rest, interaction.client, log);
      const purgedLine = result.purged.map(p => `${p.guildId}(${p.count})`).join(", ") || "none";
      await interaction.editReply({
        content: [
          "command sync complete",
          `global: ${result.globalCount}`,
          `purged per-guild: ${purgedLine}`
        ].join("\n")
      });
    } catch (e: any) {
      log.error("admin_sync_error", "register", { err: String(e) });
      await interaction.editReply("Sync failed (ERR-REGISTRAR).").catch(() => { });
    }
  }
  else if (sub === 'appinfo') {
    await requireAdmin(interaction);
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID || "(unset)";
    const globals = await listGlobal(rest);
    const head = globals.slice(0, 10).map(c => `• ${c.name} (${c.id})`).join("\n") || "(none)";
    await interaction.reply({
      ephemeral: true,
      content: [
        "**App Info**",
        `appId: ${appId}`,
        `global commands: ${globals.length}`,
        head
      ].join("\n")
    });
  }
  else if (sub === 'list-commands') {
    await requireAdmin(interaction);
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
    const gid = interaction.guildId!;
    const globals = await listGlobal(rest);
    const guilds = await listGuild(rest, gid);
    await interaction.reply({
      ephemeral: true,
      content: [
        "**Command Inventory**",
        `global: ${globals.length}`,
        `guild(${gid}): ${guilds.length}`,
        "",
        "guild-scoped:",
        ...(guilds.length ? guilds.map(x => `• ${x.name} (${x.id})`) : ["(none)"])
      ].join("\n")
    });
  }
  else if (sub === 'force-purge') {
    await requireAdmin(interaction);
    await interaction.deferReply({ ephemeral: true }).catch(() => { });
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID!;
    const purged: string[] = [];
    for (const [gid] of interaction.client.guilds.cache) {
      const c = await purgeGuildCommands(rest, appId, gid);
      purged.push(`${gid}(${c})`);
    }
    await interaction.editReply({
      content: ["purge complete", `guilds: ${purged.join(", ") || "none"}`].join("\n")
    });
  }
  // Admin economy controls
  else if (sub === 'take') {
    await requireAdmin(interaction);
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (amount <= 0) { await interaction.reply({ content: 'Amount must be positive.' }); return; }
    const { getBalance, adjustBalance } = await import('../../economy/wallet.js');
    const current = getBalance(interaction.guildId!, user.id);
    const delta = -Math.min(amount, current);
    // ensure user exists even if current=0
    const { getUserMeta } = await import('../../util/userMeta.js');
    await getUserMeta(interaction.client, interaction.guildId!, user.id);
    const newBal = await adjustBalance(interaction.guildId!, user.id, delta, 'admin:take');
    const actualTaken = -delta;
    const theme = getGuildTheme(interaction.guildId);
    const embed = themedEmbed(theme, 'Funds Removed', `${user.tag} -${actualTaken}`).setDescription(`New balance: ${newBal}`);
    console.log(JSON.stringify({ msg: 'admin_action', action: 'take', target: user.id, amount: actualTaken, admin: interaction.user.id }));
    await interaction.reply({ embeds: [embed] });
  }
  else if (sub === 'reset') {
    await requireAdmin(interaction);
    const user = interaction.options.getUser('user', true);
    const db = getGuildDb(interaction.guildId!);
    const now = Date.now();
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(user.id) as { balance?: number } | undefined;
      const cur = row?.balance ?? 0;
      // set balance to 0
      db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET balance=0, updated_at=excluded.updated_at').run(user.id, now);
      if (cur !== 0) db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?,?,?,?)').run(user.id, -cur, 'admin:reset', now);
      // no dedicated wins/losses columns; leave game history intact
    });
    tx();
    const theme = getGuildTheme(interaction.guildId);
    const embed = themedEmbed(theme, 'Account Reset', `${user.tag} reset to 0 balance`);
    console.log(JSON.stringify({ msg: 'admin_action', action: 'reset', target: user.id, amount: 0, admin: interaction.user.id }));
    await interaction.reply({ embeds: [embed] });
  }
  else if (sub === 'refresh-status') {
    await requireAdmin(interaction);
    await interaction.deferReply({ ephemeral: true }).catch(() => { });
    await updateBotPresence(interaction.client, console);
    await interaction.editReply({ content: "Status refreshed." }).catch(() => { });
  }
}

export async function handleButton(interaction: ButtonInteraction) {
  const [prefix, action, key, uid, ts] = interaction.customId.split(':');
  if (prefix !== 'admin' || action !== 'reboot' || key !== 'confirm') return;
  if (interaction.user.id !== uid) {
    await interaction.reply({ content: 'This button is not for you.' });
    return;
  }
  // cooldowns
  const now = Date.now();
  const gKey = `g:${interaction.guildId ?? 'dm'}`;
  const uKey = `u:${interaction.user.id}`;
  (global as any).__rebootCooldowns = (global as any).__rebootCooldowns || new Map<string, number>();
  const map: Map<string, number> = (global as any).__rebootCooldowns;
  if (map.get(gKey) && now - (map.get(gKey) as number) < 60_000) {
    await interaction.reply({ content: 'Reboot recently initiated in this server. Please wait.' });
    return;
  }
  if (map.get(uKey) && now - (map.get(uKey) as number) < 5_000) {
    await interaction.reply({ content: 'Please wait a few seconds before confirming again.' });
    return;
  }
  const pressedAt = Date.now();
  const createdAt = parseInt(ts, 10);
  if (!Number.isFinite(createdAt) || pressedAt - createdAt > 10_000) {
    await interaction.reply({ content: 'Reboot confirmation expired. Please try again.' });
    return;
  }
  // Double-check admin rights at confirm time
  await requireAdmin(interaction);

  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ ephemeral: true, content: "Reboot requested. Shutting down..." });
    } else {
      await interaction.editReply?.({ content: "Reboot requested. Shutting down..." }).catch(() => { });
    }
  } catch { }
  map.set(gKey, now);
  map.set(uKey, now);
  // give Discord a moment to flush the reply
  setTimeout(() => {
    try { log.info("admin_reboot_exit"); } catch { }
    process.exit(0);
  }, 500);
}
