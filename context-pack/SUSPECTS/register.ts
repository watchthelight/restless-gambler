import 'dotenv/config';
import { REST, Client, GatewayIntentBits, Routes } from 'discord.js';
import { allCommands } from './commands/slash/index.js';
import { VERBOSE, vlog } from './util/verbose.js';
import { SHOULD_REGISTER, CLEAR_GUILD_COMMANDS_ON_BOOT } from './config/flags.js';
import fs from 'node:fs';
import path from 'node:path';
import type { RESTPostAPIApplicationCommandsJSONBody } from 'discord-api-types/v10';

function buildAllCommands() {
    const commands = allCommands();
    const deduped = commands.filter((c, i) => commands.findIndex(x => x.name === c.name) === i);
    return deduped.map((b) => (typeof b.toJSON === 'function' ? b.toJSON() : b));
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



async function doRegister(client: any, appId: string, scope: 'global' | 'guild' = 'global') {
    if (!SHOULD_REGISTER) {
        console.log(JSON.stringify({ msg: 'registry', event: 'skip', reason: 'disabled' }));
        return { scope, names: [] };
    }

    const rest = client.rest;
    const token = assertToken(client);
    if (!client.token) {
        rest.setToken(token);
    }

    const body = buildAllCommands();
    const names = body.map(c => c.name);

    if (VERBOSE) {
        console.log(JSON.stringify({ msg: 'registry', event: 'preflight', scope, count: body.length, names }));
    }

    let route: string;
    let guildId: string | undefined;
    if (scope === 'guild') {
        guildId = process.env.DEV_GUILD_ID;
        if (!guildId) {
            console.log(JSON.stringify({ msg: 'registry', event: 'skip', reason: 'no_dev_guild_id' }));
            return { scope, names: [] };
        }
        route = Routes.applicationGuildCommands(appId, guildId);
    } else {
        route = Routes.applicationCommands(appId);
    }

    // One-time purge of guild commands (only for global scope)
    if (scope === 'global') {
        const sentinelPath = path.resolve('data/.registry.purged');
        if (CLEAR_GUILD_COMMANDS_ON_BOOT && !fs.existsSync(sentinelPath)) {
            const guilds = await client.guilds.fetch();
            for (const [gid] of guilds) {
                try {
                    await rest.put(Routes.applicationGuildCommands(appId, gid), { body: [] });
                    console.log(JSON.stringify({ msg: 'registry', event: 'purged_guild', guildId: gid, status: 'ok' }));
                } catch (e: any) {
                    console.log(JSON.stringify({ msg: 'registry', event: 'purged_guild_error', guildId: gid, status: e.status, code: e.code }));
                }
            }
            try { fs.writeFileSync(sentinelPath, ''); } catch { }
        }
    }

    // Upsert
    try {
        await rest.put(route, { body });
        console.log(JSON.stringify({ msg: 'registry', event: 'commands_upserted', scope, count: body.length }));
    } catch (err: any) {
        let data = err.rawError ?? err.raw ?? { message: err.message };
        if (typeof data === 'string' && data.length > 500) data = data.slice(0, 500) + '...';
        console.log(JSON.stringify({ msg: 'registry', event: 'error', scope, name: err.name, code: err.code, status: err.status, data }));
        throw err;
    }

    // Verify
    try {
        const commands = await rest.get(route);
        console.log(JSON.stringify({ msg: 'registry', event: 'verify', scope, count: Array.isArray(commands) ? commands.length : 0 }));
    } catch (e: any) {
        console.log(JSON.stringify({ msg: 'registry', event: 'verify_error', scope, error: e.message }));
    }

    return { scope, names };
}

export async function registerAllCommands(client: any) {
    const appId = client.application!.id;
    return await doRegister(client, appId);
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
            await doRegister(appId, token);
            process.exit(0);
        } catch (e) {
            console.error('register_fatal', e);
            process.exit(1);
        }
    })();
}
