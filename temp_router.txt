import type { Client, Interaction, ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { getSlashCommands } from "../commands/slash/index.js";
import { getGuildDb } from "../db/connection.js";
import { getCommandControl } from "../db/commandControl.js";
import { isSuperAdmin } from "../admin/permissions.js";
import { isEnabled, reason as disabledReason } from "../config/toggles.js";

export function initInteractionRouter(client: Client) {
  client.on("interactionCreate", async (i: Interaction) => {
    try {
      if (!("isChatInputCommand" in i) || !(i as any).isChatInputCommand()) return;
      const name = (i as any).commandName as string;
      let sub: string | null = null;
      try { sub = (i as any).options?.getSubcommand?.(false) ?? null; } catch { sub = null; }

      // Per-guild whitelist mode
      if ((i as any).guildId) {
        try {
          const db = getGuildDb((i as any).guildId);
          const cc = getCommandControl(db, (i as any).guildId);
          const cmd = name.toLowerCase();
          const isEscapeHatch = (cmd === "admin" && ((sub?.toLowerCase?.() ?? null) === "whitelist-release"));
          let isSuper = false;
          try { isSuper = isSuperAdmin(db, (i as any).user?.id); } catch { isSuper = false; }
          if (cc.mode === "whitelist" && !isEscapeHatch && !isSuper) {
            const allowed: string[] = JSON.parse(cc.whitelist_json || "[]").map((s: string) => s.toLowerCase());
            if (!allowed.includes(cmd)) {
              await (i as any).reply({ content: "Command disabled (whitelist mode active). Use `/admin whitelist-release` to restore normal operation.", flags: MessageFlags.Ephemeral }).catch(() => { });
              return;
            }
          }
        } catch { /* ignore */ }
      }

      if (!isEnabled(name)) {
        const r = disabledReason(name);
        await (i as any).reply({ content: "— /" + name + " is currently disabled" + (r ? (" — " + r) : "") + "." }).catch(() => { });
        return;
      }

      const cmd = getSlashCommands().find((c) => c.name === name);
      if (!cmd) {
        await (i as any).reply({ content: "Unknown command.", flags: MessageFlags.Ephemeral }).catch(() => { });
        return;
      }
      await cmd.run(i as ChatInputCommandInteraction);
    } catch (e) {
      const s = String((e as any)?.message || e);
      const DUP = /already been sent or deferred|Unknown interaction|40060/;
      if (DUP.test(s)) return;
      try {
        if (!(i as any).replied && !(i as any).deferred) await (i as any).reply({ content: "Something went wrong." }).catch(() => { });
      } catch { }
    }
  });
}
