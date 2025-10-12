import type { Client, Interaction, ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import chalk from 'chalk';
import { getSlashCommands } from "../commands/slash/index.js";
import { getGuildDb } from "../db/connection.js";
import { getCommandControl } from "../db/commandControl.js";
import { isSuperAdmin } from "../admin/permissions.js";
import { isEnabled, reason as disabledReason } from "../config/toggles.js";
import { getGuildSettings, setHomeChannel } from "../db/guildSettings.js";
import { logCmdStart, logCmdEnd, logBlocked } from "../utils/logger.js";
import { sendPublicError, newErrorId } from '../lib/errorReply.js';
import { handleAutocomplete } from './autocomplete.js';
import { handleSlotsButton } from './buttons/slots.js';
import * as EconButtons from './buttons/econ.js';
import * as BlackjackSlash from '../commands/slash/blackjack.js';
import * as RouletteCmd from '../games/roulette/commands.js';
import * as AdminCmd from '../commands/admin/index.js';
import * as LoanCmd from '../commands/loan/index.js';

export function initInteractionRouter(client: Client) {
  client.on("interactionCreate", async (i: Interaction) => {
    const started = Date.now();
    try {
      // Autocomplete
      if ('isAutocomplete' in i && (i as any).isAutocomplete?.()) {
        await handleAutocomplete(i as any);
        return;
      }

      // Slash commands
      if ("isChatInputCommand" in i && (i as any).isChatInputCommand()) {
        const name = (i as any).commandName as string;
        let sub: string | null = null;
        try { sub = (i as any).options?.getSubcommand?.(false) ?? null; } catch { sub = null; }

        // Build context for logging
        const ctx: {
          guild: { id: string; name: string };
          channel: { id: string; name: string };
          user: { id: string; tag: string };
          command: string;
          sub?: string;
          ms?: number;
          ok?: boolean;
        } = {
          guild: {
            id: (i as any).guildId ?? 'DM',
            name: (i as any).guild?.name ?? 'DM'
          },
          channel: {
            id: (i as any).channelId ?? '-',
            name: ((i as any).channel as any)?.name ?? '-'
          },
          user: {
            id: (i as any).user.id,
            tag: `${(i as any).user.username}#${(i as any).user.discriminator === '0' ? '0' : (i as any).user.discriminator}`
          },
          command: name,
          sub: sub ?? undefined,
        };

        const startedPerf = performance.now();
        logCmdStart(ctx);

        // Per-guild whitelist mode
        if ((i as any).guildId) {
          try {
            const db = getGuildDb((i as any).guildId);
            const cc = getCommandControl(db, (i as any).guildId);
            const cmd = name.toLowerCase();
            const isEscapeHatch = (cmd === "admin" && ((sub?.toLowerCase?.() ?? null) === "whitelist-release"));
            let isSuper = false;
            try { isSuper = isSuperAdmin(db, (i as any).user?.id); } catch { isSuper = false; }
            if (cc.mode === "whitelist" && !isEscapeHatch && !isSuper) {
              const allowed: string[] = JSON.parse(cc.whitelist_json || "[]").map((s: string) => s.toLowerCase());
              if (!allowed.includes(cmd)) {
                await (i as any).reply({ content: "Command disabled (whitelist mode active). Use `/admin whitelist-release` to restore normal operation.", flags: MessageFlags.Ephemeral }).catch(() => { });
                logBlocked("whitelist mode active", ctx);
                return;
              }
            }
          } catch { /* ignore */ }
        }

        if (!isEnabled(name)) {
          const r = disabledReason(name);
          await (i as any).reply({ content: "- /" + name + " is currently disabled" + (r ? (" - " + r) : "") + "." }).catch(() => { });
          logBlocked(r ?? "command disabled", ctx);
          return;
        }

        // Capture first-use home channel (per guild)
        try {
          const gid = (i as any).guildId as string | undefined;
          const cid = (i as any).channelId as string | undefined;
          if (gid && cid) {
            const db = getGuildDb(gid);
            const gs = getGuildSettings(db, gid);
            if (!gs.home_channel_id) {
              setHomeChannel(db, gid, cid);
              try { console.debug({ msg: 'home_channel_set', guildId: gid, channelId: cid }); } catch {}
            }
          }
        } catch { /* ignore */ }

        const cmd = getSlashCommands().find((c) => c.name === name);
        if (!cmd) {
          await (i as any).reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral }).catch(() => { });
          logBlocked("unknown command", ctx);
          return;
        }

        // Soft auto-ack: arm a timer; defer only if still pending after ~2s
        let ackTimer: NodeJS.Timeout | undefined;
        if (!(i as any).deferred && !(i as any).replied) {
          ackTimer = setTimeout(() => {
            if (!(i as any).deferred && !(i as any).replied) {
              (i as any).deferReply({}).catch(() => {});
            }
          }, 2000);
        }

        try {
          await cmd.run(i as ChatInputCommandInteraction);
          if (ackTimer) clearTimeout(ackTimer);
        } catch (err: any) {
          if (ackTimer) clearTimeout(ackTimer);
          const errorId = newErrorId();
          console.error(chalk.red(`[${new Date().toISOString()}] ? ERROR in ${name}  #${errorId}`));
          console.error(chalk.red((err && err.stack) || String(err)));
          await sendPublicError(i as any, {
            title: `${name} failed`,
            message: err?.message ? `• Type: ${err.name || 'Error'}\n• Message: ${err.message}` : 'Something went wrong. Try again.',
            errorId,
          });
          return;
        }

        ctx.ms = Math.round(performance.now() - startedPerf);
        ctx.ok = true;
        logCmdEnd(ctx);
        return;
      }

      // Buttons
      if ('isButton' in i && (i as any).isButton?.()) {
        if (!(i as any).deferred && !(i as any).replied) await (i as any).deferUpdate().catch(() => {});
        const cid = String((i as any).customId || '');
        try {
          if (cid.startsWith('slots:')) {
            await handleSlotsButton(i as any);
          } else if (cid.startsWith('blackjack:')) {
            await (BlackjackSlash as any).handleButton(i as any);
          } else if (cid.startsWith('bj:again:')) {
            await (BlackjackSlash as any).handleAgainButton(i as any);
          } else if (cid.startsWith('roulette:')) {
            await (RouletteCmd as any).handleRouletteButton(i as any);
          } else if (cid.startsWith('econ:')) {
            await (EconButtons as any).handleButton(i as any);
          } else if (cid.startsWith('admin:reboot:confirm:')) {
            await (AdminCmd as any).handleButton(i as any);
          } else if (cid.startsWith('loan:')) {
            await (LoanCmd as any).handleButton?.(i as any);
          } else {
            return; // unknown
          }
          console.log(chalk.green(`[${new Date().toISOString()}] ? component ${cid} by @${(i as any).user?.username}`));
          return;
        } catch (err: any) {
          const errorId = newErrorId();
          console.error(chalk.red(`[${new Date().toISOString()}] ? ERROR in ${cid}  #${errorId}`));
          console.error(chalk.red((err && err.stack) || String(err)));
          await sendPublicError(i as any, {
            title: `interaction failed`,
            message: err?.message ? `• Type: ${err.name || 'Error'}\n• Message: ${err.message}` : 'Something went wrong. Try again.',
            errorId,
          });
          return;
        }
      }

      // Selects
      if (((i as any).isAnySelectMenu?.() || (i as any).isStringSelectMenu?.())) {
        if (!(i as any).deferred && !(i as any).replied) await (i as any).deferUpdate().catch(() => {});
        const cid = String((i as any).customId || '');
        try {
          if (cid.startsWith('slots:')) {
            const { handleSlotsSelect } = await import('./selects/slots.js');
            await handleSlotsSelect(i as any);
          } else if (cid.startsWith('loan:')) {
            await (LoanCmd as any).handleSelect?.(i as any);
          } else {
            return; // unknown
          }
          console.log(chalk.green(`[${new Date().toISOString()}] ? select ${cid} by @${(i as any).user?.username}`));
          return;
        } catch (err: any) {
          const errorId = newErrorId();
          console.error(chalk.red(`[${new Date().toISOString()}] ? ERROR in ${cid}  #${errorId}`));
          console.error(chalk.red((err && err.stack) || String(err)));
          await sendPublicError(i as any, {
            title: `interaction failed`,
            message: err?.message ? `• Type: ${err.name || 'Error'}\n• Message: ${err.message}` : 'Something went wrong. Try again.',
            errorId,
          });
          return;
        }
      }
    } catch (e: any) {
      const errorId = newErrorId();
      console.error(chalk.red(`[${new Date().toISOString()}] ? ERROR in interaction  #${errorId}`));
      console.error(chalk.red((e && e.stack) || String(e)));
      try {
        await sendPublicError(i as any, {
          title: `interaction failed`,
          message: e?.message ? `• Type: ${e.name || 'Error'}\n• Message: ${e.message}` : 'Something went wrong. Try again.',
          errorId,
        });
      } catch { /* ignore */ }
    } finally {
      const ms = Date.now() - started;
      // optional: emit timing metrics here
    }
  });
}
