import type { ApplicationCommand, Client } from 'discord.js';
import { CURRENT_GLOBAL_COMMANDS, LEGACY_COMMAND_PAIRS } from './registry.const.js';
import { allCommandNamesIncludingDisabled } from './util-builders.js';

function pairKeys(cmd: ApplicationCommand): string[] {
  // For commands with first-level subcommands, return "parent sub" pairs; otherwise just the name.
  // @ts-ignore: options may be undefined at runtime
  const opts = (cmd as any).options ?? [];
  const subs = Array.isArray(opts) ? opts.filter((o: any) => o?.type === 1) : [];
  if (subs.length) return subs.map((s: any) => `${cmd.name} ${s.name}`);
  return [cmd.name];
}

export async function purgeGlobalLegacy(client: Client<true>): Promise<number> {
  // Merge static allowlist with current build-time names to avoid nuking valid commands.
  const dynamicNames = allCommandNamesIncludingDisabled();
  const keep = new Set<string>([...CURRENT_GLOBAL_COMMANDS, ...dynamicNames]);
  const existing = await client.application.commands.fetch();
  let purged = 0;

  // delete explicit legacy pairs
  for (const [id, cmd] of existing) {
    const pairs = pairKeys(cmd);
    if (pairs.some((p) => LEGACY_COMMAND_PAIRS.includes(p))) {
      await client.application.commands.delete(id).catch(() => {});
      purged++;
      console.debug({ msg: 'purged_legacy_global', name: cmd.name, id });
    }
  }

  // delete unknown commands not in allowlist
  for (const [id, cmd] of existing) {
    if (!keep.has(cmd.name)) {
      await client.application.commands.delete(id).catch(() => {});
      purged++;
      console.debug({ msg: 'purged_unknown_global', name: cmd.name, id });
    }
  }

  return purged;
}

export async function purgePerGuildLegacy(client: Client<true>): Promise<Array<{ guildId: string; count: number }>> {
  const dynamicNames = allCommandNamesIncludingDisabled();
  const keep = new Set<string>([...CURRENT_GLOBAL_COMMANDS, ...dynamicNames]);
  const results: Array<{ guildId: string; count: number }> = [];

  for (const [, guild] of client.guilds.cache) {
    const cmds = await guild.commands.fetch().catch(() => null);
    if (!cmds) continue;

    let purged = 0;

    // explicit legacy pairs
    for (const [id, cmd] of cmds) {
      const pairs = pairKeys(cmd as any);
      if (pairs.some((p) => LEGACY_COMMAND_PAIRS.includes(p))) {
        await guild.commands.delete(id).catch(() => {});
        purged++;
        console.debug({ msg: 'purged_legacy_guild', guildId: guild.id, name: cmd.name, id });
      }
    }

    // delete unknowns
    for (const [id, cmd] of cmds) {
      if (!keep.has(cmd.name)) {
        await guild.commands.delete(id).catch(() => {});
        purged++;
        console.debug({ msg: 'purged_unknown_guild', guildId: guild.id, name: cmd.name, id });
      }
    }

    if (purged) results.push({ guildId: guild.id, count: purged });
  }

  return results;
}

