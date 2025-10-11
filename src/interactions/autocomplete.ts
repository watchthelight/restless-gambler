import { AutocompleteInteraction } from "discord.js";
import { allCommandNamesIncludingDisabled } from "../registry/util-builders.js";
import { isEnabled } from "../config/toggles.js";

function score(needle: string, hay: string): number {
  const n = String(needle || "").toLowerCase();
  const h = hay.toLowerCase();
  if (!n) return 100 - h.length; // shorter first when empty query
  if (h.startsWith(n)) return 100 - (h.length - n.length);
  const idx = h.indexOf(n);
  return idx === -1 ? -1 : 50 - idx;
}

export async function handleAutocomplete(interaction: AutocompleteInteraction) {
  if (interaction.commandName !== "admin") return;
  const sub = interaction.options.getSubcommand(false);
  if (sub !== "toggles") return;
  const focused = interaction.options.getFocused(true);
  if (focused.name !== "command") return;

  const q = String(focused.value ?? "").trim();
  const names = allCommandNamesIncludingDisabled();
  const entries = names
    .map((name) => ({ name, enabled: isEnabled(name), score: score(q, name) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => (Number(b.enabled) - Number(a.enabled)) || (b.score - a.score) || a.name.localeCompare(b.name))
    .slice(0, 25)
    .map((x) => ({
      name: `${x.enabled ? "✅" : "🚫"} /${x.name}${x.enabled ? "" : " (disabled)"}`,
      value: x.name,
    }));

  await interaction.respond(entries).catch(() => { /* ignore send failures */ });
}

