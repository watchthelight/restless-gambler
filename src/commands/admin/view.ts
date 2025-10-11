import { EmbedBuilder, Guild } from "discord.js";

export function adminListEmbed(opts: {
  guild: Guild;
  superIds: string[];
  adminIds: string[];
  resolveMention: (uid: string) => string;
}) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const superMentions = opts.superIds.length === 0
    ? "(none)"
    : opts.superIds.map(id => opts.resolveMention(id)).join(", ");
  const adminMentions = opts.adminIds.length === 0
    ? "(none)"
    : opts.adminIds.map(id => opts.resolveMention(id)).join(", ");

  const description = `**Global SUPER:** ${superMentions}\n**Guild ADMIN:** ${adminMentions}`;

  return new EmbedBuilder()
    .setTitle("ℹ️ Admins")
    .setDescription(description)
    .setThumbnail(opts.guild.iconURL() || null)
    .setColor(0x5865F2)
    .setFooter({ text: `${opts.guild.name} • Today at ${timeStr}` });
}

