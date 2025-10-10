import { EmbedBuilder } from "discord.js";

type WalletViewArgs = {
  title?: string;
  headline?: string;     // e.g., "WIN +300 🪙. New balance:"
  pretty: string;        // formatted short (1.01k)
  exact: string;         // exact with commas (1,010)
};

export function walletEmbed(a: WalletViewArgs) {
  return new EmbedBuilder()
    .setTitle(a.title ?? "Wallet")
    .setDescription([
      a.headline ? `${a.headline} ${a.pretty}` : a.pretty,
      "",
      `\`exact: ${a.exact} 🪙\``,
    ].join("\n"))
    .setColor(0x0f192a);
}

