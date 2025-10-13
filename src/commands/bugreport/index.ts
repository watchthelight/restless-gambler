/**
 * /bugreport command - production-ready bug reporting system
 *
 * Features:
 * - Public confirmation embed cards (never ephemeral)
 * - Autocomplete for command field (last executed command first, then all commands)
 * - SQLite persistence (best-effort, doesn't block UX on failure)
 * - DM delivery to all SUPER admins with prettified embed + jump link
 * - Optional public pings via BUG_TRIAGE_ROLE_ID / BUG_TRIAGE_CHANNEL_ID
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  EmbedBuilder,
  AttachmentBuilder,
} from 'discord.js';
import { nanoid } from 'nanoid';
import { sanitize } from '../../core/sanitize.js';
import { dmSupersWithBug, type BugReportDM } from '../../core/superAdmins.js';
import * as bugReportStore from '../../db/bugReportStore.js';
import { flattenCommands } from '../../core/commandRegistry.js';
import { getUserLastCommand } from '../../interactions/router.js';

export const data = new SlashCommandBuilder()
  .setName('bugreport')
  .setDescription('Report a bug you just hit')
  .addStringOption((o) =>
    o
      .setName('command')
      .setDescription('Which command had the bug?')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName('expected')
      .setDescription('What did you expect to happen? (max 1024 chars)')
      .setRequired(true)
      .setMaxLength(1024)
  )
  .addStringOption((o) =>
    o
      .setName('actual')
      .setDescription('What actually happened? (max 1024 chars)')
      .setRequired(true)
      .setMaxLength(1024)
  )
  .addAttachmentOption((o) =>
    o
      .setName('attachment')
      .setDescription('Screenshot or file (optional)')
      .setRequired(false)
  );

/**
 * Autocomplete handler for the command field.
 * Returns user's last executed command first, then all registered commands.
 */
export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused(true);
  if (focused.name !== 'command') return;

  const query = (focused.value || '').toLowerCase();
  const suggestions: Array<{ name: string; value: string }> = [];

  // 1. User's last executed command (if present)
  const lastCmd = getUserLastCommand(interaction.user.id);
  if (lastCmd && lastCmd.toLowerCase().includes(query)) {
    suggestions.push({ name: `⭐ ${lastCmd} (your last command)`, value: lastCmd });
  }

  // 2. All registered commands (flattened)
  const allCommands = flattenCommands(interaction.client);

  // Debug logging (can be removed after verification)
  if (allCommands.length === 0) {
    console.warn('[bugreport] autocomplete: No commands found in registry');
  } else {
    console.debug(`[bugreport] autocomplete: Found ${allCommands.length} commands, query="${query}"`);
  }

  for (const cmd of allCommands) {
    if (cmd.toLowerCase().includes(query)) {
      // Avoid duplicate if already added as last command
      if (cmd !== lastCmd) {
        suggestions.push({ name: cmd, value: cmd });
      }
    }
  }

  // 3. Fallback if no matches
  if (suggestions.length === 0) {
    suggestions.push({ name: 'No match', value: 'unknown' });
  }

  // Limit to 25 (Discord max)
  await interaction.respond(suggestions.slice(0, 25)).catch(() => {});
}

/**
 * Execute handler for /bugreport
 */
export async function execute(interaction: ChatInputCommandInteraction) {
  // ALWAYS public (never ephemeral)
  await interaction.deferReply({ ephemeral: false });

  const command = interaction.options.getString('command', true);
  const expected = interaction.options.getString('expected', true);
  const actual = interaction.options.getString('actual', true);
  const attachment = interaction.options.getAttachment('attachment', false);

  // Sanitize user input
  const sanitizedCmd = sanitize(command);
  const sanitizedExpected = sanitize(expected);
  const sanitizedActual = sanitize(actual);

  // Generate bug ID
  const bugId = `bug_${nanoid(8)}`;

  // Build public confirmation embed
  const confirmEmbed = new EmbedBuilder()
    .setTitle('🐞 Bug Report')
    .setDescription(`**Command:** \`${sanitizedCmd}\``)
    .addFields(
      { name: 'Expected', value: sanitizedExpected || '_none_', inline: false },
      { name: 'Actual', value: sanitizedActual || '_none_', inline: false },
      { name: 'Reporter', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'ID', value: bugId, inline: true }
    )
    .setColor(0xff5555) // visible red
    .setTimestamp(new Date());

  // Add image if attachment is image-like
  if (attachment && attachment.contentType?.startsWith('image/')) {
    confirmEmbed.setImage(attachment.url);
  }

  // Persist to DB (best-effort, don't break UX on failure)
  const report: bugReportStore.BugReport = {
    id: bugId,
    guildId: interaction.guildId!,
    channelId: interaction.channelId,
    userId: interaction.user.id,
    command: sanitizedCmd,
    expected: sanitizedExpected,
    actual: sanitizedActual,
    createdAt: Date.now(),
  };

  try {
    bugReportStore.create(report);
  } catch (e: any) {
    console.error('[bugreport] DB persist failed (continuing):', e?.message || e);
  }

  // Post public confirmation
  const msg = await interaction.editReply({ embeds: [confirmEmbed] });

  // Update DB with message ID
  try {
    bugReportStore.setMessageId(bugId, msg.id);
  } catch (e: any) {
    console.error('[bugreport] setMessageId failed:', e?.message || e);
  }

  // DM SUPER admins (non-blocking)
  const jumpUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${msg.id}`;
  const dmReport: BugReportDM = {
    ...report,
    reporterTag: interaction.user.tag,
    guildName: interaction.guild?.name || 'Unknown Guild',
    channelName: (interaction.channel as any)?.name || 'unknown',
    messageId: msg.id,
    attachmentUrl: attachment?.url,
  };

  const dmEmbed = new EmbedBuilder()
    .setTitle('🐞 New Bug Report')
    .setColor(0xff5555)
    .setDescription(
      [
        `**Guild:** ${dmReport.guildName}`,
        `**Channel:** #${dmReport.channelName}`,
        `**Reporter:** ${dmReport.reporterTag} (<@${dmReport.userId}>)`,
        `**Command:** \`${dmReport.command.slice(0, 90)}\``,
        `[Jump to message](${jumpUrl})`,
      ]
        .filter(Boolean)
        .join('\n')
    )
    .addFields(
      { name: 'Expected', value: sanitize(dmReport.expected), inline: false },
      { name: 'Actual', value: sanitize(dmReport.actual), inline: false },
      { name: 'ID', value: dmReport.id, inline: true }
    )
    .setTimestamp(new Date());

  if (attachment && attachment.contentType?.startsWith('image/')) {
    dmEmbed.setImage(attachment.url);
  }

  let dmStats = { attempted: 0, succeeded: 0 };
  try {
    dmStats = await dmSupersWithBug(interaction.client, dmReport, dmEmbed);
    console.log(`[bugreport] DM stats: ${JSON.stringify(dmStats)}`);
  } catch (e: any) {
    console.error('[bugreport] DM failed:', e?.message || e);
  }

  // Optional: if all DMs failed, post a public warning
  if (dmStats.attempted > 0 && dmStats.succeeded === 0) {
    try {
      await interaction.followUp({
        content: "⚠️ Heads-up: couldn't DM any SUPER admins.",
        ephemeral: false,
      });
    } catch {}
  }

  // Optional: public triage pings (env-guarded)
  const triageRoleId = process.env.BUG_TRIAGE_ROLE_ID;
  if (triageRoleId) {
    try {
      await interaction.followUp({
        content: `<@&${triageRoleId}> new bug report: **${bugId}**`,
        ephemeral: false,
      });
    } catch (e: any) {
      console.error('[bugreport] triage role ping failed:', e?.message || e);
    }
  }

  const triageChannelId = process.env.BUG_TRIAGE_CHANNEL_ID;
  if (triageChannelId) {
    try {
      const triageChannel = await interaction.client.channels.fetch(triageChannelId).catch(() => null);
      if (triageChannel && 'send' in triageChannel) {
        await (triageChannel as any).send({ embeds: [confirmEmbed] });
      }
    } catch (e: any) {
      console.error('[bugreport] triage channel mirror failed:', e?.message || e);
    }
  }
}
