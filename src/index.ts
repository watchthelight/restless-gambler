import dotenv from 'dotenv';
import { createClient } from './client.js';
import { closeAll, getDbPaths, getGuildDb } from './db/connection.js';
import { registerAllCommands } from './register.js';
import { initInteractionRouter } from './interactions/router.js';
import { ensureSchema } from './db/ensure.js';
import { ui } from './cli/ui.js';
import { createLogger } from "./log.js";
const log = createLogger();
import boxen from 'boxen';
import { VERBOSE, vlog } from './util/verbose.js';
import { resolveRuntime } from './config/runtime.js';
import { updateBotPresence } from "./metrics/project.js";

// Suppress console output temporarily while loading dotenv (to hide emoji tips)
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const suppress = () => {};
console.log = suppress;
console.error = suppress;
console.warn = suppress;
dotenv.config({ override: false, debug: false });
console.log = originalLog;
console.error = originalError;
console.warn = originalWarn;

const cfg = resolveRuntime();
process.env.LOG_LEVEL = cfg.logLevel;
process.env.QUIET = cfg.production ? '1' : '0';
process.env.CLI_BANNER = cfg.pretty ? 'on' : 'off';
process.env.NO_COLOR = cfg.pretty ? '0' : '1';

async function main() {
  // Early boot snapshot (only in verbose mode)
  if (VERBOSE) {
    try {
      console.log(JSON.stringify({ msg: 'boot', node: process.versions.node, platform: process.platform, pid: process.pid, cwd: process.cwd(), argv: process.argv, env: { CLIENT_ID: !!process.env.CLIENT_ID, DEV_GUILD_ID: process.env.DEV_GUILD_ID || null, REGISTER_ON_START: process.env.REGISTER_ON_START || 'unset' } }));
    } catch { }
  }
  process.on('uncaughtException', (e: any) => vlog({ msg: 'uncaughtException', name: e?.name, message: e?.message, stack: (e?.stack || '').split('\n').slice(0, 10) }));
  process.on('unhandledRejection', (reason: any) => { log.error({ msg: "unhandledRejection", reason: String(reason) }); });
  // Boot summary (only in verbose mode)
  if (VERBOSE) {
    try {
      const scope = 'guild';
      console.log(JSON.stringify({ msg: 'boot', node: process.versions.node, discordjs: '14', scope, devGuildId: process.env.DEV_GUILD_ID || null, devOnly: cfg.devOnly, devOnlyRoles: Array.from(cfg.devOnlyRoles), registerOnStart: String(process.env.REGISTER_ON_START || '').toLowerCase() === 'true' }));
    } catch { }
  }
  const token = process.env.BOT_TOKEN;
  if (!token || token.trim() === '') {
    ui.say('BOT_TOKEN is missing. Create a .env file (copy from .env.example) and set BOT_TOKEN.', 'error');
    process.exit(1);
  }

  ui.banner();

  const client = createClient();
  try {
    const anyClient: any = client as any;
    if (VERBOSE && anyClient?.rest?.on) {
      anyClient.rest.on('rateLimited', (info: any) => vlog({ msg: 'rest', event: 'rateLimited', ...info }));
      anyClient.rest.on('invalidRequestWarning', (info: any) => vlog({ msg: 'rest', event: 'invalidRequestWarning', ...info }));
      anyClient.rest.on('response', (request: any, response: any) => vlog({ msg: 'rest', event: 'response', method: request?.method, url: request?.url, status: response?.status, ok: response?.ok }));
    }
  } catch { }
  // Ready hooks (deprecation warning suppressed via --no-deprecation flag)
  client.once('ready', async () => {
    // Update presence once on boot
    await updateBotPresence(client, console);

    // Show ready message with stats
    const guildCount = client.guilds.cache.size;
    const { countCommands } = await import('./metrics/project.js');
    const { getSlashCommands } = await import('./commands/slash/index.js');
    const commandCount = countCommands();

    // Count initialized databases
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { getDbPaths } = await import('./db/connection.js');
    const { data_dir } = getDbPaths();
    let dbCount = 0;
    if (fs.existsSync(data_dir)) {
      dbCount = fs.readdirSync(data_dir).filter(f => f.endsWith('.db')).length;
    }

    ui.say(`Online across ${guildCount} ${guildCount === 1 ? 'server' : 'servers'}, ${commandCount} ${commandCount === 1 ? 'command' : 'commands'} registered and ${dbCount} ${dbCount === 1 ? 'database' : 'databases'} initialized. Waiting for input.`, 'success');

    if (VERBOSE) {
      log.info({ msg: 'ready', scope: 'discord', guilds: guildCount, commands: commandCount, databases: dbCount });
    }

    // Optional: refresh presence every 10 minutes
    const minutes = Number(process.env.STATUS_REFRESH_MINUTES ?? "10");
    if (Number.isFinite(minutes) && minutes > 0) {
      setInterval(() => { updateBotPresence(client, console); }, minutes * 60 * 1000);
    }
  });
  let shuttingDown = false;

  const shutdown = async (_signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const s = ui.step('Rebooting').start();
    try { await client.destroy(); } catch { }
    try { closeAll(); } catch { }
    s.succeed('Reboot requested');
    ui.say('Goodbye', 'dim');
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const paths = getDbPaths();
  const cfgStep = ui.step('Loading config').start();
  try {
    const strategy = process.env.REBOOT_CMD && process.env.REBOOT_CMD.trim().length > 0 ? 'external-cmd' : 'self-reexec';
    cfgStep.succeed('Config loaded');
    if (VERBOSE) {
      log.info({ msg: 'Config loaded', scope: 'startup', data_dir: paths.data_dir, reboot_strategy: strategy });
    }
  } catch (e) {
    cfgStep.fail('Config load failed');
    throw e;
  }

  await ui.timed('Opening databases', async () => {
    ensureSchema();
    try {
      if (process.env.DEV_GUILD_ID) {
        const db = getGuildDb(process.env.DEV_GUILD_ID);
        const cols = (db as any).prepare('PRAGMA table_info(guild_settings);').all().map((r: any) => r.name);
        log.debug({ msg: 'guild_settings columns', scope: 'db', cols });
      }
    } catch { }
    // Startup sweep to migrate all guild DBs
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { getDbPaths, getGuildDb } = await import('./db/connection.js');
      const { data_dir } = getDbPaths();
      if (fs.existsSync(data_dir)) {
        for (const f of fs.readdirSync(data_dir)) {
          if (!f.endsWith('.db')) continue;
          const gid = path.basename(f, '.db');
          getGuildDb(gid); // Opens and migrates
        }
      }
    } catch { }
    // Defensive blackjack schema: run on all guild DBs if present
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { getDbPaths, getGuildDb } = await import('./db/connection.js');
      const { ensureBlackjackSessionsSchema } = await import('./game/blackjack/sessionStore.js');
      const { data_dir } = getDbPaths();
      if (fs.existsSync(data_dir)) {
        for (const f of fs.readdirSync(data_dir)) {
          if (!f.endsWith('.db')) continue;
          const gid = path.basename(f, '.db');
          const db = getGuildDb(gid);
          ensureBlackjackSessionsSchema(db as any);
        }
      }
    } catch { }
  });

  await client.login(token);
  // Probe loaded commands registry (best-effort)
  try {
    const { getSlashCommands } = await import('./commands/slash/index.js');
    const list = getSlashCommands().map((c: any) => ({ name: c?.name || c?.data?.name || 'unknown' }));
    vlog({ msg: 'commands', loaded: list });
  } catch { }
  const doRegister = String(process.env.REGISTER_ON_START || '').toLowerCase() === 'true';
  if (doRegister) {
    const reg = ui.step('Registering slash commands').start();
    try {
      const scope = 'global';
      const info: any = await registerAllCommands(client);
      if (info.skipped) {
        reg.succeed('Registration skipped');
      } else if (info.noop) {
        reg.succeed('Registration no-op');
      } else {
        reg.succeed('Registered commands');
        const names = (info?.names || []).join(', ');
        const summary = boxen(`Registered (${scope}):\n${names}\n\nUse /ping to verify`, { padding: 1, borderColor: 'cyan', borderStyle: 'round' });
        console.log(summary);
      }
    } catch (e: any) {
      reg.fail('Registration failed');
      log.error({ msg: 'Slash registration failed', scope: 'register', error: String(e?.message || e) });
    }
  }
  initInteractionRouter(client);
}

main().catch((e) => {
  log.error({ msg: 'Fatal error', scope: 'startup', error: String(e) });
  process.exit(1);
});
