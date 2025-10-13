/**
 * /rank Command
 * Show user's level, XP progress, and active luck buff
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getRank, getLuckBuff, getTopRankedUsers } from "../../rank/store.js";
import { xpNeededFor, calculateProgress, formatProgressBar } from "../../rank/math.js";
import { getGuildDb } from "../../db/connection.js";
import { getSetting, getSettingNum } from "../../db/kv.js";
import { getGuildTheme } from "../../ui/theme.js";
import { themedEmbed } from "../../ui/embeds.js";
import { ensureGuildInteraction } from "../../interactions/guards.js";
import { getUserMeta } from "../../util/userMeta.js";

export const data = new SlashCommandBuilder()
  .setName("rank")
  .setDescription("View rank and XP progression")
  .addSubcommand((sc) =>
    sc
      .setName("view")
      .setDescription("View your rank and XP")
      .addUserOption((o) =>
        o
          .setName("user")
          .setDescription("View someone else's rank")
          .setRequired(false)
      )
  )
  .addSubcommand((sc) =>
    sc.setName("leaderboard").setDescription("Top ranked users in this server")
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await ensureGuildInteraction(interaction))) return;

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === "view" || !sub) {
    await handleView(interaction, guildId);
  } else if (sub === "leaderboard") {
    await handleLeaderboard(interaction, guildId);
  }
}

async function handleView(
  interaction: ChatInputCommandInteraction,
  guildId: string
) {
  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const db = getGuildDb(guildId);
  const theme = getGuildTheme(guildId);

  // Get user's rank
  const { level, xp } = getRank(guildId, targetUser.id);

  // Get config
  const curve = (getSetting(db, "rank_curve") ?? "quadratic") as any;
  const maxLevel = getSettingNum(db, "rank_max_level", 999999);

  // Calculate XP needed for next level
  const xpNeeded = xpNeededFor(level, curve, maxLevel);
  const progress = calculateProgress(xp, xpNeeded);
  const progressBar = formatProgressBar(xp, xpNeeded, 15);

  // Get luck buff
  const buff = getLuckBuff(guildId, targetUser.id);
  const luckText = buff
    ? `Active: **+${(buff.luck_bps / 100).toFixed(2)}%** luck`
    : "No active buff";

  const timeRemaining = buff
    ? Math.max(0, Math.floor((buff.expires_at - Date.now()) / 1000))
    : 0;
  const timeText =
    timeRemaining > 0
      ? `${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s remaining`
      : "";

  // Build embed
  const embed = themedEmbed(theme, `Rank - ${targetUser.username}`, "")
    .addFields(
      {
        name: "Level",
        value: `**${level}**`,
        inline: true,
      },
      {
        name: "XP Progress",
        value: `${xp} / ${xpNeeded} (${progress.toFixed(1)}%)`,
        inline: true,
      },
      { name: "\u200b", value: "\u200b", inline: true },
      {
        name: "Progress Bar",
        value: `\`${progressBar}\``,
        inline: false,
      },
      {
        name: "Luck Buff",
        value: `${luckText}${timeText ? `\n${timeText}` : ""}`,
        inline: false,
      }
    )
    .setThumbnail(targetUser.displayAvatarURL());

  // Always show next reward preview (levels are infinite)
  const luckBonus = getSettingNum(db, "luck_bonus_bps", 150);
  const luckDuration = getSettingNum(db, "luck_duration_sec", 3600);
  embed.addFields({
    name: "Next Rank Reward",
    value: `+${(luckBonus / 100).toFixed(2)}% luck for ${Math.floor(luckDuration / 60)} minutes`,
    inline: false,
  });

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(
  interaction: ChatInputCommandInteraction,
  guildId: string
) {
  const theme = getGuildTheme(guildId);
  const top = getTopRankedUsers(guildId, 10);

  if (top.length === 0) {
    await interaction.reply({
      content: "No ranked users yet. Start gambling to earn XP!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Build leaderboard embed
  const embed = themedEmbed(
    theme,
    "Rank Leaderboard",
    "Top 10 ranked users in this server"
  );

  // Add fields for each user
  let description = "";
  for (let i = 0; i < top.length; i++) {
    const rank = top[i];
    const meta = await getUserMeta(
      interaction.client,
      guildId,
      rank.user_id
    );
    const position = i + 1;
    const medal = position === 1 ? "🥇" : position === 2 ? "🥈" : position === 3 ? "🥉" : `${position}.`;

    description += `${medal} **${meta.displayName}** - Level ${rank.level} (${rank.xp} XP)\n`;
  }

  embed.setDescription(description);

  await interaction.reply({ embeds: [embed] });
}
