// UPDATE FILE: src/commands/shared/walletView.ts
import { EmbedBuilder } from "discord.js";
import { themedEmbed } from "../../ui/embeds.js";

type WalletViewArgs = {
  title?: string;
  headline?: string;     // e.g., "WIN +300 🪙. New balance:"
  pretty: string;        // formatted short (1.01k)
  exact: string;         // exact with commas (1,010)
};

export function walletEmbed(a: WalletViewArgs) {
  const desc = [
    a.headline ? `${a.headline} ${a.pretty}` : a.pretty,
    "",
    `\`exact: ${a.exact} 🪙\``,
  ].join("\n");
  return themedEmbed('neutral', a.title ?? 'Wallet', desc);
}

