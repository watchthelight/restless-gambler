import type { REST } from "discord.js";
import {
    Routes,
    type RESTGetAPIApplicationGuildCommandsResult,
    type RESTPostAPIApplicationCommandsJSONBody,
} from "discord.js";

// Import your command builders here
// Example:
// import { ping } from "../commands/ping.js";
// import { admin } from "../commands/admin/index.js";
// ...
import { allCommandBuilders } from "./util-builders.js"; // create this if you don't have a central export
import { loadConfig } from "../config/toggles.js";

export function buildCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
    return allCommandBuilders().map(b => b.toJSON());
}

export async function registerGlobal(rest: REST, appId: string, cmds: RESTPostAPIApplicationCommandsJSONBody[], log: any = console) {
    const res = await rest.put(Routes.applicationCommands(appId), { body: cmds }) as any[];
    const count = Array.isArray(res) ? res.length : 0;
    log.info?.({ msg: "global_registered", count });
    return count;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function purgeGuildCommands(rest: REST, appId: string, guildId: string, delayMs = 150, log: any = console) {
    const list = await rest.get(Routes.applicationGuildCommands(appId, guildId)) as RESTGetAPIApplicationGuildCommandsResult;
    let purged = 0;
    for (const cmd of list) {
        try {
            await rest.delete(Routes.applicationGuildCommand(appId, guildId, cmd.id));
            purged++;
            await sleep(delayMs);
        } catch { }
    }
    log.info?.({ msg: "purged_guild", guildId, count: list.length });
    return purged;
}

async function purgeDisabledGlobals(rest: REST, appId: string, log: any = console) {
    const cfg = loadConfig();
    const enabledNames = new Set(
        Object.entries(cfg.commands)
            .filter(([, v]) => v.enabled !== false)
            .map(([k]) => k)
    );
    const globals = await rest.get(Routes.applicationCommands(appId)) as any[];
    const toDelete = globals.filter(c => !enabledNames.has(c.name));
    let del = 0;
    for (const c of toDelete) {
        try {
            await rest.delete(Routes.applicationCommand(appId, c.id));
            del++;
            await sleep(150);
        } catch { }
    }
    if (del) log.warn?.({ msg: "purged_disabled_globals", count: del });
    return del;
}

export async function syncAll(rest: REST, client: any, log: any = console) {
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
    if (!appId) throw new Error("APP_ID missing (set APP_ID or DISCORD_APP_ID or CLIENT_ID)");
    // Sanity: get application from token and warn if mismatch
    try {
        const me: any = await rest.get(Routes.oauth2CurrentApplication());
        if (me?.id && String(me.id) !== String(appId)) {
            log.warn?.({ msg: "app_id_mismatch", fromEnv: appId, fromToken: me.id });
        }
    } catch (e) {
        log.warn?.({ msg: "app_info_fetch_failed", err: String(e) });
    }
    const cmds = buildCommands();
    const globalCount = await registerGlobal(rest, appId, cmds, log);
    const purged: { guildId: string; count: number }[] = [];
    for (const [gid] of client.guilds.cache) {
        const count = await purgeGuildCommands(rest, appId, gid, 150, log);
        purged.push({ guildId: gid, count });
    }
    const purgedDisabled = await purgeDisabledGlobals(rest, appId, log);
    log.info?.({ msg: "command_sync", global: globalCount, purged, purgedDisabled });
    return { globalCount, purged, purgedDisabled };
}

export async function listGlobal(rest: REST) {
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
    const list: any[] = await rest.get(Routes.applicationCommands(appId as string)) as any[];
    return list.map(c => ({ id: c.id, name: c.name }));
}

export async function listGuild(rest: REST, guildId: string) {
    const appId = process.env.APP_ID || process.env.DISCORD_APP_ID || process.env.CLIENT_ID;
    const list: any[] = await rest.get(Routes.applicationGuildCommands(appId as string, guildId)) as any[];
    return list.map(c => ({ id: c.id, name: c.name }));
}
