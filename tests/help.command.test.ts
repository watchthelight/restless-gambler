import { describe, test, expect } from "@jest/globals";
import { enabledHelpDocs, getDocByName, getDocsByCategory } from "../src/help/registry.js";
import { setToggle } from "../src/config/toggles.js";

describe("Help System", () => {
  test("enabledHelpDocs returns array of help docs", () => {
    const docs = enabledHelpDocs();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBeGreaterThan(0);
  });

  test("enabledHelpDocs includes help command when enabled", () => {
    // Ensure help is enabled
    setToggle("help", true);
    const docs = enabledHelpDocs();
    const helpDoc = docs.find((d) => d.name === "help");
    expect(helpDoc).toBeTruthy();
    expect(helpDoc?.title).toBe("Help");
    expect(helpDoc?.category).toBe("misc");
  });

  test("getDocByName returns correct doc for valid command", () => {
    setToggle("balance", true);
    const doc = getDocByName("balance");
    expect(doc).toBeTruthy();
    expect(doc?.name).toBe("balance");
    expect(doc?.title).toBe("Wallet Balance");
    expect(doc?.category).toBe("economy");
    expect(doc?.usage).toContain("/balance");
  });

  test("getDocByName returns undefined for non-existent command", () => {
    const doc = getDocByName("nonexistent-command-xyz");
    expect(doc).toBeUndefined();
  });

  test("getDocByName is case-insensitive", () => {
    setToggle("ping", true);
    const doc1 = getDocByName("ping");
    const doc2 = getDocByName("PING");
    expect(doc1).toBeTruthy();
    expect(doc2).toBeTruthy();
    expect(doc1?.name).toBe(doc2?.name);
  });

  test("getDocsByCategory filters by category", () => {
    setToggle("blackjack", true);
    setToggle("slots", true);
    setToggle("roulette", true);
    const gameDocs = getDocsByCategory("games");
    expect(gameDocs.length).toBeGreaterThan(0);
    gameDocs.forEach((doc) => {
      expect(doc.category).toBe("games");
    });
  });

  test("getDocsByCategory returns empty array for category with no commands", () => {
    const docs = getDocsByCategory("nonexistent-category" as any);
    expect(docs).toEqual([]);
  });

  test("disabled commands are not included in enabledHelpDocs", () => {
    // Disable a command
    setToggle("canary", false);
    const docs = enabledHelpDocs();
    const canaryDoc = docs.find((d) => d.name === "canary");
    expect(canaryDoc).toBeUndefined();
  });

  test("all help docs have required fields", () => {
    const docs = enabledHelpDocs();
    docs.forEach((doc) => {
      expect(doc.name).toBeTruthy();
      expect(doc.desc).toBeTruthy();
      expect(Array.isArray(doc.usage)).toBe(true);
      expect(doc.usage.length).toBeGreaterThan(0);
      expect(doc.category).toBeTruthy();
    });
  });

  test("loan command has detailed documentation", () => {
    setToggle("loan", true);
    const doc = getDocByName("loan");
    expect(doc).toBeTruthy();
    expect(doc?.title).toBe("Loans");
    expect(doc?.category).toBe("loans");
    expect(doc?.usage.length).toBeGreaterThan(5); // Should have many usage examples
    expect(doc?.examples).toBeTruthy();
    expect(doc?.permissions).toBeTruthy();
  });

  test("admin command has detailed documentation", () => {
    setToggle("admin", true);
    const doc = getDocByName("admin");
    expect(doc).toBeTruthy();
    expect(doc?.title).toBe("Admin Controls");
    expect(doc?.category).toBe("admin");
    expect(doc?.usage.length).toBeGreaterThan(10); // Many admin subcommands
    expect(doc?.permissions).toBeTruthy();
  });

  test("game commands are in games category", () => {
    const gameCommands = ["blackjack", "roulette", "slots", "gamble", "holdem"];
    gameCommands.forEach((cmd) => {
      setToggle(cmd, true);
    });

    const docs = enabledHelpDocs();
    gameCommands.forEach((cmd) => {
      const doc = docs.find((d) => d.name === cmd);
      if (doc) {
        expect(doc.category).toBe("games");
      }
    });
  });

  test("economy commands are in economy category", () => {
    const econCommands = ["balance", "daily", "faucet", "give", "transfer", "leaderboard"];
    econCommands.forEach((cmd) => {
      setToggle(cmd, true);
    });

    const docs = enabledHelpDocs();
    econCommands.forEach((cmd) => {
      const doc = docs.find((d) => d.name === cmd);
      if (doc) {
        expect(doc.category).toBe("economy");
      }
    });
  });
});
