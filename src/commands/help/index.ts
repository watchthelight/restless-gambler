/**
 * /help Command
 *
 * AmariBot-style help system with:
 * - /help list: List all visible commands grouped by category
 * - /help category: List commands in a specific category
 * - /help command: Show detailed help for a specific command
 * - Admin commands are hidden from non-admins
 * - Public by default, ephemeral toggle available
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  AutocompleteInteraction,
} from 'discord.js';
import { getCommandMeta, getVisibleCommands, getCommandsByCategory, type CommandMeta } from '../../registry/commandMeta.js';
import { getGuildDb } from '../../db/connection.js';
import { ensureAttached, isSuper as storeIsSuper, isGuildAdmin as storeIsGuildAdmin } from '../../admin/adminStore.js';
import { themedEmbed } from '../../ui/embeds.js';
import { getGuildTheme } from '../../ui/theme.js';
import { handleAutocomplete } from './autocomplete.js';

/**
 * Check if user is admin or super admin.
 */
function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  const uid = interaction.user.id;
  const gid = interaction.guildId;
  if (!uid || !gid) return false;

  try {
    const db = getGuildDb(gid);
    try {
      ensureAttached(db as any);
    } catch {
      // Ignore attach errors
    }
    return storeIsSuper(db as any, uid) || storeIsGuildAdmin(db as any, gid, uid);
  } catch {
    return false;
  }
}

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View command help and documentation')
  .addSubcommand(sub =>
    sub
      .setName('command')
      .setDescription('Show detailed help for a specific command')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('Command name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addBooleanOption(opt =>
        opt
          .setName('ephemeral')
          .setDescription('Show privately (default: false)')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('category')
      .setDescription('List commands in a category')
      .addStringOption(opt =>
        opt
          .setName('name')
          .setDescription('Category name')
          .setRequired(true)
          .addChoices(
            { name: 'General', value: 'General' },
            { name: 'Games', value: 'Games' },
            { name: 'Wallet', value: 'Wallet' },
            { name: 'Loans', value: 'Loans' },
            { name: 'Ranks', value: 'Ranks' },
            { name: 'Admin', value: 'Admin' },
            { name: 'Dev', value: 'Dev' }
          )
      )
      .addBooleanOption(opt =>
        opt
          .setName('ephemeral')
          .setDescription('Show privately (default: false)')
          .setRequired(false)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('List all available commands')
      .addBooleanOption(opt =>
        opt
          .setName('ephemeral')
          .setDescription('Show privately (default: false)')
          .setRequired(false)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;
  const userIsAdmin = isAdmin(interaction);
  const theme = getGuildTheme(interaction.guildId);

  if (subcommand === 'list') {
    await handleList(interaction, ephemeral, userIsAdmin, theme);
  } else if (subcommand === 'category') {
    await handleCategory(interaction, ephemeral, userIsAdmin, theme);
  } else if (subcommand === 'command') {
    await handleCommand(interaction, ephemeral, userIsAdmin, theme);
  }
}

/**
 * Handle /help list
 */
async function handleList(
  interaction: ChatInputCommandInteraction,
  ephemeral: boolean,
  isAdmin: boolean,
  theme: any
): Promise<void> {
  const grouped = getCommandsByCategory(isAdmin);
  const embed = themedEmbed(theme, '📚 Help — Command List', 'All available commands grouped by category.');

  // Sort categories: General, Games, Wallet, Loans, Ranks, Admin, Dev
  const order = ['General', 'Games', 'Wallet', 'Loans', 'Ranks', 'Admin', 'Dev'];
  const sorted = [...grouped.entries()].sort((a, b) => {
    const aIdx = order.indexOf(a[0]);
    const bIdx = order.indexOf(b[0]);
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
  });

  for (const [category, commands] of sorted) {
    const lines = commands.map(cmd => `• \`/${cmd.name}\` — ${cmd.short}`).join('\n');
    embed.addFields({ name: categoryEmoji(category) + ' ' + category, value: lines, inline: false });
  }

  embed.setFooter({ text: 'Tip: Use /help command to see detailed usage and examples.' });

  await interaction.reply({ embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined });
}

/**
 * Handle /help category
 */
async function handleCategory(
  interaction: ChatInputCommandInteraction,
  ephemeral: boolean,
  isAdmin: boolean,
  theme: any
): Promise<void> {
  const categoryName = interaction.options.getString('name', true);
  const grouped = getCommandsByCategory(isAdmin);
  const commands = grouped.get(categoryName);

  if (!commands || commands.length === 0) {
    await interaction.reply({
      content: `No commands found in category "${categoryName}".`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const embed = themedEmbed(theme, `📚 Help — ${categoryName}`, `Commands in the ${categoryName} category.`);
  const lines = commands.map(cmd => `• \`/${cmd.name}\` — ${cmd.short}`).join('\n');
  embed.setDescription(lines);
  embed.setFooter({ text: 'Tip: Use /help command to see detailed usage and examples.' });

  await interaction.reply({ embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined });
}

/**
 * Handle /help command
 */
async function handleCommand(
  interaction: ChatInputCommandInteraction,
  ephemeral: boolean,
  isAdmin: boolean,
  theme: any
): Promise<void> {
  const commandName = interaction.options.getString('name', true);
  const meta = getCommandMeta(commandName);

  if (!meta) {
    await interaction.reply({
      content: `Command "${commandName}" not found.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  // Check visibility
  if (meta.visibility === 'adminOnly' && !isAdmin) {
    await interaction.reply({
      content: `Command "${commandName}" not found.`,
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  const embed = buildCommandEmbed(meta, theme);

  await interaction.reply({ embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined });
}

/**
 * Build detailed command embed
 */
function buildCommandEmbed(meta: CommandMeta, theme: any): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(theme?.accent ?? 0x5865F2)
    .setTitle(`Help — /${meta.name}`)
    .setTimestamp();

  // Category badge
  embed.addFields({
    name: '📂 Category',
    value: `${categoryEmoji(meta.category)} ${meta.category}`,
    inline: true
  });

  // Permission badge
  const permText = meta.permissions === 'everyone' ? '👥 Everyone' : meta.permissions === 'admin' ? '🔒 Admin only' : '🔐 Super only';
  embed.addFields({
    name: '🔑 Permission',
    value: permText,
    inline: true
  });

  // Cooldown badge
  if (meta.cooldown) {
    embed.addFields({
      name: '⏱️ Cooldown',
      value: meta.cooldown,
      inline: true
    });
  }

  // Description
  const description = meta.long ?? meta.short;
  embed.addFields({
    name: '📖 What it does',
    value: description,
    inline: false
  });

  // Usage
  if (meta.usage) {
    embed.addFields({
      name: '💡 Usage',
      value: `\`${meta.usage}\``,
      inline: false
    });
  }

  // Options
  if (meta.options && meta.options.length > 0) {
    const optLines = meta.options.map(opt => {
      let line = `• **${opt.name}** (${opt.type})`;
      if (opt.description) line += ` — ${opt.description}`;
      if (opt.required) line += ' **[Required]**';
      else line += ' _[Optional]_';
      if (opt.default !== undefined) line += ` (default: ${opt.default})`;
      if (opt.choices && opt.choices.length > 0) line += ` (choices: ${opt.choices.join(', ')})`;
      return line;
    });
    embed.addFields({
      name: '⚙️ Options',
      value: optLines.join('\n'),
      inline: false
    });
  }

  // Examples
  if (meta.examples && meta.examples.length > 0) {
    const exampleLines = meta.examples.map((ex, i) => {
      let line = `${i + 1}. \`${ex.slash}\``;
      if (ex.description) line += `\n   ${ex.description}`;
      return line;
    });
    embed.addFields({
      name: '📝 Examples',
      value: exampleLines.join('\n\n'),
      inline: false
    });
  }

  // Notes
  if (meta.notes && meta.notes.length > 0) {
    const noteLines = meta.notes.map(note => `• ${note}`).join('\n');
    embed.addFields({
      name: '📌 Notes',
      value: noteLines,
      inline: false
    });
  }

  return embed;
}

/**
 * Get emoji for category
 */
function categoryEmoji(category: string): string {
  switch (category) {
    case 'General': return '🏠';
    case 'Games': return '🎮';
    case 'Wallet': return '💰';
    case 'Loans': return '🏦';
    case 'Ranks': return '⭐';
    case 'Admin': return '🔧';
    case 'Dev': return '🛠️';
    default: return '📦';
  }
}

/**
 * Handle autocomplete interactions
 */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  await handleAutocomplete(interaction);
}
