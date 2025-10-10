import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { formatBalance } from "./formatBalance.js"; // existing compact formatter (k..centillion)

export type AmountDetail = {
    compact: string;
    exact: string;
    scientific: string;
    unit?: { abbr: string; name: string; exponent: number };
};

const UNIT_MAP: Record<string, { name: string; exponent: number }> = {
    k: { name: "thousand", exponent: 3 }, m: { name: "million", exponent: 6 }, b: { name: "billion", exponent: 9 }, t: { name: "trillion", exponent: 12 },
    qa: { name: "quadrillion", exponent: 15 }, qi: { name: "quintillion", exponent: 18 }, sx: { name: "sextillion", exponent: 21 },
    sp: { name: "septillion", exponent: 24 }, oc: { name: "octillion", exponent: 27 }, no: { name: "nonillion", exponent: 30 },
    de: { name: "decillion", exponent: 33 }
    // extend if your formatBalance exposes more
};

function toBigStr(v: number | bigint): { neg: boolean, s: string } {
    if (typeof v === "bigint") return { neg: v < 0n, s: (v < 0n ? -v : v).toString() };
    const n = Math.trunc(v);
    return { neg: n < 0, s: String(Math.abs(n)) };
}

export function describeAmount(v: number | bigint, sig = 3): AmountDetail {
    const { neg, s } = toBigStr(v);
    const exp = s.length - 1; // 10^exp
    const int = s[0];
    const fracSrc = s.slice(1, 1 + Math.max(0, sig - 1));
    const frac = (fracSrc + "0".repeat(Math.max(0, (sig - 1) - fracSrc.length))).slice(0, Math.max(0, sig - 1));
    const scientific = `${neg ? "-" : ""}${int}${frac ? "." + frac : ""} × 10^${exp}`;
    const exact = (neg ? "-" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const compact = formatBalance(v as any);
    const abbr = compact.match(/[a-z]+$/i)?.[0]?.toLowerCase();
    const unit = abbr && UNIT_MAP[abbr] ? { abbr, ...UNIT_MAP[abbr] } : undefined;
    return { compact, exact, scientific, unit };
}

export function renderAmountInline(v: number | bigint, sig = 3): string {
    const d = describeAmount(v, sig);
    return `${d.compact}${d.exact ? ` *(= ${d.exact})*` : ""}`;
}

export function componentsForExact(v: number | bigint, sig = 3) {
    const d = describeAmount(v, sig);
    const valueRaw = d.exact.replace(/,/g, "");
    const btn = new ButtonBuilder().setCustomId(`amt:exact:${valueRaw}`).setLabel("Exact").setStyle(ButtonStyle.Secondary);
    const copy = new ButtonBuilder().setCustomId(`amt:copy:${valueRaw}`).setLabel("Copy").setStyle(ButtonStyle.Secondary);
    return { text: d.compact, row: new ActionRowBuilder<ButtonBuilder>().addComponents(btn, copy) };
}

export type ExactUiMode = "off" | "inline" | "on_click";
