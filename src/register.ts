import 'dotenv/config';
import { REST, Client, GatewayIntentBits, Routes } from 'discord.js';
import { allCommands } from './commands/slash/index.js';
import { VERBOSE, vlog } from './util/verbose.js';
import { SHOULD_REGISTER } from './config/flags.js';
import crypto from 'node:crypto';
import log from './cli/logger.js';
import { syncAll } from './registry/sync.js';
import type { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';

let hasRegistered = false;

function buildAllCommands() {
  const commands = allCommands();
  const deduped = commands.filter((c, i) => commands.findIndex(x => x.name === c.name) === i);
  const jsonCommands = deduped.map((b) => (typeof b.toJSON === 'function' ? b.toJSON() : b));

  // Log command visibility for verification
  if (VERBOSE) {
    for (const cmd of jsonCommands) {
      const perms = (cmd as any).default_member_permissions;
      console.log(JSON.stringify({
        msg: 'command_visibility',
        name: cmd.name,
        defaultMemberPermissions: perms === null ? 'null (visible to all)' : perms,
        dmPermission: (cmd as any).dm_permission ?? true
      }));
    }
  }

  return jsonCommands;
}

function assertToken(client: any): string {
  const token = client.token || process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '';
  if (!token) {
    console.log(JSON.stringify({ msg: 'registry', event: 'skip', reason: 'missing_token' }));
    throw new Error('missing token');
  }
  const fp = token.length > 14 ? token.slice(0, 8) + '...' + token.slice(-6) : token;
  console.log(JSON.stringify({ msg: 'registry', event: 'token_ok', fp }));
  return token;
}

function isPidAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}



async function doRegister(rest: REST, appId: string) {
  if (hasRegistered) {
    log.info('register skipped (already ran)', 'register');
    return { names: [], skipped: true };
  }

  if (!SHOULD_REGISTER) {
    console.log(JSON.stringify({ msg: 'registry', event: 'skip', reason: 'disabled' }));
    return { names: [], skipped: true };
  }

  log.info('register start', 'register');

  const body = buildAllCommands();
  const names = body.map(c => c.name);

  const localHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

  if (VERBOSE) {
    console.log(JSON.stringify({ msg: 'registry', event: 'preflight', count: body.length, names }));
  }

  const route = Routes.applicationCommands(appId);

  // Fetch current commands for hash check
  let current: any[] = [];
  try {
    current = await rest.get(route) as any[];
  } catch (e) {
    // Ignore, proceed
  }

  if (current.length > 0) {
    const remoteHash = crypto.createHash('sha256').update(JSON.stringify(current.map(c => ({ name: c.name, description: c.description, options: c.options || [] })))).digest('hex');
    if (remoteHash === localHash) {
      log.info('register no-op', 'register');
      hasRegistered = true;
      return { names, noop: true };
    }
  }



  // Upsert
  try {
    await rest.put(route, { body });
    log.info('register applied', 'register', { count: body.length });
    console.log(JSON.stringify({ msg: 'registry', event: 'commands_upserted', count: body.length }));
    hasRegistered = true;
  } catch (err: any) {
    if (err.status === 401) {
      log.error('invalid or missing DISCORD_TOKEN; reset token and restart shell', 'register', { error: '401 Unauthorized' });
      return { names: [], skipped: true };
    } else {
      let data = err.rawError ?? err.raw ?? { message: err.message };
      if (typeof data === 'string' && data.length > 500) data = data.slice(0, 500) + '...';
      log.error('register error', 'register', { error: String(err) });
      console.log(JSON.stringify({ msg: 'registry', event: 'error', name: err.name, code: err.code, status: err.status, data }));
      throw err;
    }
  }

  // Verify
  try {
    const commands = await rest.get(route);
    console.log(JSON.stringify({ msg: 'registry', event: 'verify', count: Array.isArray(commands) ? commands.length : 0 }));
  } catch (e: any) {
    console.log(JSON.stringify({ msg: 'registry', event: 'verify_error', error: e.message }));
  }

  return { names };
}

export async function registerAllCommands(client: any) {
  const appId = client.application!.id;
  const rest = client.rest;
  const token = assertToken(client);
  if (!client.token) rest.setToken(token);
  return await doRegister(rest, appId);
}

// If REGISTER_ON_START is enabled, register globally and purge guild commands
export async function registerOnStart(client: any) {
  if (process.env.REGISTER_ON_START === "true") {
    const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN!);
    syncAll(rest, client, log).catch(err => log.error("register_on_start_error", "register", { err: String(err) }));
  }
}

// Allow running as a standalone script: `node dist/register.js`
if (process.argv[1] && /register\.[cm]?js$/.test(process.argv[1])) {
  (async () => {
    try {
      const token = process.env.BOT_TOKEN;
      if (!token) throw new Error('BOT_TOKEN missing');
      let appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID || '';
      if (!appId) {
        const client = new Client({ intents: [GatewayIntentBits.Guilds] });
        await client.login(token);
        appId = client.application!.id;
        await client.destroy();
      }
      const rest = new REST({ version: "10" }).setToken(token);
      await doRegister(rest, appId);
      process.exit(0);
    } catch (e) {
      console.error('register_fatal', e);
      process.exit(1);
    }
  })();
}
