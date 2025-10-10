import type Database from "better-sqlite3";

function getKV(db: Database.Database, key: string): string | null {
    const r = db.prepare("SELECT value FROM guild_settings WHERE key = ?").get(key) as { value: string } | undefined;
    return r ? String(r.value) : null;
}

export function setKV(db: Database.Database, key: string, value: string) {
    db.prepare("INSERT INTO guild_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

function num(v: any, d: number): number {
    if (v === null || v === undefined) return d;
    if (typeof v === "string" && v.trim() === "") return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

// Optional legacy table reader for a given game
function readLegacy(db: Database.Database, table: string, cols: string[]) {
    try {
        const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!has) return null;
        const row = db.prepare(`SELECT ${cols.join(",")} FROM ${table} LIMIT 1`).get() as { min_bet?: number; max_bet?: number; timeout_s?: number } | undefined;
        return row || null;
    } catch { return null; }
}

export function blackjackLimits(db: Database.Database) {
    // KV first
    let minBet = num(getKV(db, "blackjack.min_bet"), 10);
    let maxBet = num(getKV(db, "blackjack.max_bet"), 1000);
    let timeout = num(getKV(db, "blackjack.timeout_s"), 2);
    // Fallback if KV unset and legacy exists
    const legacy = readLegacy(db, "blackjack_config", ["min_bet", "max_bet", "timeout_s"]);
    if (legacy) {
        if (!Number.isFinite(minBet)) minBet = num(legacy.min_bet, 10);
        if (!Number.isFinite(maxBet)) maxBet = num(legacy.max_bet, 1000);
        if (!Number.isFinite(timeout)) timeout = num(legacy.timeout_s, 2);
    }
    // Sanity clamps
    minBet = Math.max(0, Math.floor(minBet));
    maxBet = Math.max(0, Math.floor(maxBet));
    if (maxBet === 0) maxBet = 1000;        // never allow a zero ceiling
    if (minBet === 0) minBet = 10;
    if (minBet > maxBet) [minBet, maxBet] = [10, 1000];
    return { minBet, maxBet, timeout };
}

export function slotsLimits(db: Database.Database) {
    let minBet = num(getKV(db, "slots.min_bet"), 10);
    let maxBet = num(getKV(db, "slots.max_bet"), 1000);
    // clamp and sanity
    minBet = Math.max(0, Math.floor(minBet || 10));
    maxBet = Math.max(0, Math.floor(maxBet || 1000));
    if (minBet > maxBet) [minBet, maxBet] = [10, 1000];
    return { minBet, maxBet };
}

export function validateBet(bet: number, limits: { minBet: number; maxBet: number }) {
    if (bet < limits.minBet) return { ok: false, reason: `Minimum bet is ${limits.minBet}.` };
    if (bet > limits.maxBet) return { ok: false, reason: `Maximum bet is ${limits.maxBet}.` };
    return { ok: true as const };
}

// Common safe-ack helpers for interactions
export async function safeDefer(interaction: any, ephemeral = true) {
    try {
        if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isAnySelectMenu?.()) {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
        } else {
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral });
        }
    } catch { }
}

export async function safeEdit(interaction: any, opts: any) {
    try {
        if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isAnySelectMenu?.()) {
            return interaction.editReply?.(opts) ?? interaction.update?.(opts);
        }
        if (interaction.deferred) return interaction.editReply?.(opts);
        return interaction.reply?.(opts);
    } catch { }
}

export async function replyError(interaction: any, code: string, log: any, extra?: any) {
    log?.error?.({ msg: "interaction_error", code, ...extra });
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply?.({ content: `❗ ${code}`, ephemeral: true });
        } else {
            await interaction.reply?.({ content: `❗ ${code}`, ephemeral: true });
        }
    } catch { }
}

export function uiExactMode(db: Database.Database, scope: "guild" | "user", userId?: string): "off" | "inline" | "on_click" {
    // guild key: ui.show_exact_mode ; user key (optional): ui.show_exact_mode.user.<id>
    const key = scope === "user" && userId ? `ui.show_exact_mode.user.${userId}` : "ui.show_exact_mode";
    return (getKV(db, key) ?? "on_click") as any;
}
export function uiSigFigs(db: Database.Database): number {
    const n = Number(getKV(db, "ui.compact_sigfigs") ?? 3);
    return Math.min(5, Math.max(3, Number.isFinite(n) ? n : 3));
}
