import { ChatInputCommandInteraction, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder, PermissionFlagsBits } from 'discord.js';
import * as Canary from './canary.js';
import * as HelpNew from '../help/index.js';
import * as SlotsCmd from '../../games/slots/commands.js';
import * as RouletteCmd from '../../games/roulette/commands.js';
import * as BlackjackSlash from './blackjack.js';
import { commands as EconCommands, handleEconomy } from '../economy.js';
import { data as ConfigCommand, handleConfig } from '../config.js';
import * as HoldemCmds from '../../games/holdem/commands.js';
import * as DevCmd from '../dev.js';
import * as AdminCmd from '../admin/index.js';
import * as LoanCmd from '../loan/index.js';
import { requireAdmin } from '../../admin/guard.js';
import * as AdminRepair from './admin-repair.js';
import * as Ping from './ping.js';
import * as Theme from './theme.js';
import * as RankCmd from '../rank/index.js';
import * as RankAdminCmd from '../rank/admin.js';
import * as LoanAdminCmd from '../loan-admin/index.js';
import * as BugReportCmd from '../bugreport/index.js';

type Builder = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
type Slash = { name: string; data: Builder; run: (i: ChatInputCommandInteraction) => Promise<void> };

// New help system with AmariBot-style cards
const HelpSlash: Slash = { name: HelpNew.data.name, data: HelpNew.data as Builder, run: HelpNew.execute };

// Dev demo (flat command) -> delegates to /dev demo
const DevDemo: Slash = {
  name: 'dev-demo',
  data: new SlashCommandBuilder()
    .setName('dev-demo')
    .setDescription('Render a demo card (admin only) • v2')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false)
    .addStringOption((o) => o.setName('component').setDescription('notice|list|wallet|slots|roulette|blackjack').setRequired(true)),
  run: async (i) => {
    await requireAdmin(i);
    // Transform to /dev demo
    (i as any).options.getSubcommand = () => 'demo';
    await DevCmd.execute(i as any);
  },
};

// Admin reboot (flat command) -> direct implementation
const AdminReboot: Slash = {
  name: 'admin-reboot',
  data: new SlashCommandBuilder()
    .setName('admin-reboot')
    .setDescription('Reboot the bot (admin only) • v2')
    .setDefaultMemberPermissions(null)
    .setDMPermission(false),
  run: async (i) => {
    await requireAdmin(i);
    // Import dependencies
    const { setRebootMarker } = await import('../../admin/rebootMarker.js');
    const { replyCard } = await import('../../lib/replyCard.js');
    const { isTestEnv } = await import('../../util/env.js');
    const fs = await import('node:fs');

    // Mark reboot return channel for confirmation
    try {
      await setRebootMarker({ guildId: i.guildId!, channelId: i.channelId });
    } catch {}

    await replyCard(i, {
      title: 'Rebooting…',
      description: 'The bot will restart shortly.'
    });

    try { fs.writeFileSync('.reboot.flag', '1'); } catch {}
    if (!isTestEnv()) {
      try { process.exit(0); } catch {}
    }
  },
};

export function getSlashCommands(): Slash[] {
  const out: Slash[] = [];
  const add = (s: Slash) => {
    if (out.find((x) => x.name === s.name)) return; // skip duplicates, keep first
    out.push(s);
  };

  add({ name: Canary.data.name, data: Canary.data as Builder, run: Canary.run });
  add(HelpSlash);
  // Help categories unified under /help subcommands
  add(DevDemo);
  add(AdminReboot);
  add({ name: AdminRepair.data.name, data: AdminRepair.data as Builder, run: AdminRepair.run });
  add({ name: LoanCmd.data.name, data: LoanCmd.data as Builder, run: LoanCmd.execute as any });
  add({ name: Ping.data.name, data: Ping.data as Builder, run: Ping.run });
  add({ name: Theme.data.name, data: Theme.data as Builder, run: Theme.execute as any });
  // Economy set (skip built-in help to avoid duplicate)
  for (const cmd of EconCommands) {
    if (cmd.name === 'help') continue;
    add({ name: cmd.name, data: cmd as Builder, run: handleEconomy as any });
  }
  // Config
  add({ name: ConfigCommand.name, data: ConfigCommand as Builder, run: handleConfig as any });
  // Games
  add({ name: SlotsCmd.data.name, data: SlotsCmd.data as Builder, run: SlotsCmd.execute as any });
  add({ name: RouletteCmd.data.name, data: RouletteCmd.data as Builder, run: RouletteCmd.execute as any });
  add({ name: BlackjackSlash.data.name, data: BlackjackSlash.data as Builder, run: BlackjackSlash.execute as any });
  add({ name: HoldemCmds.data.name, data: HoldemCmds.data as Builder, run: HoldemCmds.execute as any });
  // Admin original (subcommands) and Dev original (names differ from flat ones)
  add({ name: DevCmd.data.name, data: DevCmd.data as Builder, run: DevCmd.execute as any });
  add({ name: AdminCmd.data.name, data: AdminCmd.data as Builder, run: AdminCmd.execute as any });
  // Rank system
  add({ name: RankCmd.data.name, data: RankCmd.data as Builder, run: RankCmd.execute as any });
  add({ name: RankAdminCmd.data.name, data: RankAdminCmd.data as Builder, run: RankAdminCmd.execute as any });
  add({ name: LoanAdminCmd.data.name, data: LoanAdminCmd.data as Builder, run: LoanAdminCmd.execute as any });
  add({ name: BugReportCmd.data.name, data: BugReportCmd.data as Builder, run: BugReportCmd.execute as any });
  return out;
}

// Single source of truth for command data
export function allCommands(): (Builder)[] {
  const cmds = getSlashCommands();
  return cmds.map((c) => c.data);
}
