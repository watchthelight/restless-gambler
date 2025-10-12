import type { Client, Interaction, ChatInputCommandInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { VISIBILITY_MODE } from '../config/runtime.js';
import { ui } from '../cli/ui.js';
import log from '../cli/logger.js';
import { getSlashCommands } from '../commands/slash/index.js';
import { handleSlotsButton } from './buttons/slots.js';
import * as EconButtons from './buttons/econ.js';
import * as BlackjackSlash from '../commands/slash/blackjack.js';
import * as AdminCmd from '../commands/admin/index.js';

function logPermError(e: any, i: Interaction) {
    const code = (e && (e.code || e.status)) ?? 0;
    if (code === 50013 || code === 50007) {
        console.warn(
            JSON.stringify({ msg: 'permission_error', code, guildId: (i as any).guildId ?? null, channelId: (i as any).channelId ?? null }),
        );
    }
}

export function initInteractionRouter(client: Client) {
    client.on('interactionCreate', async (i: Interaction) => {
        // Non-slash interactions routed here as well
        try {
            if (i.isButton()) {
                if (i.customId.startsWith('slots:')) return handleSlotsButton(i);
                if (i.customId.startsWith('blackjack:')) return (BlackjackSlash as any).handleButton(i);
                if (i.customId.startsWith('econ:')) return (EconButtons as any).handleButton(i);
                if (i.customId.startsWith('admin:reboot:confirm:')) return (AdminCmd as any).handleButton(i);
                return;
            }
            if (!i.isChatInputCommand()) return;
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
                    await i.deferReply({}).catch(() => { });
                    ; (i as any).__autoDeferred = true;
                }
            }, 1500);

            try {
                const cmd = getSlashCommands().find((c) => c.name === name);
                if (!cmd) {
                    if (!acknowledged && !i.replied && !i.deferred) await i.reply({ content: 'Unknown command.' }).catch(() => { });
                    else if (i.deferred && !i.replied) await i.editReply({ content: 'Unknown command.' }).catch(() => { });
                    return;
                }
                await cmd.run(i as ChatInputCommandInteraction);
            } catch (e) {
                console.error(JSON.stringify({ msg: 'handler_error', name: i.commandName, error: String(e) }));
                logPermError(e, i);
                if (!acknowledged && !i.replied && !i.deferred) await i.reply({ content: 'Something went wrong. Try again.' }).catch(() => { });
                else if (i.deferred && !i.replied) await i.editReply({ content: 'Sorry, something went wrong.' }).catch(() => { });
            } finally {
                clearTimeout(t);
            }
        } catch (e) {
            console.error(JSON.stringify({ msg: 'router_error', error: String(e) }));
        }
    });
}
