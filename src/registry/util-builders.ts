// Export a stable array of your SlashCommandBuilder instances
// Example:
// import ping from "../commands/ping.js";
// import admin from "../commands/admin/index.js";
// ...
import { allCommands } from "../commands/slash/index.js";

export function allCommandBuilders() {
    const arr = allCommands();
    // Deduplicate by command name to avoid accidental doubles
    const seen = new Set<string>();
    return arr.filter(b => {
        const name = b?.name ?? b?.toJSON?.().name;
        if (!name) return false;
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
    });
}
