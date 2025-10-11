/**
 * /rank-admin Command
 * Admin tools for managing user ranks
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import {
  getRank,
  setRank,
  addXP,
  resetRank,
  applyXpDecay,
} from "../../rank/store.js";
import { ensureGuildInteraction } from "../../interactions/guards.js";
import { requireAdmin } from "../../admin/guard.js";
import { makePublicAdmin } from "../util/adminBuilder.js";

export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName("rank-admin")
    .setDescription("Admin rank management tools • v2")
)
  .addSubcommand((sc) =>
    sc
      .setName("set-level")
      .setDescription("Set a user's level")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target user").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("level")
          .setDescription("New level")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(1000)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("add-xp")
      .setDescription("Add XP to a user")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target user").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("xp")
          .setDescription("XP to add")
          .setRequired(true)
          .setMinValue(1)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("set-xp")
      .setDescription("Set a user's XP directly")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target user").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("xp")
          .setDescription("New XP value")
          .setRequired(true)
          .setMinValue(0)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("reset")
      .setDescription("Reset a user's rank completely")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target user").setRequired(true)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("decay")
      .setDescription("Apply XP decay to a user")
      .addUserOption((o) =>
        o.setName("user").setDescription("Target user").setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("percent")
          .setDescription("Decay percentage (0-100)")
          .setRequired(true)
          .setMinValue(0)
          .setMaxValue(100)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await ensureGuildInteraction(interaction))) return;

  // Check admin permissions
  try {
    await requireAdmin(interaction);
  } catch (e: any) {
    await interaction.reply({
      content: "Admin permissions required.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;
  const targetUser = interaction.options.getUser("user", true);

  try {
    switch (sub) {
      case "set-level": {
        const level = interaction.options.getInteger("level", true);
        const { xp } = getRank(guildId, targetUser.id);
        setRank(guildId, targetUser.id, level, xp);

        await interaction.reply({
          content: `Set ${targetUser.tag}'s level to **${level}**`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "add-xp": {
        const xpToAdd = interaction.options.getInteger("xp", true);
        const result = addXP(guildId, targetUser.id, xpToAdd);

        let response = `Added **${xpToAdd} XP** to ${targetUser.tag}`;
        if (result.leveled) {
          response += `\nLeveled up: ${result.previousLevel} → **${result.level}**!`;
        } else {
          response += `\nNew level: **${result.level}** (${result.xp} XP)`;
        }

        await interaction.reply({
          content: response,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "set-xp": {
        const newXp = interaction.options.getInteger("xp", true);
        const { level } = getRank(guildId, targetUser.id);
        setRank(guildId, targetUser.id, level, newXp);

        await interaction.reply({
          content: `Set ${targetUser.tag}'s XP to **${newXp}**`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "reset": {
        resetRank(guildId, targetUser.id);

        await interaction.reply({
          content: `Reset ${targetUser.tag}'s rank to level 1 with 0 XP`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      case "decay": {
        const percent = interaction.options.getInteger("percent", true);
        const result = applyXpDecay(guildId, targetUser.id, percent);

        await interaction.reply({
          content: `Applied **${percent}% XP decay** to ${targetUser.tag}\nNew rank: Level ${result.level}, ${result.xp} XP`,
          flags: MessageFlags.Ephemeral,
        });
        break;
      }

      default:
        await interaction.reply({
          content: "Unknown subcommand",
          flags: MessageFlags.Ephemeral,
        });
    }
  } catch (error: any) {
    console.error("rank-admin error:", error);
    await interaction.reply({
      content: `Error: ${error.message || "Unknown error"}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
