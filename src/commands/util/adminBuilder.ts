/**
 * Helper utilities for admin command builders
 * Makes admin commands visible to all users (discoverable in slash UI)
 * but blocks execution at runtime via bot admin DB checks
 */

import { SlashCommandBuilder } from "discord.js";

/**
 * Makes a command visible to all users but requires guild context
 * Used for admin commands that should be discoverable but runtime-gated
 *
 * This removes Discord permission requirements so everyone can see the command,
 * but execution is blocked by runtime checks (requireAdmin/requireSuper)
 *
 * @param builder - The command builder to modify
 * @returns The same builder for chaining
 */
export function makePublicAdmin(builder: SlashCommandBuilder): SlashCommandBuilder {
  return builder
    .setDefaultMemberPermissions(null) // Visible to all users
    .setDMPermission(false); // Requires guild (for guild-scoped admin DB)
}
