import { describe, it, expect } from "@jest/globals";
import { formatBalance, parseBalance } from "../src/util/formatBalance";

describe("formatBalance", () => {
    const cases: Array<[number | bigint, string]> = [
        [1, "1"],
        [10, "10"],
        [100, "100"],
        [1_000, "1.00k"],
        [10_000, "10.0k"],
        [100_000, "100k"],
        [1_000_000, "1.00m"],
        [12_345_678, "12.3m"],
        [123_456_789, "123m"],
        [1_000_000_000n, "1.00b"],
        [-1_000n, "-1.00k"],
    ];
    for (const [v, out] of cases) it(`${v} -> ${out}`, () => expect(formatBalance(v)).toBe(out));
});

describe("parseBalance", () => {
    it("roundtrip basic", () => {
        const s = ["1.00k", "10.0k", "100k", "1.23m", "12.3m", "123m", "999", "-1.00k"];
        for (const v of s) expect(typeof parseBalance(v)).toBe("bigint");
    });
});
