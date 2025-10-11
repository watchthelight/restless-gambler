import { Client, TextChannel } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { getDbPaths, getGuildDb } from "../db/connection.js";
import { accrueOnTouch, getReminderChannelId, getUserPrefs, listLateOrDueLoans, setLoanReminderMeta } from "./store.js";
import { getReminderPref } from "./prefs.js";
import { formatBolts } from "../economy/currency.js";
import type { Loan } from "./types.js";

const INTERVAL = parseInt(process.env.LOAN_REMINDER_INTERVAL_MS ?? "600000", 10);
const ENABLED = (process.env.LOAN_REMINDERS_ENABLED ?? "true").toLowerCase() !== "false";
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000; // once per day per loan

function enumerateGuildIds(): string[] {
  const { data_dir } = getDbPaths();
  if (!fs.existsSync(data_dir)) return [];
  const files = fs.readdirSync(data_dir).filter((f) => f.endsWith(".db"));
  return files.map((f) => path.basename(f, ".db"));
}

export async function runOneGuildReminderSweep(client: Client, guildId: string, log: any = console): Promise<number> {
  const now = Date.now();
  // Ensure DB is opened/migrated
  getGuildDb(guildId);
  const rows = listLateOrDueLoans(guildId, now);
  let sent = 0;
  for (const row of rows) {
    try {
      // Build Loan object from row
      const loan: Loan = {
        id: String(row.id),
        user_id: String(row.user_id),
        principal: BigInt(row.principal || 0),
        apr_bps: Number(row.apr_bps || 0),
        term_days: Number(row.term_days || 0),
        start_ts: Number(row.start_ts || 0),
        due_ts: Number(row.due_ts || 0),
        accrued_interest: BigInt(row.accrued_interest || 0),
        paid_principal: BigInt(row.paid_principal || 0),
        paid_interest: BigInt(row.paid_interest || 0),
        status: String(row.status || 'active') as any,
        last_accrual_ts: Number(row.last_accrual_ts || row.start_ts || 0),
        created_at: Number(row.created_at || 0),
      };

      // Lazy accrual + status transition
      const updated = accrueOnTouch(guildId, loan, now);

      // User prefs and throttling
      if (!getReminderPref(guildId, updated.user_id)) continue; // respect opt-out
      const prefs = getUserPrefs(guildId, updated.user_id);
      if (prefs?.remind === 0) continue;
      if (prefs?.snooze_until_ts && Number(prefs.snooze_until_ts) > now) continue;
      if (row.last_reminder_ts && now - Number(row.last_reminder_ts) < REMIND_EVERY_MS) continue;

      const remaining = (updated.principal - updated.paid_principal) + (updated.accrued_interest - updated.paid_interest);
      const dueRel = `<t:${Math.floor(updated.due_ts / 1000)}:R>`;
      const overdue = now > updated.due_ts || String(updated.status) === 'late' || String(updated.status) === 'defaulted';
      const title = overdue ? "Loan overdue" : "Loan due soon";
      const line = `${title}: ${formatBolts(remaining)} due ${dueRel} at ${(updated.apr_bps / 100).toFixed(2)}% APR\n` +
        `Pay with **/loan pay amount:** or use quick buttons on your last loan card.`;

      // Try DM first
      let delivered = false;
      try {
        const user = await client.users.fetch(updated.user_id);
        await user.send(`📌 ${line}`);
        delivered = true;
      } catch (e: any) {
        // DM closed; try guild channel if configured
        try {
          const chanId = getReminderChannelId(guildId);
          if (chanId) {
            const chan = await client.channels.fetch(chanId);
            if (chan && chan.isTextBased()) {
              await (chan as TextChannel).send(`<@${updated.user_id}> ${line}`);
              delivered = true;
            }
          }
        } catch { /* ignore */ }
      }

      if (delivered) {
        setLoanReminderMeta(guildId, updated.id, now);
        log.info?.({ msg: "loan_reminder_sent", loanId: updated.id, userId: updated.user_id });
        sent += 1;
      }
    } catch (e: any) {
      log.warn?.({ msg: "loan_reminders_error", guildId, error: String(e?.message || e) });
    }
  }
  return sent;
}

export function startLoanReminderLoop(client: Client, log: any = console) {
  if (!ENABLED) {
    log.info?.({ msg: "loan_reminders_disabled" });
    return;
  }
  const tick = async () => {
    try {
      const guildIds = enumerateGuildIds();
      let total = 0;
      for (const gid of guildIds) {
        total += await runOneGuildReminderSweep(client, gid, log);
      }
      // Optional summary
      if (total > 0) log.info?.({ msg: "loan_reminders_sweep", sent: total, guilds: guildIds.length });
    } catch (err: any) {
      log.warn?.({ msg: "loan_reminders_error", err: String(err) });
    }
  };
  setTimeout(tick, 5000);
  setInterval(tick, Math.max(30_000, INTERVAL | 0));
}
