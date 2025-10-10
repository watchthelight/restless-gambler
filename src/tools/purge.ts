import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { ui } from '../cli/ui.js';
import log from '../cli/logger.js';

dotenv.config();

const restFromEnv = () => {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  return new REST({ version: '10' }).setToken(token);
};

async function getAppId(): Promise<string> {
  const id = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID || '';
  if (!id) throw new Error('APP_ID missing (set APP_ID or DISCORD_APP_ID or CLIENT_ID)');
  return id;
}

export async function purgeGlobalDuplicates(keepNames: string[]) {
  const rest = restFromEnv();
  const appId = await getAppId();
  const current: any[] = (await rest.get(Routes.applicationCommands(appId))) as any[];
  const toDelete = current.filter((c) => keepNames.includes(c.name));
  for (const c of toDelete) await rest.delete(Routes.applicationCommand(appId, c.id));
  ui.table([{ action: 'deleted_global', count: toDelete.length }]);
  log.info('purge_global_done', 'register', { deleted: toDelete.map((x) => x.name) });
  return toDelete.map((x) => x.name);
}

export async function purgeGuildDuplicates(guildId: string, keepNames: string[]) {
  const rest = restFromEnv();
  const appId = await getAppId();
  const current: any[] = (await rest.get(Routes.applicationGuildCommands(appId, guildId))) as any[];
  const toDelete = current.filter((c) => keepNames.includes(c.name));
  for (const c of toDelete) await rest.delete(Routes.applicationGuildCommand(appId, guildId, c.id));
  ui.table([{ action: 'deleted_guild', count: toDelete.length }]);
  log.info('purge_guild_done', 'register', { deleted: toDelete.map((x) => x.name), guildId });
  return toDelete.map((x) => x.name);
}

// CLI entry: tsx src/tools/purge.ts --target <global|guild> [--guild <id>] [--dry]
if (process.argv[1] && /purge\.[cm]?ts|purge\.[cm]?js$/.test(process.argv[1])) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : '';
      const guild = args.includes('--guild') ? args[args.indexOf('--guild') + 1] : process.env.DEV_GUILD_ID;
      const { getDesiredCommands } = await import('../commands/registry.js');
      const keep = getDesiredCommands().map((d) => d.name);
      if (target === 'global') await purgeGlobalDuplicates(keep);
      else if (target === 'guild') {
        if (!guild) throw new Error('Provide --guild <id> or set DEV_GUILD_ID');
        await purgeGuildDuplicates(guild, keep);
      } else throw new Error('Usage: --target <global|guild> [--guild <id>]');
      process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
  })();
}

