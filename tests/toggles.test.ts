import { isEnabled, setToggle } from "../src/config/toggles.js";

describe("command toggles", () => {
  test("default enabled when not present", () => {
    expect(isEnabled("ping")).toBe(true);
  });

  test("disable/enable flips state", () => {
    setToggle("roulette", false, "maintenance");
    expect(isEnabled("roulette")).toBe(false);
    setToggle("roulette", true);
    expect(isEnabled("roulette")).toBe(true);
  });
});

