import { EmbedBuilder } from "discord.js";

export function adminListEmbed(opts: {
  superId: string;
  admins: Array<{ userId: string; addedAt: number }>; // addedAt in ms
  resolveMention: (uid: string) => string;
}) {
  const date = (ts: number) => new Date(ts).toISOString().slice(0, 10);

  const superLine = `**Super Admin**\n${opts.resolveMention(opts.superId)} (Super Admin)`;
  const adminLines = opts.admins.length === 0
    ? "_No current admins_"
    : opts.admins.map(a => `• ${opts.resolveMention(a.userId)} — ${date(a.addedAt)}`).join("\n");

  return new EmbedBuilder()
    .setTitle("Admin List")
    .setDescription([superLine, "", "**Current Admins**", adminLines].join("\n"))
    .setColor(0x5865F2);
}

