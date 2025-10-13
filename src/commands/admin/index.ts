import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, REST, MessageFlags } from 'discord.js';
import { spawn } from 'node:child_process';
import { requireAdmin, requireSuper } from '../../admin/guard.js';
import { makePublicAdmin } from '../util/adminBuilder.js';
import { ensureAttached as ensureAdminAttached, addGuildAdmin, getPerGuildAdmins, getSupers, isSuper as storeIsSuper, isGuildAdmin as storeIsGuildAdmin, promoteToSuper as storePromoteToSuper } from '../../admin/adminStore.js';
import { themedEmbed } from '../../ui/embeds.js';
import { safeReply } from '../../interactions/reply.js';
import { getGuildTheme } from '../../ui/theme.js';
import { generateCard, buildCommandSyncCard } from '../../ui/cardFactory.js';
import { getGuildDb, getGlobalAdminDb } from '../../db/connection.js';
import { restartProcess } from '../../util/restart.js';
import { respondOnce } from '../../util/interactions.js';
import { extractUserId, isValidSnowflake } from '../../util/discord.js';
import { ensureSuperAdminsSchema, superAdminInsertSQL } from '../../db/adminSchema.js';
import { syncAll, listGlobal, listGuild, purgeGuildCommands } from '../../registry/sync.js';
import { refreshPresence } from "../../status/presence.js";
import { runAdminAddNormal, runAdminAddSuper } from './add.js';
import { formatBolts } from '../../economy/currency.js';
import { setKV, uiExactMode, uiSigFigs } from '../../game/config.js';
import { renderAmountInline, componentsForExact } from '../../util/amountRender.js';
import { walletEmbed } from '../shared/walletView.js';
import { formatBalance, formatExact } from '../../util/formatBalance.js';
import { safeDefer } from '../../interactions/reply.js';
import { isTestEnv } from '../../util/env.js';
import log from '../../cli/logger.js';
import { listToggles, setToggle } from '../../config/toggles.js';
import { isRateLimited, getRateLimitReset } from '../../util/ratelimit.js';
import { auditLog, type AdminAuditEvent } from '../../util/audit.js';
import { setWhitelistMode, releaseWhitelist } from '../../db/commandControl.js';
import { jsonStringifySafeBigint } from '../../utils/json.js';
import { logInfo, logError } from '../../utils/logger.js';
import { getMaxAdminGrant } from '../../config/economy.js';
import { fmtCoins } from '../../lib/amount.js';
import { okCard } from '../../ui/cards.js';
import { replyCard } from '../../lib/replyCard.js';
import * as fs from 'node:fs';
import { setRebootMarker } from '../../admin/rebootMarker.js';

export async function performReboot(): Promise<void> {
  // In tests, DO NOT schedule timers or exit the process.
  if (isTestEnv()) return;
  try { fs.writeFileSync('.reboot.flag', '1'); } catch { }
  try { process.exit(0); } catch { }
}

export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin controls • v2')
)
  .addSubcommand((s) => s.setName('add').setDescription('Add ADMIN').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('promote').setDescription('Promote to SUPER').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('demote').setDescription('Demote to ADMIN').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('remove').setDescription('Remove guild admin').addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)))
  .addSubcommand((s) => s.setName('list').setDescription('List admins'))
  .addSubcommand((s) => s.setName('whoami').setDescription('Show your role'))
  .addSubcommand((s) =>
    s
      .setName('give')
      .setDescription('Admin: give currency to a user')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption((o) => o.setName('amount').setDescription('Amount to add (e.g., 2.5m, 1b, 750k)').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('take')
      .setDescription('Admin: take currency from a user (not below 0)')
      .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
      .addStringOption((o) => o.setName('amount').setDescription('Amount to subtract (e.g., 2.5m, 1b, 750k)').setRequired(true)),
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
  .addSubcommand((s) => s.setName('whitelist').setDescription('Temporarily allow only one command in this guild')
    .addStringOption(o => o.setName('command').setDescription('Command name').setRequired(true)))
  .addSubcommand((s) => s.setName('whitelist-release').setDescription('Release whitelist mode (restore normal)'))
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
        ss.setName("sigfigs")
          .setDescription("Compact significant figures (3..5)")
          .addIntegerOption(o => o.setName("n").setDescription("3..5").setRequired(true))));

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommandGroup(false) || interaction.options.getSubcommand(true);
  const subsub = interaction.options.getSubcommand(false);
  if (sub === 'add') {
    await requireSuper(interaction);
    const user = interaction.options.getUser('user', true);
    const db = getGuildDb(interaction.guildId!);
    const guildId = interaction.guildId!;
    ensureAdminAttached(db);
    if (storeIsGuildAdmin(db, guildId, user.id)) {
      return replyCard(interaction, {
        title: 'Admin unchanged',
        description: 'User is already a guild admin. To promote to SUPER admin, contact the developer.'
      });
    }
    addGuildAdmin(db, guildId, user.id);
    return replyCard(interaction, {
      title: 'Admin added',
      description: `Granted admin to <@${user.id}>`
    });
  }
  else if (sub === 'promote') {
    await requireSuper(interaction);
    const user = interaction.options.getUser('user', true);
    const db = getGuildDb(interaction.guildId!);
    ensureAdminAttached(db);
    storePromoteToSuper(db, user.id);
    return replyCard(interaction, { title: 'Admin promoted', description: `Promoted <@${user.id}> to SUPER.` });
  }
  else if (sub === 'demote') {
    await requireSuper(interaction);
    const user = interaction.options.getUser('user', true);
    const db = getGuildDb(interaction.guildId!);
    ensureAdminAttached(db);
    // Demote: remove from global super list
    db.prepare(`DELETE FROM admin.super_admins WHERE user_id = ?`).run(user.id);
    return replyCard(interaction, { title: 'Admin demoted', description: `Demoted <@${user.id}> from SUPER.` });
  }
  else if (sub === 'remove') {
    await requireSuper(interaction);
    const user = interaction.options.getUser('user', true);
    const db = getGuildDb(interaction.guildId!);
    const guildId = interaction.guildId!;
    ensureAdminAttached(db);
    const res = db.prepare(`DELETE FROM admin.guild_admins WHERE guild_id = ? AND user_id = ?`).run(guildId, user.id);
    const changed = Number(res?.changes || 0) > 0;
    await interaction.reply({ content: changed ? `Removed <@${user.id}> from guild admins.` : `No change; not a guild admin.` });
    return;
  }
  else if (sub === 'give') {
    await requireAdmin(interaction);

    // Rate limit check
    if (isRateLimited(interaction.user.id, 'admin:give')) {
      const resetMs = getRateLimitReset(interaction.user.id, 'admin:give');
      const resetSec = Math.ceil(resetMs / 1000);
      await interaction.reply({
        content: `Rate limit exceeded. Try again in ${resetSec} second${resetSec !== 1 ? 's' : ''}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const { getParsedAmount } = await import('../../interactions/options.js');
    const parsed = await getParsedAmount(interaction, 'amount');
    if (parsed.value <= 0n) { await interaction.reply({ content: 'Amount must be positive.' }); return; }

    // Clamp to per-guild max-admin-grant cap (default 1B)
    const cap = getMaxAdminGrant(interaction.guildId!);
    let requested = parsed.value;
    let clamped = false;
    if (requested > cap) { requested = cap; clamped = true; }

    // Audit log
    auditLog({
      action: 'admin_give',
      adminUserId: interaction.user.id,
      targetUserId: user.id,
      amount: Number(requested),
      timestamp: Date.now(),
      guildId: interaction.guildId!,
    });

    const { getBalance, adjustBalance } = await import('../../economy/wallet.js');
    const current = getBalance(interaction.guildId!, user.id);
    // ensure user exists even if current=0
    const { getUserMeta } = await import('../../util/userMeta.js');
    await getUserMeta(interaction.client, interaction.guildId!, user.id);
    const newBal = await adjustBalance(interaction.guildId!, user.id, requested, 'admin:give');
    const pretty = formatBalance(newBal);
    const exact = formatExact(newBal);
    const embed = walletEmbed({ title: 'Funds Added', headline: `${user.tag} +${formatBolts(requested)}. New balance:`, pretty, exact });
    console.log(JSON.stringify({ msg: 'admin_action', action: 'give', target: user.id, amount: String(requested), admin: interaction.user.id, guildId: interaction.guildId }));
    const printable = newBal.toStringExact();
    logInfo('granted currency', {
      guild: { id: interaction.guildId!, name: interaction.guild?.name },
      channel: { id: interaction.channelId },
      user: { id: interaction.user.id, tag: interaction.user.tag },
      command: 'admin',
      sub: 'give'
    }, { targetUser: user.id, amount: String(requested), newBalance: printable, clamped, cap: String(cap) });
    // Acknowledge + respond safely regardless of prior defer/reply state
    const embeds = [embed] as any[];
    if (clamped) {
      const warn = okCard({ title: '⚠️ Grant Capped', description: `Amount clamped to maximum grant of **${formatBalance(cap)}**` });
      embeds.unshift(warn);
    }
    await safeReply(interaction as any, { embeds, components: [] } as any);
  }
  else if (sub === 'whitelist') {
    await requireAdmin(interaction);
    const cmd = interaction.options.getString('command', true).toLowerCase();
    const snapshot: string[] = (interaction.client as any)?.commands ? [...(interaction.client as any).commands.keys()] : [];
    setWhitelistMode(getGuildDb(interaction.guildId!), interaction.guildId!, [cmd], snapshot);
    const audit = { msg: 'admin_whitelist', guildId: interaction.guildId, admin: interaction.user.id, allow: cmd, snapshot };
    const adb = getGlobalAdminDb();
    adb.prepare('INSERT INTO admin_audit(actor_uid, action, target_uid, details, created_at) VALUES(?,?,?,?,?)')
      .run(interaction.user.id, 'admin_whitelist', interaction.guildId!, jsonStringifySafeBigint(audit), Date.now());
    return interaction.reply({ content: `Whitelist mode active for \`${cmd}\`. All other commands are blocked.`, flags: MessageFlags.Ephemeral });
  }
  else if (sub === 'whitelist-release') {
    await requireAdmin(interaction);
    releaseWhitelist(getGuildDb(interaction.guildId!), interaction.guildId!);
    const audit = { msg: 'admin_whitelist_release', guildId: interaction.guildId, admin: interaction.user.id };
    const adb = getGlobalAdminDb();
    adb.prepare('INSERT INTO admin_audit(actor_uid, action, target_uid, details, created_at) VALUES(?,?,?,?,?)')
      .run(interaction.user.id, 'admin_whitelist_release', interaction.guildId!, jsonStringifySafeBigint(audit), Date.now());
    return interaction.reply({ content: 'Whitelist mode released. Normal operation restored.', flags: MessageFlags.Ephemeral });
  }
  else if (sub === 'super-add') {
    return runAdminAddSuper(interaction, { adminDb: getGlobalAdminDb(), guildDb: getGuildDb(interaction.guildId!), log });
  }
  else if (sub === 'super-remove') {
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
      auditLog({ action: 'admin_remove', adminUserId: interaction.user.id, targetUserId: userId, timestamp: Date.now(), guildId: interaction.guildId! });
      const theme = getGuildTheme(interaction.guildId);
      const embed = themedEmbed(theme, 'Super Admin Removed', `<@${userId}>`);
      await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    } catch (e: any) {
      console.error('admin_remove_error', e?.message || e, userId);
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Failed to remove super admin (ERR-ADMIN-REMOVE).' }).catch(() => { });
    }
  } else if (sub === 'list') {
    const db = getGuildDb(interaction.guildId!);
    ensureAdminAttached(db);
    const supers = getSupers(db).map(r => r.user_id).filter(id => isValidSnowflake(id));
    const adminsRaw = getPerGuildAdmins(db, interaction.guildId!).map(r => r.user_id).filter(id => isValidSnowflake(id));
    const admins = adminsRaw.filter(id => !supers.includes(id));
    return replyCard(interaction, {
      title: 'Admin Roster',
      fields: [
        { name: 'SUPER Admins', value: supers.length ? supers.map(id => `• <@${id}>`).join('\n') : '_none_' },
        { name: 'Guild Admins', value: admins.length ? admins.map(id => `• <@${id}>`).join('\n') : '_none_' }
      ]
    });
  } else if (sub === 'whoami') {
    const db = getGuildDb(interaction.guildId!);
    ensureAdminAttached(db);
    const role = storeIsSuper(db, interaction.user.id)
      ? 'super'
      : (storeIsGuildAdmin(db, interaction.guildId!, interaction.user.id) ? 'admin' : 'user');
    return replyCard(interaction, {
      title: 'Admin · Who Am I',
      description: `Invoker: <@${interaction.user.id}>\nRole: ${role}`
    });
  } else if (sub === 'reboot') {
    // Reboot subcommand removed - use /admin-reboot instead
    await requireAdmin(interaction);
    return replyCard(interaction, {
      title: 'Command Moved',
      description: 'The `/admin reboot` subcommand has been removed.\n\nPlease use `/admin-reboot` instead.'
    });
  }
  else if (sub === 'sync-commands') {
    await requireAdmin(interaction);
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
    if (!appId) {
      await replyCard(interaction, { title: 'Command Sync', description: 'Cannot sync commands: APP_ID missing. Set APP_ID or DISCORD_APP_ID (or CLIENT_ID).' });
      return;
    }
    await interaction.deferReply({ ephemeral: false }).catch(() => { });
    try {
      const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
      const result = await syncAll(rest, interaction.client, log);
      const created = Number(result?.globalCount || 0);
      const deleted = Number((result?.purged || []).reduce((a, b) => a + (b?.count || 0), 0) + (result?.purgedDisabled || 0) + (result?.purgedLegacyGlobal || 0));
      await replyCard(interaction, {
        title: 'Commands Synced',
        description: `Created: **${created}**, Updated: **0**, Deleted: **${deleted}**`
      });
    } catch (e: any) {
      log.error("admin_sync_error", "register", { err: String(e) });
      await replyCard(interaction, { title: 'Command Sync', description: 'Sync failed (ERR-REGISTRAR).' });
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

    // Rate limit check
    if (isRateLimited(interaction.user.id, 'admin:take')) {
      const resetMs = getRateLimitReset(interaction.user.id, 'admin:take');
      const resetSec = Math.ceil(resetMs / 1000);
      await interaction.reply({
        content: `Rate limit exceeded. Try again in ${resetSec} second${resetSec !== 1 ? 's' : ''}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const { getParsedAmount } = await import('../../interactions/options.js');
    const parsed = await getParsedAmount(interaction, 'amount');
    let amount = parsed.value;
    if (amount <= 0n) { await interaction.reply({ content: 'Amount must be positive.' }); return; }

    // Clamp to max grant amount
    const MAX_GRANT = BigInt(process.env.ADMIN_MAX_GRANT || '1000000000');
    if (amount > MAX_GRANT) {
      amount = MAX_GRANT;
      await interaction.reply({
        content: `Amount clamped to maximum of ${formatBolts(MAX_GRANT)}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const { getBalance, adjustBalance } = await import('../../economy/wallet.js');
    const current = getBalance(interaction.guildId!, user.id);
    const want = amount;
    const { HugeDecimal } = await import('../../lib/num/index.js');
    const take = current.lt(HugeDecimal.fromBigInt(want)) ? current : HugeDecimal.fromBigInt(want);
    const delta = -Number(take);
    const actualTaken = Number(take);

    // Audit log
    auditLog({
      action: 'admin_take',
      adminUserId: interaction.user.id,
      targetUserId: user.id,
      amount: actualTaken,
      timestamp: Date.now(),
      guildId: interaction.guildId!,
    });

    // ensure user exists even if current=0
    const { getUserMeta } = await import('../../util/userMeta.js');
    await getUserMeta(interaction.client, interaction.guildId!, user.id);
    const newBal = await adjustBalance(interaction.guildId!, user.id, -take, 'admin:take');
    await safeDefer(interaction);
    const pretty = formatBalance(newBal);
    const exact = formatExact(newBal);
    const takenText = formatBolts(actualTaken);
    const embed = walletEmbed({ title: 'Funds Removed', headline: `${user.tag} -${takenText}. New balance:`, pretty, exact });
    console.log(JSON.stringify({ msg: 'admin_action', action: 'take', target: user.id, amount: actualTaken, admin: interaction.user.id, guildId: interaction.guildId }));
    await interaction.editReply({ embeds: [embed], components: [] });
  }
  else if (sub === 'toggles') {
    await requireAdmin(interaction);
    const action = interaction.options.getString('action', true);
    const cmd = interaction.options.getString('command')?.trim();
    const why = interaction.options.getString('reason') ?? undefined;
    if (action === 'view') {
      const rows = listToggles();
      const lines = rows.length
        ? rows.map((r) => `• /${r.name} — ${r.enabled ? 'enabled' : 'disabled'}${r.reason ? ` — ${r.reason}` : ''}`).join('\n')
        : '(none set, all enabled)';
      return replyCard(interaction, { title: 'Command Toggles', description: lines });
    }
    if (!cmd) return replyCard(interaction, { title: 'Toggles', description: 'Provide a command name.' });
    if (action === 'enable') {
      setToggle(cmd, true);
      return replyCard(interaction, { title: 'Toggles Updated', description: `Enabled /${cmd}.` });
    }
    if (action === 'disable') {
      setToggle(cmd, false, why);
      return replyCard(interaction, { title: 'Toggles Updated', description: `Disabled /${cmd}${why ? ` — ${why}` : ''}.` });
    }
    return replyCard(interaction, { title: 'Toggles', description: 'Unknown action.' });
  }
  else if (sub === 'reset') {
    await requireAdmin(interaction);

    // Rate limit check
    if (isRateLimited(interaction.user.id, 'admin:reset')) {
      const resetMs = getRateLimitReset(interaction.user.id, 'admin:reset');
      const resetSec = Math.ceil(resetMs / 1000);
      await interaction.reply({
        content: `Rate limit exceeded. Try again in ${resetSec} second${resetSec !== 1 ? 's' : ''}.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const user = interaction.options.getUser('user', true);

    // Audit log
    auditLog({
      action: 'admin_reset',
      adminUserId: interaction.user.id,
      targetUserId: user.id,
      amount: 0,
      timestamp: Date.now(),
      guildId: interaction.guildId!,
    });

    const db = getGuildDb(interaction.guildId!);
    const now = Date.now();
    const tx = db.transaction(() => {
      const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(user.id) as { balance?: number | string | bigint } | undefined;
      const cur = row?.balance != null ? (typeof row.balance === 'bigint' ? row.balance : BigInt(Math.trunc(Number(row.balance)))) : 0n;
      // set balance to 0 (TEXT)
      db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance, updated_at=excluded.updated_at').run(user.id, '0', now);
      if (cur !== 0n) db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?,?,?,?)').run(user.id, Number(-cur), 'admin:reset', now);
      // no dedicated wins/losses columns; leave game history intact
    });
    tx();
    await safeDefer(interaction);
    const pretty = formatBalance(0);
    const exact = formatExact(0);
    const embed = walletEmbed({ title: 'Account Reset', headline: `${user.tag} reset. New balance:`, pretty, exact });
    console.log(JSON.stringify({ msg: 'admin_action', action: 'reset', target: user.id, amount: 0, admin: interaction.user.id, guildId: interaction.guildId }));
    await interaction.editReply({ embeds: [embed], components: [] });
  }
  else if (sub === 'refresh-status') {
    await requireAdmin(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => { });
    await refreshPresence(interaction.client as any);
    await interaction.editReply({ content: "Status refreshed." }).catch(() => { });
  }
  else if (sub === 'ui') {
    await requireAdmin(interaction);
    const ctx = { guildDb: getGuildDb(interaction.guildId!) };
    if (subsub === 'sigfigs') {
      const n = interaction.options.getInteger("n", true);
      setKV(ctx.guildDb, "ui.compact_sigfigs", String(n));
      return replyCard(interaction, { title: 'UI · Sig Figs', description: `Sig figs set to ${n}.` });
    }
  }
}

export async function handleButton(_interaction: ButtonInteraction) {
  // No-op: reboot confirmation button removed.
}
