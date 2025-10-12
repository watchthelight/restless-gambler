/**
 * Autocomplete handler for /help command
 *
 * Filters command names based on:
 * - User input (fuzzy prefix match)
 * - Admin visibility (hide admin commands from non-admins)
 */

import type { AutocompleteInteraction } from 'discord.js';
import { getVisibleCommands } from '../../registry/commandMeta.js';
import { getGuildDb } from '../../db/connection.js';
import { ensureAttached, isSuper as storeIsSuper, isGuildAdmin as storeIsGuildAdmin } from '../../admin/adminStore.js';

/**
 * Check if user is admin or super admin.
 */
function isAdmin(interaction: AutocompleteInteraction): boolean {
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

/**
 * Handle autocomplete for command names.
 */
export async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name !== 'command') {
    await interaction.respond([]);
    return;
  }

  const input = focused.value.toLowerCase();
  const userIsAdmin = isAdmin(interaction);
  const visible = getVisibleCommands(userIsAdmin);

  // Filter by prefix or short description
  const matches = visible.filter(cmd => {
    const nameMatch = cmd.name.toLowerCase().includes(input);
    const shortMatch = cmd.short.toLowerCase().includes(input);
    return nameMatch || shortMatch;
  });

  // Sort by relevance: exact prefix match first, then alphabetical
  matches.sort((a, b) => {
    const aStarts = a.name.toLowerCase().startsWith(input);
    const bStarts = b.name.toLowerCase().startsWith(input);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.name.localeCompare(b.name);
  });

  // Return up to 25 choices (Discord limit)
  const choices = matches.slice(0, 25).map(cmd => ({
    name: `${cmd.name} — ${cmd.short.slice(0, 80)}`,
    value: cmd.name
  }));

  await interaction.respond(choices);
}
