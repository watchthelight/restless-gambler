import dotenv from 'dotenv';
import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';

dotenv.config();

function parseArgs() {
  const args = process.argv.slice(2);
  let doGlobal = false;
  let guildId: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--global') doGlobal = true;
    else if (a === '--guild') { guildId = args[++i]; }
  }
  return { doGlobal, guildId } as const;
}

async function resolveAppId(token: string): Promise<string> {
  const envId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
  if (envId && envId.trim().length > 0) return envId.trim();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  const id = client.application!.id;
  await client.destroy();
  return id;
}

async function main() {
  const { doGlobal, guildId } = parseArgs();
  if (!doGlobal && !guildId) {
    console.error('Usage: node dist/scripts/purge-commands.js [--global] [--guild <id>]');
    process.exit(1);
  }
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  const rest = new REST({ version: '10' }).setToken(token);
  const appId = await resolveAppId(token);

  let delGlobal = 0; let delGuild = 0;
  if (doGlobal) {
    const gs: any[] = (await rest.get(Routes.applicationCommands(appId))) as any[];
    for (const c of gs) await rest.delete(Routes.applicationCommand(appId, c.id));
    delGlobal = gs.length;
  }
  if (guildId) {
    const ls: any[] = (await rest.get(Routes.applicationGuildCommands(appId, guildId))) as any[];
    for (const c of ls) await rest.delete(Routes.applicationGuildCommand(appId, guildId, c.id));
    delGuild = ls.length;
  }
  console.info(JSON.stringify({ msg: 'purge_done', global_deleted: delGlobal, guild_deleted: delGuild, guild: guildId || null }));
}

main().catch((e) => { console.error(e); process.exit(1); });

