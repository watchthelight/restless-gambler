import { REST, Routes } from 'discord.js';

async function main() {
  const target = process.argv[2];
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || '';
  if (!appId) throw new Error('APP_ID missing (set APP_ID or DISCORD_APP_ID)');
  const rest = new REST({ version: '10' }).setToken(token);
  if (target === 'dev') {
    const guildId = process.env.DEV_GUILD_ID;
    if (!guildId) throw new Error('DEV_GUILD_ID missing');
    const current: any[] = (await rest.get(Routes.applicationGuildCommands(appId, guildId))) as any[];
    for (const cmd of current) {
      await rest.delete(Routes.applicationGuildCommand(appId, guildId, cmd.id));
    }
    console.info(JSON.stringify({ msg: 'purged', scope: 'dev', names: current.map((c) => c.name) }));
  } else if (target === 'global') {
    const current: any[] = (await rest.get(Routes.applicationCommands(appId))) as any[];
    for (const cmd of current) {
      await rest.delete(Routes.applicationCommand(appId, cmd.id));
    }
    console.info(JSON.stringify({ msg: 'purged', scope: 'global', names: current.map((c) => c.name) }));
  } else {
    console.error('Usage: node dist/tools/purge-commands.js [dev|global]');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

