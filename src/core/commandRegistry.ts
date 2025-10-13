/**
 * Command registry utilities for flattening command names/paths.
 * Used by bugreport autocomplete to suggest all available commands.
 */
import type { Client } from 'discord.js';
import { getSlashCommands } from '../commands/slash/index.js';

/**
 * Flatten all application commands into a deduplicated array of command paths.
 * Returns paths like: ["blackjack", "blackjack start", "admin give", "rank set", etc.]
 */
export function flattenCommands(client: Client): string[] {
  const paths = new Set<string>();

  try {
    // Try to use the Discord application command cache first
    const commands = client.application?.commands?.cache;
    if (commands && commands.size > 0) {
      for (const [, cmd] of commands) {
        // Add top-level command
        paths.add(cmd.name);

        // Check for subcommands/groups
        if ('options' in cmd && Array.isArray(cmd.options)) {
          for (const opt of cmd.options) {
            if (opt.type === 1) {
              // SUB_COMMAND (type 1)
              paths.add(`${cmd.name} ${opt.name}`);
            } else if (opt.type === 2) {
              // SUB_COMMAND_GROUP (type 2)
              paths.add(`${cmd.name} ${opt.name}`);
              if ('options' in opt && Array.isArray(opt.options)) {
                for (const subopt of opt.options) {
                  if (subopt.type === 1) {
                    paths.add(`${cmd.name} ${opt.name} ${subopt.name}`);
                  }
                }
              }
            }
          }
        }
      }
    }

    // Fallback: if cache is empty, use local command registry
    if (paths.size === 0) {
      const localCmds = getSlashCommands();
      for (const cmd of localCmds) {
        const builder = (cmd.data as any).toJSON?.() ?? cmd.data;
        if (!builder?.name) continue;

        // Add top-level command
        paths.add(builder.name);

        // Check for subcommands/groups in builder options
        if (Array.isArray(builder.options)) {
          for (const opt of builder.options) {
            if (opt.type === 1) {
              // SUB_COMMAND
              paths.add(`${builder.name} ${opt.name}`);
            } else if (opt.type === 2) {
              // SUB_COMMAND_GROUP
              paths.add(`${builder.name} ${opt.name}`);
              if (Array.isArray(opt.options)) {
                for (const subopt of opt.options) {
                  if (subopt.type === 1) {
                    paths.add(`${builder.name} ${opt.name} ${subopt.name}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[commandRegistry] flattenCommands failed:', e);
  }

  return Array.from(paths).sort();
}
