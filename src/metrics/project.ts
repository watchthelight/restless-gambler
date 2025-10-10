import fs from "node:fs";
import path from "node:path";
import { ActivityType, Client } from "discord.js";
import { allCommandBuilders } from "../registry/util-builders.js";

// Extend this list when new game commands are added.
const GAME_NAMES = new Set([
    "blackjack", "roulette", "slots", "dice", "coinflip", "poker", "keno", "mines", "crash"
]);

export function countCommands(): number {
    try {
        const cmds = allCommandBuilders() ?? [];
        return cmds.length;
    } catch {
        return 0;
    }
}

export function countGames(): number {
    try {
        const cmds = allCommandBuilders() ?? [];
        const names = cmds.map((b: any) => b?.name ?? b?.toJSON?.()?.name).filter(Boolean);
        const unique = new Set<string>();
        for (const n of names) {
            if (GAME_NAMES.has(String(n))) unique.add(String(n));
        }
        return unique.size;
    } catch {
        return 0;
    }
}

export function countLinesOfCode(rootDir = path.resolve(process.cwd(), "src")): number {
    let total = 0;
    const deny = new Set(["node_modules", "dist", "build", ".git", "tests", "__tests__", "__mocks__"]);
    const allowExt = new Set([".ts", ".tsx", ".js"]);
    function walk(dir: string) {
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (deny.has(e.name)) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full); continue; }
            const ext = path.extname(e.name);
            if (!allowExt.has(ext)) continue;
            if (e.name.endsWith(".d.ts")) continue;
            try {
                const text = fs.readFileSync(full, "utf8");
                // Count all lines; cheap and robust. Don’t trim to avoid off-by-ones on trailing newlines.
                total += text.split("\n").length;
            } catch { /* ignore */ }
        }
    }
    walk(rootDir);
    return total;
}

export function makeStatusLine(): string {
    const games = countGames();
    const commands = countCommands();
    const loc = countLinesOfCode();
    return `${games} games, ${commands} commands, across ${loc.toLocaleString()} lines of code`;
}

export async function updateBotPresence(client: Client, log = console) {
    const line = makeStatusLine();
    try {
        client.user?.setPresence({
            activities: [{ name: line, type: ActivityType.Playing }],
            status: "online",
        });
        // Only log in verbose mode
        if (process.env.VERBOSE === '1' || process.env.DEBUG === '1') {
            log.info?.({ msg: "presence_updated", line });
        }
    } catch (e: any) {
        log.warn?.({ msg: "presence_update_failed", err: String(e) });
    }
}
