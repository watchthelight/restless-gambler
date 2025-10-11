import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, REST, MessageFlags } from 'discord.js';
import { spawn } from 'node:child_process';
import { addGuildAdmin, audit, isSuperAdmin, removeGuildAdmin, requireAdmin, requireSuper } from '../../admin/roles.js';
import { themedEmbed } from '../../ui/embeds.js';
import { safeReply } from '../../interactions/reply.js';
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
import { formatBolts } from '../../economy/currency.js';
import { setKV, uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline, componentsForExact } from '../../util/amountRender.js';
import { walletEmbed } from '../shared/walletView.js';
import { formatBalance, formatExact } from '../../util/formatBalance.js';
import { safeDefer } from '../../interactions/reply.js';
import { isTestEnv } from '../../util/env.js';
import log from '../../cli/logger.js';
import { adminListEmbed } from './view.js';
import { listToggles, setToggle } from '../../config/toggles.js';

export async function performReboot(): Promise<void> {
  // In tests, DO NOT schedule timers or exit the process.
  if (isTestEnv()) return;

  // Platform-specific restart
  if (process.platform === 'win32') {
    // Windows: use detached batch script
    const scriptPath = 'scripts\\restart.bat';
    spawn('cmd', ['/c', scriptPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref();
  } else {
    // POSIX: simple pkill and restart
    spawn('sh', ['-c', 'pkill -f "dist/index.js"; nohup node dist/index.js >/dev/null 2>&1 &'], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }

  // Defer exit slightly so Discord can flush replies
  setTimeout(() => {
    try { process.exit(0); } catch { }
  }, 300);
}

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin controls')
  .addSubcommand((s) => s.setName('add').setDescription('Add admin for this guild').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('super-add').setDescription('Add super admin (SUPER only)').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Remove admin (SUPER only)').addStringOption((o) => o.setName('user').setDescription('User ID or mention').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('Show the super admin and current admins (visible to all)'))
  .addSubcommand((s) => s.setName('whoami').setDescription('Show your role'))
  .addSubcommand((s) => s.setName('reboot').setDescription('Reboot the bot (Admin+)'))
  .addSubcommand((s) =>
    s
      .setName('give')
      .setDescription('Admin: give currency to a user')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount to add').setRequired(true).setMinValue(1)),
  )
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
      .setDescription('Recompute counts and update the bot presence'))
  .addSubcommand((s) =>
    s
      .setName('toggles')
      .setDescription('View or flip command toggles')
      .addStringOption((o) =>
        o
          .setName('action')
          .setDescription('view | enable | disable')
          .setRequired(true)
          .addChoices({ name: 'view', value: 'view' }, { name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }),
      )
      .addStringOption((o) =>
        o
          .setName('command')
          .setDescription('command name (for enable/disable)')
          .setAutocomplete(true)
      )
      .addStringOption((o) => o.setName('reason').setDescription('optional reason when disabling')),
  )
  .addSubcommandGroup(group =>
    group.setName("ui")
      .setDescription("UI preferences")
      .addSubcommand(ss =>
        ss.setName("exact-mode")
          .setDescription("How to show precise amounts")
          .addStringOption(o => o.setName("mode").setDescription("off | inline | on_click").setRequired(true)
            .addChoices(
              { name: "off", value: "off" },
              { name: "inline", value: "inline" },
              { name: "on_click", value: "on_click" }))
          .addStringOption(o => o.setName("scope").setDescription("guild | user").addChoices(
            { name: "guild", value: "guild" }, { name: "user", value: "user" }))
          .addUserOption(o => o.setName("user").setDescription("Only if scope=user")))
      .addSubcommand(ss =>
        ss.setName("sigfigs")
          .setDescription("Compact significant figures (3..5)")
          .addIntegerOption(o => o.setName("n").setDescription("3..5").setRequired(true))));

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommandGroup(false) || interaction.options.getSubcommand(true);
  const subsub = interaction.options.getSubcommand(false);
  if (sub === 'add') {
    await requireAdmin(interaction);
    return runAdminAddNormal(interaction, { adminDb: getGlobalAdminDb(), guildDb: getGuildDb(interaction.guildId!), log });
  }
  else if (sub === 'give') {
    await requireAdmin(interaction);
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (amount <= 0) { await interaction.reply({ content: 'Amount must be positive.' }); return; }
    const { getBalance, adjustBalance } = await import('../../economy/wallet.js');
    const current = getBalance(interaction.guildId!, user.id);
    // ensure user exists even if current=0
    const { getUserMeta } = await import('../../util/userMeta.js');
    await getUserMeta(interaction.client, interaction.guildId!, user.id);
    const newBal = await adjustBalance(interaction.guildId!, user.id, amount, 'admin:give');
    await safeDefer(interaction);
    const pretty = formatBalance(newBal);
    const exact = formatExact(newBal);
    const embed = walletEmbed({ title: 'Funds Added', headline: `${user.tag} +${formatBolts(amount)}. New balance:`, pretty, exact });
    console.log(JSON.stringify({ msg: 'admin_action', action: 'give', target: user.id, amount: amount, admin: interaction.user.id }));
    await interaction.editReply({ embeds: [embed], components: [] });
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
        flags: MessageFlags.Ephemeral,
        content: "Invalid user. Provide a Discord ID or mention (e.g. `<@123456789012345678>`).",
      }).catch(() => { });
      return;
    }
    if (userId === '697169405422862417') {
      const theme = getGuildTheme(interaction.guildId);
      const embed = themedEmbed(theme, 'Access Denied', 'Cannot remove Super Admin.');
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
      return;
    }
    try {
      const adminDb = getGlobalAdminDb();
      adminDb.prepare('DELETE FROM super_admins WHERE user_id = ?').run(userId);
      audit(interaction.user.id, 'admin_remove', userId);
      const theme = getGuildTheme(interaction.guildId);
      const embed = themedEmbed(theme, 'Super Admin Removed', `<@${userId}>`);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    } catch (e: any) {
      console.error('admin_remove_error', e?.message || e, userId);
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Failed to remove super admin (ERR-ADMIN-REMOVE).' }).catch(() => { });
    }
  } else if (sub === 'list') {
    // Public: visible to everyone. Use defer+edit to avoid duplicate reply.
    await safeDefer(interaction, { ephemeral: false });
    const adminDb = getGlobalAdminDb();
    const db = getGuildDb(interaction.guildId!);

    const superRow = adminDb.prepare(`
      SELECT user_id, COALESCE(created_at, added_at) AS created_at
      FROM super_admins
      ORDER BY COALESCE(created_at, added_at) DESC
      LIMIT 1
    `).get() as { user_id: string; created_at: number } | undefined;
    const superId = superRow?.user_id || '(none)';

    const rows = db.prepare(`
      SELECT user_id, added_at
      FROM guild_admins
      ORDER BY added_at DESC
    `).all() as { user_id: string; added_at: number }[];

    const admins = rows.map(r => ({ userId: r.user_id, addedAt: Number(r.added_at) * 1000 }));
    const resolveMention = (uid: string) => `<@${uid}>`;
    const embed = adminListEmbed({ superId, admins, resolveMention });
    await interaction.editReply({ embeds: [embed], components: [] });
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
    const embed = themedEmbed(theme, 'Confirm Reboot', '⚠️ This will restart the bot for all servers.\nPress confirm within 10 seconds.');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(customId).setStyle(ButtonStyle.Danger).setLabel('Confirm Reboot'),
    );
    await respondOnce(interaction, () => ({ flags: MessageFlags.Ephemeral, embeds: [embed], components: [row] }));
  }
  else if (sub === 'sync-commands') {
    await requireAdmin(interaction);
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
    if (!appId) {
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: "Cannot sync commands: APP_ID missing. Set APP_ID or DISCORD_APP_ID (or CLIENT_ID)." }).catch(() => { });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => { });
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
    const head = globals.slice(0, 10).map(c => `${c.name} (\`${c.id}\`)`).join("\n") || "(none)";
    const theme = getGuildTheme(interaction.guildId);
    const embed = themedEmbed(theme, 'App Info')
      .addFields(
        { name: 'App ID', value: `\`${appId}\``, inline: false },
        { name: 'Global Commands', value: `${globals.length}`, inline: false },
        { name: 'First 10 Commands', value: head, inline: false }
      );
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  }
  else if (sub === 'list-commands') {
    await requireAdmin(interaction);
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
    const gid = interaction.guildId!;
    const globals = await listGlobal(rest);
    const guilds = await listGuild(rest, gid);
    const guildScoped = guilds.length ? guilds.map(x => `• ${x.name} (\`${x.id}\`)`).join('\n') : "(none)";
    const theme = getGuildTheme(interaction.guildId);
    const embed = themedEmbed(theme, 'Command Inventory')
      .addFields(
        { name: 'Global', value: `${globals.length}`, inline: true },
        { name: `Guild (${gid})`, value: `${guilds.length}`, inline: true },
        { name: 'Guild-Scoped Commands', value: guildScoped, inline: false }
      );
    await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
  }
  else if (sub === 'force-purge') {
    await requireAdmin(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => { });
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID!;
    const purged: string[] = [];
    for (const [gid] of interaction.client.guilds.cache) {
      const c = await purgeGuildCommands(rest, appId, gid);
      purged.push(`${gid}(${c})`);
    }
    const theme = getGuildTheme(interaction.guildId);
    const embed = themedEmbed(theme, 'Purge Complete')
      .addFields({ name: 'Guilds', value: purged.join(', ') || 'none', inline: false });
    await interaction.editReply({ embeds: [embed] });
  }
  // Admin economy controls
  else if (sub === 'take') {
    await requireAdmin(interaction);
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (amount <= 0) { await interaction.reply({ content: 'Amount must be positive.' }); return; }
    const { getBalance, adjustBalance } = await import('../../economy/wallet.js');
    const current = getBalance(interaction.guildId!, user.id);
    const delta = -Math.min(amount, Number(current));
    // ensure user exists even if current=0
    const { getUserMeta } = await import('../../util/userMeta.js');
    await getUserMeta(interaction.client, interaction.guildId!, user.id);
    const newBal = await adjustBalance(interaction.guildId!, user.id, delta, 'admin:take');
    const actualTaken = -delta;
    await safeDefer(interaction);
    const pretty = formatBalance(newBal);
    const exact = formatExact(newBal);
    const takenText = formatBolts(actualTaken);
    const embed = walletEmbed({ title: 'Funds Removed', headline: `${user.tag} -${takenText}. New balance:`, pretty, exact });
    console.log(JSON.stringify({ msg: 'admin_action', action: 'take', target: user.id, amount: actualTaken, admin: interaction.user.id }));
    await interaction.editReply({ embeds: [embed], components: [] });
  }
  else if (sub === 'toggles') {
    await requireAdmin(interaction);
    const action = interaction.options.getString('action', true);
    const cmd = interaction.options.getString('command')?.trim();
    const why = interaction.options.getString('reason') ?? undefined;
    if (action === 'view') {
      const rows = listToggles();
      const theme = getGuildTheme(interaction.guildId);
      const lines = rows.length
        ? rows.map((r) => `• /${r.name} — ${r.enabled ? 'enabled' : 'disabled'}${r.reason ? ` — ${r.reason}` : ''}`).join('\n')
        : '(none set, all enabled)';
      const embed = themedEmbed(theme, 'Command Toggles', lines);
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    }
    if (!cmd) return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Provide a command name.' });
    if (action === 'enable') {
      setToggle(cmd, true);
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Enabled /${cmd}.` });
    }
    if (action === 'disable') {
      setToggle(cmd, false, why);
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Disabled /${cmd}${why ? ` — ${why}` : ''}.` });
    }
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unknown action.' });
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
    await safeDefer(interaction);
    const pretty = formatBalance(0);
    const exact = formatExact(0);
    const embed = walletEmbed({ title: 'Account Reset', headline: `${user.tag} reset. New balance:`, pretty, exact });
    console.log(JSON.stringify({ msg: 'admin_action', action: 'reset', target: user.id, amount: 0, admin: interaction.user.id }));
    await interaction.editReply({ embeds: [embed], components: [] });
  }
  else if (sub === 'refresh-status') {
    await requireAdmin(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => { });
    await updateBotPresence(interaction.client, console);
    await interaction.editReply({ content: "Status refreshed." }).catch(() => { });
  }
  else if (sub === 'ui') {
    await requireAdmin(interaction);
    const ctx = { guildDb: getGuildDb(interaction.guildId!) };
    if (subsub === 'exact-mode') {
      const mode = interaction.options.getString("mode", true) as any;
      const scope = (interaction.options.getString("scope") || "guild") as "guild" | "user";
      const user = interaction.options.getUser("user")?.id;
      const key = scope === "user" && user ? `ui.show_exact_mode.user.${user}` : "ui.show_exact_mode";
      setKV(ctx.guildDb, key, mode);
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Exact mode set to ${mode} (${scope}).` });
    }
    if (subsub === 'sigfigs') {
      const n = interaction.options.getInteger("n", true);
      setKV(ctx.guildDb, "ui.compact_sigfigs", String(n));
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Sig figs set to ${n}.` });
    }
  }
}

export async function handleButton(interaction: ButtonInteraction) {
  const [prefix, action, key, uid, ts] = interaction.customId.split(':');
  if (prefix !== 'admin' || action !== 'reboot' || key !== 'confirm') return;
  if (interaction.user.id !== uid) {
    await safeReply(interaction, { content: 'This button is not for you.', flags: MessageFlags.Ephemeral });
    return;
  }
  // cooldowns
  const now = Date.now();
  const gKey = `g:${interaction.guildId ?? 'dm'}`;
  const uKey = `u:${interaction.user.id}`;
  (global as any).__rebootCooldowns = (global as any).__rebootCooldowns || new Map<string, number>();
  const map: Map<string, number> = (global as any).__rebootCooldowns;
  if (map.get(gKey) && now - (map.get(gKey) as number) < 60_000) {
    await safeReply(interaction, { content: 'Reboot recently initiated in this server. Please wait.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (map.get(uKey) && now - (map.get(uKey) as number) < 5_000) {
    await safeReply(interaction, { content: 'Please wait a few seconds before confirming again.', flags: MessageFlags.Ephemeral });
    return;
  }
  const pressedAt = Date.now();
  const createdAt = parseInt(ts, 10);
  if (!Number.isFinite(createdAt) || pressedAt - createdAt > 10_000) {
    await safeReply(interaction, { content: 'Reboot confirmation expired. Please try again.', flags: MessageFlags.Ephemeral });
    return;
  }
  // Double-check admin rights at confirm time
  await requireAdmin(interaction);

  try {
    // Use deferUpdate to acknowledge button press without showing "interaction failed"
    await interaction.deferUpdate().catch(() => { });
    const theme = getGuildTheme(interaction.guildId);
    const embed = themedEmbed(theme, 'Reboot Requested', 'Shutting down...');
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => { });
  } catch { }
  map.set(gKey, now);
  map.set(uKey, now);
  await performReboot();
}
