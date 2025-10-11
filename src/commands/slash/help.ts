import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { enabledHelpDocs, getDocByName, getDocsByCategory } from "../../help/registry.js";
import { chunkLines } from "../../ui/paginate.js";
import { themedEmbed as themed, categoryEmoji } from "../../ui/embeds.js";
import { getGuildDb } from "../../db/connection.js";
import { isAdmin as hasAdmin, isSuperAdmin as hasSuper } from "../../admin/permissions.js";
import { send } from "../../ui/reply.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Help categories and detailed docs")
  .addSubcommand((s) =>
    s
      .setName("category")
      .setDescription("Show a help category")
      .addStringOption((o) =>
        o
          .setName("name")
          .setDescription("Category")
          .setRequired(true)
          .addChoices(
            { name: 'economy', value: 'economy' },
            { name: 'loans', value: 'loans' },
            { name: 'games', value: 'games' },
            { name: 'config', value: 'config' },
            { name: 'admin', value: 'admin' },
          )
      )
  )
  .addSubcommand((s) =>
    s
      .setName("command")
      .setDescription("Detailed help for a command")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Command name")
          .setAutocomplete(true)
          .setRequired(true)
      )
  );

function isAdminView(i: ChatInputCommandInteraction | AutocompleteInteraction): boolean {
  const uid = (i as any).user?.id as string | undefined;
  const gid = (i as any).guildId as string | undefined;
  if (!uid || !gid) return false;
  try {
    const db = getGuildDb(gid);
    return hasSuper(db, uid) || hasAdmin(db, uid);
  } catch { return false; }
}

const ADMIN_COMMANDS = new Set([
  'admin', 'admin-repair', 'admin-reboot', 'dev', 'dev-demo', 'rank-admin', 'canary'
]);

export async function autocomplete(interaction: AutocompleteInteraction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const isAdmin = isAdminView(interaction);
  const docs = enabledHelpDocs().filter((d) => isAdmin || !ADMIN_COMMANDS.has(d.name));

  const choices = docs
    .map((d) => ({
      name: d.title ? `${d.name} — ${d.title}` : d.name,
      value: d.name,
    }))
    .filter((c) => !focused || c.name.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(choices).catch(() => {});
}

function renderCategory(i: ChatInputCommandInteraction, category: 'economy' | 'loans' | 'games' | 'admin' | 'config') {
  const docs = getDocsByCategory(category);
  const isAdmin = isAdminView(i);
  const emoji = categoryEmoji(category);

  // Hide admin-only commands from non-admins
  const rows = docs
    .filter((d) => isAdmin || !ADMIN_COMMANDS.has(d.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => `\`${`/${d.name}`}\` — ${d.title ?? d.desc}`);

  const divider = '───';
  const desc = [
    `Use \`/help command name:<command>\` for detailed help on any command.`,
    divider,
    rows.join('\n') || '*No commands available.*',
  ].join('\n');

  const emb = themed('info', `${emoji} ${category.charAt(0).toUpperCase() + category.slice(1)} Commands`, desc, undefined, { guildName: i.guild?.name, user: i.user });
  return emb;
}

function renderOverview(i: ChatInputCommandInteraction) {
  const guildName = i.guild?.name;
  const desc = [
    'Use `/help command name:<command>` for detailed help on any command.',
    'Select a category:',
    '───',
    `${categoryEmoji('economy')} Economy`,
    `${categoryEmoji('loans')} Loans`,
    `${categoryEmoji('games')} Games`,
    `${categoryEmoji('config')} Config`,
    `${categoryEmoji('admin')} Admin`,
  ].join('\n');
  return themed('info', `${categoryEmoji('help')} Help`, desc, undefined, { guildName, user: i.user });
}

export async function run(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand(false);
  const guildName = interaction.guild?.name;

  if (!sub) {
    const emb = renderOverview(interaction);
    await send(interaction, { embeds: [emb] });
    return;
  }

  if (sub === 'command') {
    const name = interaction.options.getString('name', true);
    const doc = getDocByName(name);
    const isAdmin = isAdminView(interaction);
    if (!doc || (!isAdmin && ADMIN_COMMANDS.has(doc.name))) {
      await send(interaction, { content: `No help found for \`${name}\`.`, ephemeral: true });
      return;
    }

    // Hide admin-only usage lines for non-admins when a mixed doc is shown
    const hideAdminLines = !isAdmin;
    const usage = (doc.usage || []).filter(u => !hideAdminLines || !/\(admin\)/i.test(u));
    const examples = (doc.examples || []).filter(u => !hideAdminLines || !/\(admin\)/i.test(u));
    const fields = [
      { name: 'Usage', value: usage.map((u) => `\`${u}\``).join('\n') || '*n/a*', inline: false },
    ];
    if (examples.length) fields.push({ name: 'Examples', value: examples.map((e) => `\`${e}\``).join('\n'), inline: false });
    if (doc.permissions?.length && isAdmin) fields.push({ name: 'Permissions', value: doc.permissions.map((p) => `• ${p}`).join('\n'), inline: false });
    const emoji = categoryEmoji((doc.category as any) || 'misc');
    const emb = themed('info', `${emoji} /${doc.name}${doc.title ? ` — ${doc.title}` : ''}`, doc.desc, fields, { guildName, user: interaction.user });
    await send(interaction, { embeds: [emb] });
    return;
  }

  // Category subcommand
  if (sub === 'category') {
    const cat = interaction.options.getString('name', true) as 'economy' | 'loans' | 'games' | 'admin' | 'config';
    const emb = renderCategory(interaction, cat);
    await send(interaction, { embeds: [emb] });
    return;
  }
}
