// Units in 10^3 steps up to centillion (10^303). Extend if you enjoy absurdity.
// ["", "k", "m", "b", "t"] then short scales: qa(10^15), qi(10^18), sx, sp, oc, no, de ...
const UNITS = [
    "", "k", "m", "b", "t", "qa", "qi", "sx", "sp", "oc", "no", "de",
    "ud", "dd", "td", "qd", "Qd", "sd", "Sd", "od", "nd", "vg", "uvg", "dvg",
    "tvg", "qvg", "Qvg", "svg", "Svg", "ovg", "nvg", "tg", "utg", "dtg",
    "ttg", "qtg", "Qtg", "stg", "Stg", "otg", "ntg", "qg", "uqg", "dqg",
    "tqg", "qqg", "Qqg", "sqg", "Sqg", "oqg", "nqg", "sg", "usg", "dsg",
    "tsg", "qsg", "Qsg", "ssg", "Ssg", "osg", "nsg", "og", "uog", "dog",
    "tog", "qog", "Qog", "sog", "Sog", "oog", "nog", "ng", "ung", "dng",
    "tng", "qng", "Qng", "sng", "Sng", "ong", "nng", "ce" // "ce" ≈ centillion
];
// The list above is intentionally oversupplied; we clamp at max index anyway.

/** Format balances as: 1, 10, 100, 1.00k, 10.0k, 100k, 1.00m, ... bigint-safe. */
export function formatBalance(value: number | bigint): string {
    const isNum = typeof value === "number";
    const neg = isNum ? value < 0 : (value < 0n);
    const abs = neg ? (isNum ? -value : -value) : value;

    // < 1000 path: plain with locale separators, no decimals
    if (isNum && Number.isFinite(abs) && abs < 1000) {
        return (neg ? "-" : "") + new Intl.NumberFormat("en-US").format(abs as number);
    }
    if (!isNum && (abs as bigint) < 1000n) {
        return (neg ? "-" : "") + (abs as bigint).toString();
    }

    // Work as string to avoid FP issues for huge ints
    const s = (isNum ? Math.trunc(abs as number).toString() : (abs as bigint).toString());
    const len = s.length;
    let tier = Math.floor((len - 1) / 3);
    if (tier >= UNITS.length) tier = UNITS.length - 1;

    const intDigits = len - tier * 3;            // 1..3
    const decimals = Math.max(0, 3 - intDigits); // 1-digit → 2dp, 2-digit → 1dp, 3-digit → 0dp
    const intPart = s.slice(0, intDigits);
    const fracSrc = s.slice(intDigits, intDigits + decimals);
    const frac = decimals > 0 ? (fracSrc + "0".repeat(decimals - fracSrc.length)) : "";
    const unit = UNITS[tier];
    const out = decimals > 0 ? `${intPart}.${frac}${unit}` : `${intPart}${unit}`;
    return (neg ? "-" : "") + out;
}

/** Parse "1.23k"/"10m"/"999" back to bigint (base units). */
export function parseBalance(input: string): bigint {
    const str = input.trim().toLowerCase();
    const neg = str.startsWith("-");
    const z = neg ? str.slice(1) : str;
    const m = z.match(/^([0-9]+)(?:\.([0-9]{1,3}))?\s*([a-z]*)$/i);
    if (!m) throw new Error("Invalid balance format");
    const [, iPart, fPartRaw = "", suffix = ""] = m;
    const idx = UNITS.indexOf(suffix);
    if (idx < 0) throw new Error("Unknown unit");
    const zeros = BigInt(idx * 3);
    const intVal = BigInt(iPart) * 10n ** zeros;
    const fPart = (fPartRaw + "000").slice(0, 3);
    const fracDigits = BigInt(fPart);
    const fracScale = zeros >= 3n ? zeros - 3n : 0n;
    const fracVal = fracDigits * 10n ** fracScale;
    const total = intVal + fracVal;
    return neg ? -total : total;
}

export const __UNITS = UNITS; // for tests
