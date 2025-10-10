import { describeAmount } from "../util/amountRender.js";
import { MessageFlags } from 'discord.js';

export async function onAmountExact(interaction: any) {
    const raw = interaction.customId.split(":")[2];
    const v = BigInt(raw);
    const d = describeAmount(v);
    const lines = [
        `**Exact:** ${d.exact}`,
        `**Scientific:** ${d.scientific}`,
        d.unit ? `**Unit:** ${d.unit.abbr} = ${d.unit.name} (10^${d.unit.exponent})` : ""
    ].filter(Boolean).join("\n");
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: lines });
}

export async function onAmountCopy(interaction: any) {
    const raw = interaction.customId.split(":")[2];
    await interaction.reply({ flags: MessageFlags.Ephemeral, content: `\`${raw}\`\nSelect and copy.` });
}
