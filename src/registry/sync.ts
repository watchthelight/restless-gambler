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

export function buildCommands(): RESTPostAPIApplicationCommandsJSONBody[] {
    return allCommandBuilders().map(b => b.toJSON());
}

export async function registerGlobal(rest: REST, appId: string, cmds: RESTPostAPIApplicationCommandsJSONBody[]) {
    const res = await rest.put(Routes.applicationCommands(appId), { body: cmds }) as any[];
    return Array.isArray(res) ? res.length : 0;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function purgeGuildCommands(rest: REST, appId: string, guildId: string, delayMs = 150) {
    const list = await rest.get(Routes.applicationGuildCommands(appId, guildId)) as RESTGetAPIApplicationGuildCommandsResult;
    let purged = 0;
    for (const cmd of list) {
        try {
            await rest.delete(Routes.applicationGuildCommand(appId, guildId, cmd.id));
            purged++;
            await sleep(delayMs);
        } catch { }
    }
    return purged;
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
    const globalCount = await registerGlobal(rest, appId, cmds);
    const purged: { guildId: string; count: number }[] = [];
    for (const [gid] of client.guilds.cache) {
        const count = await purgeGuildCommands(rest, appId, gid);
        purged.push({ guildId: gid, count });
    }
    log.info("command_sync", "register", { global: globalCount, purged });
    return { globalCount, purged };
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
