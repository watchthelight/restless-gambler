import type { ChatInputCommandInteraction } from 'discord.js';
import { parseHumanAmount, type ParseAmountOk, AmountParseError, type ParseAmountErr } from '../lib/amount.js';
import { logError, logInfo } from '../utils/logger.js';

export async function getParsedAmount(
  i: ChatInputCommandInteraction,
  name = 'amount',
  opts?: { maxPower?: number }
): Promise<ParseAmountOk> {
  const raw = i.options.getString(name, true);
  const res = parseHumanAmount(raw, opts);
  if ('value' in res) {
    try {
      logInfo(`OK amount parsed — "${res.raw}" → ${res.normalized}`, {
        guild: { id: i.guildId || 'DM', name: (i.guild as any)?.name },
        channel: { id: i.channelId, name: (i.channel as any)?.name },
        user: { id: i.user.id, tag: i.user.tag },
        command: i.commandName,
        sub: (() => { try { return (i.options as any).getSubcommand?.(false); } catch { return undefined; } })() || undefined,
      });
    } catch { /* ignore logging errors */ }
    return res;
  }
  try {
    const err = res as ParseAmountErr;
    logError(`Amount parse failed — "${err.raw}"`, {
      guild: { id: i.guildId || 'DM', name: (i.guild as any)?.name },
      channel: { id: i.channelId, name: (i.channel as any)?.name },
      user: { id: i.user.id, tag: i.user.tag },
      command: i.commandName,
      sub: (() => { try { return (i.options as any).getSubcommand?.(false); } catch { return undefined; } })() || undefined,
    }, err as any);
  } catch { /* ignore logging errors */ }
  throw new AmountParseError(res);
}
