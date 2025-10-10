import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import crypto from 'node:crypto';
import { getDesiredCommands } from '../commands/registry.js';
import { ui } from '../cli/ui.js';
import log from '../cli/logger.js';

dotenv.config();

export type SyncScope = 'guild' | 'global';

function stable(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => stable(v));
  const omit = new Set(['description_localizations']);
  const keys = Object.keys(obj).filter((k) => !omit.has(k)).sort();
  const o: any = {};
  for (const k of keys) o[k] = stable(obj[k]);
  return o;
}

function hash(json: any): string {
  const s = JSON.stringify(stable(json));
  return crypto.createHash('sha1').update(s).digest('hex');
}

export type SyncSummary = { scope: SyncScope; created: string[]; updated: string[]; deleted: string[]; kept: string[] };

export async function syncCommands(opts: { scope: SyncScope; guildId?: string; dry?: boolean; rest?: REST; appId?: string }): Promise<SyncSummary> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  const rest = opts.rest || new REST({ version: '10' }).setToken(token);
  let appId = opts.appId || process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID || '';
  if (!appId) throw new Error('APP_ID missing (set APP_ID or DISCORD_APP_ID or CLIENT_ID)');
  const desired = getDesiredCommands();
  const desiredMap = new Map<string, any>(desired.map((d) => [d.name, d.json]));
  const desiredHashes = new Map<string, string>(desired.map((d) => [d.name, hash(d.json)]));

  const existing: any[] = opts.scope === 'global'
    ? ((await rest.get(Routes.applicationCommands(appId))) as any[])
    : ((await rest.get(Routes.applicationGuildCommands(appId, opts.guildId!))) as any[]);

  const existingByName = new Map<string, any>(existing.map((c) => [c.name, c]));
  const created: string[] = []; const updated: string[] = []; const deleted: string[] = []; const kept: string[] = [];

  for (const [name, json] of desiredMap.entries()) {
    const remote = existingByName.get(name);
    if (!remote) { created.push(name); }
    else {
      const remoteHash = hash(remote);
      const wantHash = desiredHashes.get(name)!;
      if (remoteHash !== wantHash) updated.push(name); else kept.push(name);
    }
  }
  for (const r of existing) {
    if (!desiredMap.has(r.name)) deleted.push(r.name);
  }

  ui.table([
    { action: 'create', count: created.length },
    { action: 'update', count: updated.length },
    { action: 'delete', count: deleted.length },
    { action: 'keep', count: kept.length },
  ]);

  if (!opts.dry) {
    const body = desired.map((d) => d.json);
    if (opts.scope === 'global') {
      await rest.put(Routes.applicationCommands(appId), { body });
    } else {
      await rest.put(Routes.applicationGuildCommands(appId, opts.guildId!), { body });
    }
  }

  const summary: SyncSummary = { scope: opts.scope, created, updated, deleted, kept };
  log.info('command sync complete', 'register', summary);
  return summary;
}

// CLI entry
if (process.argv[1] && /commandSync\.[cm]?ts|commandSync\.[cm]?js$/.test(process.argv[1])) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const scope = (args.includes('--scope') ? args[args.indexOf('--scope') + 1] : '') as SyncScope;
      const dry = args.includes('--dry');
      const guild = args.includes('--guild') ? args[args.indexOf('--guild') + 1] : process.env.DEV_GUILD_ID;
      if (scope !== 'global' && scope !== 'guild') throw new Error('Usage: tsx src/tools/commandSync.ts --scope <global|guild> [--guild <id>] [--dry]');
      if (scope === 'guild' && !guild) throw new Error('DEV_GUILD_ID or --guild is required for guild scope');
      await syncCommands({ scope, guildId: guild, dry });
      process.exit(0);
    } catch (e) { console.error(e); process.exit(1); }
  })();
}

