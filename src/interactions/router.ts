import type { Client, Interaction, ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { resolveRuntime, VISIBILITY_MODE } from '../config/runtime.js';
import { ui } from '../cli/ui.js';
import log from '../cli/logger.js';
import { getSlashCommands } from '../commands/slash/index.js';
import { handleSlotsButton } from './buttons/slots.js';
import * as EconButtons from './buttons/econ.js';
import * as BlackjackSlash from '../commands/slash/blackjack.js';
import * as RouletteCmd from '../games/roulette/commands.js';
import * as AdminCmd from '../commands/admin/index.js';
import { onAmountExact, onAmountCopy } from './amountHandlers.js';
import { getGuildDb } from '../db/connection.js';
import { migrateGuildDb } from '../db/migrateGuild.js';
import { safeDefer, replyError } from '../game/config.js';

function logPermError(e: any, i: Interaction) {
  const code = (e && (e.code || e.status)) ?? 0;
  if (code === 50013 || code === 50007) {
    console.warn(
      JSON.stringify({ msg: 'permission_error', code, guildId: (i as any).guildId ?? null, channelId: (i as any).channelId ?? null }),
    );
  }
}

const cfg = resolveRuntime();

function memberHasAnyRole(interaction: Interaction, roleIds: Set<string>): boolean {
  if (!roleIds || roleIds.size === 0) return false;
  const roles = interaction.member?.roles;
  const hasCache = roles && "cache" in roles;
  if (hasCache) {
    for (const id of roleIds) if ((roles as any).cache.has(id)) return true;
    return false;
  }
  const arr = (roles as any) ?? [];
  for (const id of roleIds) if (arr.includes?.(id)) return true;
  return false;
}

export function initInteractionRouter(client: Client) {
  client.on('interactionCreate', async (i: Interaction) => {
    // Non-slash interactions routed here as well
    try {
      if (i.isButton()) {
        if (i.customId.startsWith('slots:')) {
          await safeDefer(i, true);
          try {
            await handleSlotsButton(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        if (i.customId.startsWith('blackjack:')) {
          await safeDefer(i, true);
          try {
            await (BlackjackSlash as any).handleButton(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        if (i.customId.startsWith('roulette:')) {
          await safeDefer(i, true);
          try {
            await (RouletteCmd as any).handleRouletteButton(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        if (i.customId.startsWith('econ:')) {
          await safeDefer(i, true);
          try {
            await (EconButtons as any).handleButton(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        if (i.customId.startsWith('admin:reboot:confirm:')) {
          await safeDefer(i, true);
          try {
            await (AdminCmd as any).handleButton(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        if (i.customId.startsWith('amt:exact:')) {
          await safeDefer(i, true);
          try {
            await onAmountExact(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        if (i.customId.startsWith('amt:copy:')) {
          await safeDefer(i, true);
          try {
            await onAmountCopy(i);
          } catch (e: any) {
            await replyError(i, "ERR-COMPONENT", console, { err: String(e) });
          }
          return;
        }
        return;
      }
      if (!i.isChatInputCommand()) return;

      // Dev-only gate
      if (cfg.devOnly && i.guildId && i.member) {
        if (!memberHasAnyRole(i, cfg.devOnlyRoles)) {
          await i.reply({
            content: 'This bot is in phases of early development. Reach out to watchthelight to join the team!',
            flags: MessageFlags.Ephemeral
          }).catch(() => { });
          return;
        }
      }
      const name = i.commandName;
      let sub: string | null = null;
      try { sub = (i as any).options?.getSubcommand?.(false) ?? null; } catch { sub = null; }
      const who = (i.user && (i.user.tag || i.user.username)) ? `${i.user.tag || i.user.username}#${i.user.id}` : i.user?.id || 'unknown';
      const where = `${(i.guild as any)?.name || i.guildId || 'DM'}${(i.channel as any)?.name ? ' (#' + (i.channel as any).name + ')' : ''}`;
      ui.say(`🎮 /${name}${sub ? ' ' + sub : ''} by ${who} in ${where}`, 'dim');
      log.debug('interaction', 'interaction', { name, sub, id: i.id, guildId: i.guildId || null, userId: i.user?.id || null });

      let acknowledged = false;
      const t = setTimeout(async () => {
        if (!i.deferred && !i.replied) {
          acknowledged = true;
          const publicMode = VISIBILITY_MODE === 'public';
          await i.deferReply(publicMode ? {} : { flags: MessageFlags.Ephemeral }).catch(() => { });
          ; (i as any).__autoDeferred = true;
        }
      }, 1500);

      try {
        const cmd = getSlashCommands().find((c) => c.name === name);
        if (!cmd) {
          if (!acknowledged && !i.replied && !i.deferred) await i.reply({ content: 'Unknown command.', ephemeral: true }).catch(() => { });
          else if (i.deferred && !i.replied) await i.editReply({ content: 'Unknown command.' }).catch(() => { });
          return;
        }
        try {
          await cmd.run(i as ChatInputCommandInteraction);
        } catch (e: any) {
          const errStr = String(e);
          if (errStr.includes('no such table')) {
            try {
              if (i.guildId) {
                const db = getGuildDb(i.guildId);
                migrateGuildDb(db, i.guildId, console);
                await cmd.run(i as ChatInputCommandInteraction);
                return;
              }
            } catch (retryErr) {
              console.error(JSON.stringify({ msg: 'handler_error', code: 'ERR-DB-SCHEMA', guildId: i.guildId, name: i.commandName, err: String(retryErr) }));
              if (!acknowledged && !i.replied && !i.deferred) await i.reply({ content: 'Something went wrong (ERR-DB-SCHEMA)', flags: MessageFlags.Ephemeral }).catch(() => { });
              else if (i.deferred && !i.replied) await i.editReply({ content: 'Something went wrong (ERR-DB-SCHEMA)' }).catch(() => { });
              return;
            }
          }
          throw e;
        }
      } catch (e) {
        console.error(JSON.stringify({ msg: 'handler_error', name: i.commandName, error: String(e) }));
        log.error('Command handler error', 'interaction', { command: i.commandName, error: String(e) });
        logPermError(e, i);
        if (!acknowledged && !i.replied && !i.deferred) await i.reply(VISIBILITY_MODE === 'public' ? { content: 'Something went wrong. Try again.' } : { content: 'Something went wrong. Try again.', flags: MessageFlags.Ephemeral }).catch(() => { });
        else if (i.deferred && !i.replied) await i.editReply({ content: 'Sorry, something went wrong.' }).catch(() => { });
      } finally {
        clearTimeout(t);
      }
    } catch (e) {
      console.error(JSON.stringify({ msg: 'router_error', error: String(e) }));
      log.error('Router error', 'interaction', { error: String(e) });
    }
  });
}
