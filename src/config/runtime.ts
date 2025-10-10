import { argv } from 'process';

export const VISIBILITY_MODE = (process.env.VISIBILITY_MODE ?? 'public').toLowerCase() === 'ephemeral' ? 'ephemeral' : 'public';

export type Runtime = {
    production: boolean;
    verbose: boolean;
    devOnly: boolean;
    devOnlyRoles: Set<string>;
    logLevel: 'silent' | 'info' | 'trace';
    pretty: boolean;
};

export function resolveRuntime(): Runtime {
    const production = process.env.RG_PRODUCTION === "true";
    const verbose = process.env.RG_VERBOSE === "true" && !production;
    const devOnly = process.env.RG_DEVONLY === "true" && !production;
    const rolesCsv =
        process.env.RG_DEVONLY_ROLES ||
        process.env.DEVONLY_ROLES ||
        process.env.RG_DEVONLY_ROLE ||  /* backward-compat single id */
        "";
    const devOnlyRoles = new Set(
        rolesCsv
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
    );
    if (devOnly && devOnlyRoles.size === 0) {
        /* default both IDs if gate is on but no env provided */
        devOnlyRoles.add("1425816468041236521");
        devOnlyRoles.add("1425853114514411582");
    }

    const pretty = !production;
    const logLevel = production ? 'info' : (verbose ? 'trace' : 'info');

    return {
        production,
        verbose,
        devOnly,
        devOnlyRoles,
        logLevel,
        pretty,
    };
}
