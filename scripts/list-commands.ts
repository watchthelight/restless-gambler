import dotenv from 'dotenv';
import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';

dotenv.config();

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
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  const rest = new REST({ version: '10' }).setToken(token);
  const appId = await resolveAppId(token);
  const global: any[] = (await rest.get(Routes.applicationCommands(appId))) as any[];
  const guildId = process.env.DEV_GUILD_ID;
  let guild: any[] = [];
  if (guildId) guild = (await rest.get(Routes.applicationGuildCommands(appId, guildId))) as any[];
  console.log(JSON.stringify({ msg: 'list_commands', global: global.map((c) => ({ id: c.id, name: c.name })), guild: guild.map((c) => ({ id: c.id, name: c.name })), guildId: guildId || null }));
}

main().catch((e) => { console.error(e); process.exit(1); });

