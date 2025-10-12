import { allCommands } from "../commands/slash/index.js";
import { isEnabled } from "../config/toggles.js";

export type HelpDoc = {
  name: string;
  title?: string;
  desc: string;
  usage: string[];
  examples?: string[];
  permissions?: string[];
  category: "admin" | "games" | "economy" | "config" | "loans" | "misc";
};

// Static per-command extended docs. Keep concise and practical.
const EXT: Record<string, Omit<HelpDoc, "name">> = {
  ping: {
    title: "Latency Check",
    desc: "Simple health & latency check for the bot. Returns roundtrip time and WebSocket heartbeat.",
    usage: ["/ping"],
    examples: ["/ping"],
    category: "misc",
  },
  balance: {
    title: "Wallet Balance",
    desc: "Shows your current balance with both prettified and exact figures. If loans are enabled, also displays your credit score and active loan summary.",
    usage: ["/balance"],
    examples: ["/balance"],
    category: "economy",
  },
  give: {
    title: "Transfer Funds",
    desc: "Send bolts to another user. Limited to 10% of your current balance per transaction. Rate-limited to prevent abuse.",
    usage: ["/give user:@Target amount:<number>"],
    examples: ["/give user:@Birbo amount:250", "/give user:@Alice amount:1000"],
    category: "economy",
  },
  transfer: {
    title: "Transfer Funds (Unrestricted)",
    desc: "Send bolts to another user without the 10% cap (unlike /give). Use responsibly.",
    usage: ["/transfer user:@Target amount:<number>"],
    examples: ["/transfer user:@Bob amount:5000"],
    category: "economy",
  },
  daily: {
    title: "Daily Bonus",
    desc: "Claim your daily bonus chips. 24-hour cooldown between claims. Free currency to get started or recover from losses.",
    usage: ["/daily"],
    examples: ["/daily"],
    category: "economy",
  },
  leaderboard: {
    title: "Top Balances",
    desc: "View the richest users in the server. Shows top 10 players by balance with avatars and display names.",
    usage: ["/leaderboard", "/leaderboard scope:<global|server>"],
    examples: ["/leaderboard", "/leaderboard scope:server"],
    category: "economy",
  },
  gamble: {
    title: "Double-or-Nothing",
    desc: "Risk an amount to win or lose it. Configurable odds (default ~48%). Server min/max bet limits apply. Quick and simple gambling game.",
    usage: ["/gamble amount:<number>"],
    examples: ["/gamble amount:100", "/gamble amount:500"],
    category: "games",
  },
  blackjack: {
    title: "Blackjack",
    desc: "Start a round of blackjack with interactive buttons to Hit, Stand, or Double Down. Classic casino rules apply: dealer stands on soft 17, blackjack pays 3:2, normal win pays 1:1. Supports Play Again button for quick re-betting.",
    usage: ["/blackjack start amount:<number>", "/blackjack cancel"],
    examples: ["/blackjack start amount:250", "/blackjack cancel"],
    category: "games",
  },
  roulette: {
    title: "Roulette",
    desc: "Spin the wheel and bet on outcomes: even/odd, red/black, dozens, columns, or specific numbers. European-style wheel (single zero). Min/max bet limits enforced per server config.",
    usage: ["/roulette"],
    examples: ["/roulette"],
    category: "games",
  },
  slots: {
    title: "Slots",
    desc: "Spin three reels with various symbols. Payouts vary by combination: three of a kind, mixed matches, etc. Min/max bet enforced. Quick play with instant results.",
    usage: ["/slots"],
    examples: ["/slots"],
    category: "games",
  },
  holdem: {
    title: "Texas Hold'em",
    desc: "Create or join multi-player Texas Hold'em tables. Configurable blinds and buy-ins. Full poker mechanics with community cards, betting rounds, and showdown. Advanced multiplayer game.",
    usage: ["/holdem create", "/holdem join", "/holdem leave"],
    examples: ["/holdem create", "/holdem join", "/holdem leave"],
    category: "games",
  },
  rank: {
    title: "Ranks & Buffs",
    desc: "View your level, XP progress, and active luck buff. Level-ups grant a temporary luck bonus that slightly improves RNG in games.",
    usage: ["/rank", "/rank leaderboard"],
    examples: ["/rank", "/rank leaderboard"],
    category: "misc",
  },
  "rank-admin": {
    title: "Rank Admin",
    desc: "Admins manage levels and XP: set level, add XP, set XP directly, or reset a user's rank.",
    usage: [
      "/rank-admin set-level user:<u> level:<n>",
      "/rank-admin add-xp user:<u> xp:<n>",
      "/rank-admin set-xp user:<u> xp:<n>",
      "/rank-admin reset user:<u>",
    ],
    permissions: ["Admin only"],
    category: "admin",
  },
  cooldown: {
    title: "Cooldown Status",
    desc: "View all your active cooldowns (daily, gamble, etc.). Shows remaining time for each cooldown.",
    usage: ["/cooldown"],
    examples: ["/cooldown"],
    category: "economy",
  },
  resetme: {
    title: "Reset Account",
    desc: "Reset your balance and stats to defaults. Requires confirmation. Cannot be undone. Use when you want a fresh start.",
    usage: ["/resetme"],
    examples: ["/resetme"],
    category: "economy",
  },
  loan: {
    title: "Loans",
    desc: "Apply for short-term loans with dynamic APR based on your credit score. Pay loans on time to improve credit; late payments damage it. Admins can forgive loans or reset credit scores. Configurable reminder system helps you stay on top of due dates.",
    usage: [
      "/loan apply amount:<number>",
      "/loan pay amount:<number>",
      "/loan details",
      "/loan reminders on",
      "/loan reminders off",
      "/loan reminders status",
      "/loan reminders snooze hours:<number>",
      // Admin functions moved to /loan-admin
    ],
    examples: [
      "/loan apply amount:1000",
      "/loan pay amount:500",
      "/loan details",
      "/loan reminders on",
      "/loan reminders snooze hours:24",
    ],
    permissions: [
      "All users can apply, pay, and view details"
    ],
    category: "loans",
  },
  "loan-admin": {
    title: "Loan Admin",
    desc: "Admin controls for loan and credit management: reset a user's credit score, forgive all loans and reset balance to 0, run reminder sweep, and set the reminder channel.",
    usage: [
      "/loan-admin credit-reset user:<user>",
      "/loan-admin forgive user:<user>",
      "/loan-admin remind-all",
      "/loan-admin reminders-set-channel [channel:<channel>]",
    ],
    examples: [
      "/loan-admin credit-reset user:@Player",
      "/loan-admin forgive user:@Player",
      "/loan-admin reminders-set-channel channel:#loans",
    ],
    permissions: ["Admin only"],
    category: "admin",
  },
  admin: {
    title: "Admin Controls",
    desc: "Comprehensive admin toolkit for managing the bot, users, and server settings. Includes user management, command sync, economy controls, and UI preferences.",
    usage: [
      "/admin list",
      "/admin add user:<user>",
      "/admin remove user:<user> (super only)",
      "/admin super-add user:<user> (super only)",
      "/admin whoami",
      "/admin sync-commands",
      "/admin toggles action:<view|enable|disable> command:<name>",
      "/admin give user:<user> amount:<number>",
      "/admin take user:<user> amount:<number>",
      "/admin reset user:<user>",
      "/admin reboot",
      "/admin appinfo",
      "/admin list-commands",
      "/admin force-purge",
      "/admin refresh-status",
      "/admin ui sigfigs n:<3-5>",
    ],
    examples: [
      "/admin list",
      "/admin add user:@Helper",
      "/admin toggles action:view",
      "/admin toggles action:disable command:holdem reason:maintenance",
      "/admin give user:@Player amount:1000",
      "/admin sync-commands",
    ],
    permissions: [
      "Normal admin: list, whoami, give, take, reset, reboot, sync-commands, toggles, appinfo, list-commands, force-purge, refresh-status, ui commands",
      "Super admin only: add, super-add, remove"
    ],
    category: "admin",
  },
  "admin-repair": {
    title: "Admin Repair",
    desc: "Quick admin repair utility for fixing common database or state issues. Use when things seem stuck or broken.",
    usage: ["/admin-repair"],
    examples: ["/admin-repair"],
    permissions: ["Admin"],
    category: "admin",
  },
  "admin-reboot": {
    title: "Admin Reboot (Quick)",
    desc: "Shortcut for rebooting the bot. Same as /admin reboot but as a top-level command for faster access.",
    usage: ["/admin-reboot"],
    examples: ["/admin-reboot"],
    permissions: ["Admin"],
    category: "admin",
  },
  config: {
    title: "Guild Config",
    desc: "Get or set per-guild settings like min_bet, max_bet, faucet_limit, theme colors, and more. Allows customization of game limits and visual appearance per server.",
    usage: ["/config get key:<name>", "/config set key:<name> value:<value>"],
    examples: [
      "/config get key:min_bet",
      "/config set key:max_bet value:disable",
      "/config set key:max_bet value:2m",
      "/config set key:theme value:purple",
      "/config get key:faucet_limit",
    ],
    permissions: ["Admin"],
    category: "config",
  },
  theme: {
    title: "Theme Customization",
    desc: "Customize visual appearance: card rendering style (unicode vs images) and color themes. Affects all embeds and generated cards.",
    usage: ["/theme cards-style <unicode|image>", "/theme color <color>"],
    examples: ["/theme cards-style unicode", "/theme color blue"],
    category: "config",
  },
  dev: {
    title: "Dev Tools",
    desc: "Developer utilities for testing card layouts, inspecting state, and debugging. Includes demo rendering for all card types.",
    usage: ["/dev demo component:<notice|list|wallet|slots|roulette|blackjack>"],
    examples: ["/dev demo component:wallet", "/dev demo component:slots"],
    permissions: ["Admin"],
    category: "admin",
  },
  "dev-demo": {
    title: "Dev Demo (Quick)",
    desc: "Shortcut for rendering demo cards. Same as /dev demo but as a top-level command.",
    usage: ["/dev-demo component:<notice|list|wallet|slots|roulette|blackjack>"],
    examples: ["/dev-demo component:blackjack"],
    permissions: ["Admin"],
    category: "admin",
  },
  canary: {
    title: "Canary Test",
    desc: "Simple canary test command to verify the bot is responding. Used for health checks and monitoring.",
    usage: ["/canary"],
    examples: ["/canary"],
    category: "misc",
  },
  help: {
    title: "Help",
    desc: "Show overview of all commands organized by category, or get detailed help for a specific command. Autocomplete suggests enabled commands only. Use category shortcuts for focused help.",
    usage: [
      "/help overview",
      "/help economy",
      "/help loans",
      "/help games",
      "/help admin",
      "/help config",
      "/help command name:<name>",
    ],
    examples: [
      "/help overview",
      "/help command name:blackjack",
      "/help command name:loan",
    ],
    category: "misc",
  },
};

export function enabledHelpDocs(): HelpDoc[] {
  // Use builders as the authoritative list of registered commands.
  const builders = allCommands();
  const enabled = builders
    .map((b: any) => b?.toJSON?.() ?? b)
    .filter((j: any) => j?.name && isEnabled(j.name));

  const docs: HelpDoc[] = [];
  for (const j of enabled) {
    const key = j.name as string;
    const e = EXT[key];
    if (e) {
      docs.push({ name: key, ...e });
    }
  }

  // Always include help itself if enabled
  if (!docs.find(d => d.name === "help") && isEnabled("help")) {
    docs.push({ name: "help", ...EXT.help });
  }

  return docs;
}

export function getDocByName(name: string): HelpDoc | undefined {
  const docs = enabledHelpDocs();
  // match exact, then try case-insensitive
  return docs.find(d => d.name === name)
      ?? docs.find(d => d.name.toLowerCase() === name.toLowerCase());
}

export function getDocsByCategory(category: string): HelpDoc[] {
  return enabledHelpDocs().filter(d => d.category === category);
}
