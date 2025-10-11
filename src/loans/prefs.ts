import { getGuildDb } from "../db/connection.js";

export function getReminderPref(guildId: string, userId: string): boolean {
  const db = getGuildDb(guildId);
  const row = db
    .prepare(
      "SELECT loan_due_reminders FROM user_notification_prefs WHERE user_id = ? AND guild_id = ?",
    )
    .get(userId, guildId) as { loan_due_reminders?: number } | undefined;
  return row?.loan_due_reminders !== 0; // default ON
}

export function setReminderPref(guildId: string, userId: string, on: boolean) {
  const db = getGuildDb(guildId);
  db.prepare(
    `INSERT INTO user_notification_prefs(user_id,guild_id,loan_due_reminders,updated_at)
     VALUES(?,?,?,?)
     ON CONFLICT(user_id,guild_id) DO UPDATE SET loan_due_reminders=excluded.loan_due_reminders, updated_at=excluded.updated_at`,
  ).run(userId, guildId, on ? 1 : 0, Date.now());
}

