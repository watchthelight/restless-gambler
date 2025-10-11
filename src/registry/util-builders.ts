// Export a stable array of your SlashCommandBuilder instances
// Example:
// import ping from "../commands/ping.js";
// import admin from "../commands/admin/index.js";
// ...
import { allCommands } from "../commands/slash/index.js";
import { isEnabled } from "../config/toggles.js";

export function allCommandBuilders() {
    const arr = allCommands();
    // Deduplicate by command name to avoid accidental doubles
    const seen = new Set<string>();
    return arr.filter(b => {
        const name = b?.name ?? b?.toJSON?.().name;
        if (!name) return false;
        if (seen.has(name)) return false;
        if (!isEnabled(name)) return false; // disabled => not registered globally
        seen.add(name);
        return true;
    });
}

// Return all command names, including disabled ones (deduped)
export function allCommandNamesIncludingDisabled(): string[] {
    const arr = allCommands();
    const seen = new Set<string>();
    const names: string[] = [];
    for (const b of arr) {
        const name = (b as any)?.name ?? (b as any)?.toJSON?.().name;
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names.sort();
}
