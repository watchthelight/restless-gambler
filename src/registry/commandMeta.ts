/**
 * Command Metadata Registry
 *
 * Single source of truth for all command help documentation.
 * Used by the /help system to generate consistent, clear help cards.
 */

export type OptionMeta = {
  name: string;
  type: 'string' | 'integer' | 'number' | 'boolean' | 'user' | 'channel' | 'role' | 'attachment' | 'subcommand' | 'subcommandgroup';
  required?: boolean;
  choices?: string[];
  default?: string | number | boolean;
  description: string;
};

export type Example = {
  slash: string;
  description?: string;
};

export type CommandMeta = {
  name: string;
  category: 'General' | 'Games' | 'Wallet' | 'Loans' | 'Ranks' | 'Admin' | 'Dev';
  short: string;
  long?: string;
  usage?: string;
  options?: OptionMeta[];
  cooldown?: string;
  permissions?: 'everyone' | 'admin' | 'super';
  visibility?: 'public' | 'adminOnly';
  notes?: string[];
  examples?: Example[];
};

export const COMMAND_META: CommandMeta[] = [
  // --- Wallet ---
  {
    name: 'balance',
    category: 'Wallet',
    short: 'Shows your wallet, credit score, and active loans.',
    usage: '/balance',
    permissions: 'everyone',
    visibility: 'public',
    examples: [
      { slash: '/balance', description: 'View your balance and credit score.' }
    ],
    notes: [
      'Use /daily to claim your daily bonus.',
      'Credit score affects loan APR and limits.'
    ]
  },
  {
    name: 'daily',
    category: 'Wallet',
    short: 'Claim your daily bonus (500 bolts).',
    usage: '/daily',
    cooldown: '24 hours',
    permissions: 'everyone',
    visibility: 'public',
    examples: [
      { slash: '/daily', description: 'Claim 500 bolts once per day.' }
    ],
    notes: ['Cooldown resets at the same time each day.']
  },
  {
    name: 'give',
    category: 'Wallet',
    short: 'Give bolts to another user (max 10% of your balance).',
    usage: '/give user:<user> amount:<amount>',
    cooldown: '5 seconds per user',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'user', type: 'user', required: true, description: 'Recipient of the bolts.' },
      { name: 'amount', type: 'integer', required: true, description: 'Amount to give (max 10% of your balance).' }
    ],
    examples: [
      { slash: '/give user:@friend amount:100', description: 'Give 100 bolts to a friend.' }
    ],
    notes: ['Amount is capped at 10% of your balance to prevent abuse.']
  },
  {
    name: 'transfer',
    category: 'Wallet',
    short: 'Transfer bolts to another user.',
    usage: '/transfer user:<user> amount:<amount>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'user', type: 'user', required: true, description: 'Recipient of the bolts.' },
      { name: 'amount', type: 'integer', required: true, description: 'Amount to transfer.' }
    ],
    examples: [
      { slash: '/transfer user:@friend amount:500', description: 'Transfer 500 bolts to a friend.' }
    ],
    notes: ['Must have sufficient balance.']
  },
  {
    name: 'leaderboard',
    category: 'General',
    short: 'Shows the top 10 balances in this server.',
    usage: '/leaderboard',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'scope', type: 'string', required: false, choices: ['global', 'server'], default: 'server', description: 'Leaderboard scope (server or global).' }
    ],
    examples: [
      { slash: '/leaderboard', description: 'View top 10 holders in this server.' }
    ],
    notes: ['The card pings the listed users.']
  },
  {
    name: 'gamble',
    category: 'Games',
    short: 'Wager bolts with fair odds (48% win chance).',
    usage: '/gamble amount:<amount>',
    cooldown: 'Configurable (default: none)',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'amount', type: 'integer', required: true, description: 'Amount to wager.' }
    ],
    examples: [
      { slash: '/gamble amount:100', description: 'Wager 100 bolts with 48% win chance.' }
    ],
    notes: [
      'Win: double your bet. Lose: lose your bet.',
      'Luck buffs from ranking up affect your odds.'
    ]
  },
  {
    name: 'cooldown',
    category: 'General',
    short: 'Shows your active cooldowns.',
    usage: '/cooldown',
    permissions: 'everyone',
    visibility: 'public',
    examples: [
      { slash: '/cooldown', description: 'List all active cooldowns.' }
    ]
  },
  {
    name: 'resetme',
    category: 'General',
    short: 'Reset your balance and stats to defaults.',
    usage: '/resetme',
    permissions: 'everyone',
    visibility: 'public',
    examples: [
      { slash: '/resetme', description: 'Reset your account (confirmation required).' }
    ],
    notes: ['This action cannot be undone.']
  },

  // --- Games ---
  {
    name: 'slots',
    category: 'Games',
    short: 'Play the slot machine with a 3×3 grid.',
    usage: '/slots bet:<amount>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'bet', type: 'integer', required: true, description: 'Amount to bet.' }
    ],
    examples: [
      { slash: '/slots bet:50', description: 'Spin the slots with a 50 bolt bet.' }
    ],
    notes: ['Match symbols to win. Payouts vary by symbol combination.']
  },
  {
    name: 'roulette',
    category: 'Games',
    short: 'Bet on red, black, green, or specific numbers.',
    usage: '/roulette bet:<amount> target:<red|black|green|0-36>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'bet', type: 'integer', required: true, description: 'Amount to bet.' },
      { name: 'target', type: 'string', required: true, description: 'red, black, green, or a number (0-36).' }
    ],
    examples: [
      { slash: '/roulette bet:100 target:red', description: 'Bet 100 bolts on red.' },
      { slash: '/roulette bet:50 target:17', description: 'Bet 50 bolts on number 17.' }
    ],
    notes: [
      'Red/black pays 2x, green pays 14x, numbers pay 36x.',
      'Green = 0 or 00.'
    ]
  },
  {
    name: 'blackjack',
    category: 'Games',
    short: 'Play blackjack against the dealer.',
    usage: '/blackjack bet:<amount>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'bet', type: 'integer', required: true, description: 'Amount to bet.' }
    ],
    examples: [
      { slash: '/blackjack bet:200', description: 'Play blackjack with a 200 bolt bet.' }
    ],
    notes: [
      'Dealer stands on 17.',
      'Blackjack pays 3:2.'
    ]
  },
  {
    name: 'holdem',
    category: 'Games',
    short: 'Play Texas Hold\'em poker.',
    usage: '/holdem bet:<amount>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'bet', type: 'integer', required: true, description: 'Amount to bet.' }
    ],
    examples: [
      { slash: '/holdem bet:150', description: 'Play Texas Hold\'em with a 150 bolt bet.' }
    ],
    notes: ['Standard poker hand rankings apply.']
  },

  // --- Loans ---
  {
    name: 'loan',
    category: 'Loans',
    short: 'Apply for and manage short-term loans.',
    usage: '/loan <subcommand>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'apply', type: 'subcommand', description: 'Request a loan with APR based on credit score.' },
      { name: 'pay', type: 'subcommand', description: 'Make a payment on your active loan.' },
      { name: 'details', type: 'subcommand', description: 'See all your active loans, APR, due dates, and remaining balance.' },
      { name: 'reminders', type: 'subcommandgroup', description: 'Enable or disable loan reminder notifications.' }
    ],
    examples: [
      { slash: '/loan apply amount:1000', description: 'Apply for a 1,000 bolt loan.' },
      { slash: '/loan details', description: 'View APR, due dates, and remaining balance.' },
      { slash: '/loan pay amount:500', description: 'Pay 500 bolts toward your loan.' },
      { slash: '/loan reminders on', description: 'Turn on loan reminder notifications.' }
    ],
    notes: [
      'Late payments increase APR and reduce future loan limits.',
      'Credit score improves with on-time payments.',
      'Reminder notices post in the first channel the bot was used in.'
    ]
  },

  // --- Ranks ---
  {
    name: 'rank',
    category: 'Ranks',
    short: 'Shows your level, XP progress, and active luck buff.',
    usage: '/rank view',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'view', type: 'subcommand', description: 'View your rank and XP.' },
      { name: 'leaderboard', type: 'subcommand', description: 'View top ranked users in this server.' }
    ],
    examples: [
      { slash: '/rank view', description: 'View your rank and XP progress.' },
      { slash: '/rank view user:@friend', description: 'View another user\'s rank.' },
      { slash: '/rank leaderboard', description: 'See the top 10 ranked users.' }
    ],
    notes: [
      'Earn XP by playing games.',
      'Ranking up grants a luck buff for 60 minutes.',
      'Luck buffs improve your odds in games.'
    ]
  },

  // --- Admin (hidden from non-admins) ---
  {
    name: 'admin',
    category: 'Admin',
    short: 'Bot administration commands.',
    long: 'Manage admins, config, migrations, command controls, and economy.',
    usage: '/admin <subcommand>',
    permissions: 'admin',
    visibility: 'adminOnly',
    options: [
      { name: 'add', type: 'subcommand', description: 'Add a guild admin (super only).' },
      { name: 'promote', type: 'subcommand', description: 'Promote a user to super admin (super only).' },
      { name: 'demote', type: 'subcommand', description: 'Demote a super admin to guild admin (super only).' },
      { name: 'remove', type: 'subcommand', description: 'Remove a guild admin (super only).' },
      { name: 'super-remove', type: 'subcommand', description: 'Remove a super admin (super only).' },
      { name: 'list', type: 'subcommand', description: 'List all super and guild admins.' },
      { name: 'whoami', type: 'subcommand', description: 'Show your admin role.' },
      { name: 'give', type: 'subcommand', description: 'Give currency to a user.' },
      { name: 'take', type: 'subcommand', description: 'Take currency from a user (not below 0).' },
      { name: 'reset', type: 'subcommand', description: 'Reset a user\'s balance and stats to defaults.' },
      { name: 'whitelist', type: 'subcommand', description: 'Temporarily allow only one command in this guild.' },
      { name: 'whitelist-release', type: 'subcommand', description: 'Exit whitelist mode (restore normal operation).' },
      { name: 'sync-commands', type: 'subcommand', description: 'Sync slash commands globally and purge guild duplicates.' },
      { name: 'reboot', type: 'subcommand', description: 'Reboot the bot (confirmation required).' },
      { name: 'toggles', type: 'subcommand', description: 'View or flip command toggles.' },
      { name: 'refresh-status', type: 'subcommand', description: 'Recompute counts and update the bot presence.' }
    ],
    examples: [
      { slash: '/admin whitelist command:ping', description: 'Whitelist only /ping (test mode).' },
      { slash: '/admin whitelist-release', description: 'Restore all commands.' },
      { slash: '/admin give user:@player amount:1000', description: 'Give 1,000 bolts to a player.' },
      { slash: '/admin take user:@player amount:500', description: 'Take 500 bolts from a player.' },
      { slash: '/admin reset user:@player', description: 'Reset a player\'s balance and stats.' },
      { slash: '/admin list', description: 'List all super and guild admins.' }
    ],
    notes: [
      'Admin commands are hidden from non-admins in help and autocomplete.',
      'Super admins can promote/demote other admins.',
      'Whitelist mode is useful for testing new commands.'
    ]
  },
  {
    name: 'rank-admin',
    category: 'Admin',
    short: 'Admin controls for the rank system.',
    usage: '/rank-admin <subcommand>',
    permissions: 'admin',
    visibility: 'adminOnly',
    options: [
      { name: 'set-xp', type: 'subcommand', description: 'Set a user\'s XP.' },
      { name: 'set-level', type: 'subcommand', description: 'Set a user\'s level.' },
      { name: 'grant-buff', type: 'subcommand', description: 'Grant a luck buff to a user.' }
    ],
    examples: [
      { slash: '/rank-admin set-xp user:@player xp:1000', description: 'Set a player\'s XP to 1000.' },
      { slash: '/rank-admin set-level user:@player level:10', description: 'Set a player\'s level to 10.' }
    ],
    notes: ['Admin rank commands are hidden from non-admins.']
  },
  {
    name: 'loan-admin',
    category: 'Admin',
    short: 'Admin controls for the loan system.',
    usage: '/loan-admin <subcommand>',
    permissions: 'admin',
    visibility: 'adminOnly',
    options: [
      { name: 'credit-reset', type: 'subcommand', description: 'Reset a user\'s credit score to default.' },
      { name: 'forgive', type: 'subcommand', description: 'Forgive all loans for a user.' }
    ],
    examples: [
      { slash: '/loan-admin credit-reset user:@player', description: 'Reset a player\'s credit score.' },
      { slash: '/loan-admin forgive user:@player', description: 'Forgive all loans and reset balance to 0.' }
    ],
    notes: ['Admin loan commands are hidden from non-admins.']
  },
  {
    name: 'config',
    category: 'Admin',
    short: 'View or modify bot configuration.',
    usage: '/config <subcommand>',
    permissions: 'admin',
    visibility: 'adminOnly',
    options: [
      { name: 'get', type: 'subcommand', description: 'View a config value.' },
      { name: 'set', type: 'subcommand', description: 'Set a config value.' }
    ],
    examples: [
      { slash: '/config get key:max_bet', description: 'View the max bet limit.' },
      { slash: '/config set key:max_bet value:5000', description: 'Cap max bet at 5,000 bolts.' },
      { slash: '/config set key:max_bet value:disable', description: 'Disable max bet limit.' }
    ],
    notes: ['Config changes take effect immediately.']
  },
  {
    name: 'dev',
    category: 'Dev',
    short: 'Developer utilities and debug commands.',
    usage: '/dev <subcommand>',
    permissions: 'super',
    visibility: 'adminOnly',
    options: [
      { name: 'demo', type: 'subcommand', description: 'Render a demo card.' }
    ],
    examples: [
      { slash: '/dev demo component:wallet', description: 'Render a demo wallet card.' }
    ],
    notes: ['Dev commands are only visible to super admins.']
  },
  {
    name: 'admin-repair',
    category: 'Dev',
    short: 'Repair admin database schema.',
    usage: '/admin-repair',
    permissions: 'super',
    visibility: 'adminOnly',
    examples: [
      { slash: '/admin-repair', description: 'Run admin schema repair.' }
    ],
    notes: ['Only super admins can run this command.']
  },

  // --- General ---
  {
    name: 'ping',
    category: 'General',
    short: 'Check if the bot is online.',
    usage: '/ping',
    permissions: 'everyone',
    visibility: 'public',
    examples: [
      { slash: '/ping', description: 'Check bot latency.' }
    ]
  },
  {
    name: 'theme',
    category: 'General',
    short: 'Change the visual theme for cards.',
    usage: '/theme set:<theme>',
    permissions: 'everyone',
    visibility: 'public',
    options: [
      { name: 'set', type: 'subcommand', description: 'Set the guild theme.' }
    ],
    examples: [
      { slash: '/theme set theme:dark', description: 'Set the guild theme to dark mode.' }
    ],
    notes: ['Theme affects all card visuals in this server.']
  },
  {
    name: 'canary',
    category: 'Dev',
    short: 'Test command for development.',
    usage: '/canary',
    permissions: 'super',
    visibility: 'adminOnly',
    examples: [
      { slash: '/canary', description: 'Run canary test.' }
    ],
    notes: ['Only super admins can run this command.']
  }
];

/**
 * Get command metadata by name.
 * Returns undefined if not found.
 */
export function getCommandMeta(name: string): CommandMeta | undefined {
  return COMMAND_META.find(cmd => cmd.name === name);
}

/**
 * Get all commands visible to a user based on admin status.
 * @param isAdmin - Whether the user is an admin or super admin
 * @returns Filtered command metadata
 */
export function getVisibleCommands(isAdmin: boolean): CommandMeta[] {
  return COMMAND_META.filter(cmd => {
    if (cmd.visibility === 'adminOnly') return isAdmin;
    return true;
  });
}

/**
 * Get commands grouped by category.
 * @param isAdmin - Whether the user is an admin or super admin
 * @returns Commands grouped by category
 */
export function getCommandsByCategory(isAdmin: boolean): Map<string, CommandMeta[]> {
  const visible = getVisibleCommands(isAdmin);
  const grouped = new Map<string, CommandMeta[]>();

  for (const cmd of visible) {
    const cat = cmd.category;
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(cmd);
  }

  return grouped;
}
