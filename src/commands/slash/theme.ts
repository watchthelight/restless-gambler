import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getGuildDb } from '../../db/connection.js';
import { getThemeByName, Themes } from '../../ui/theme.js';
import { themedEmbed } from '../../ui/embeds.js';
import { generateCard } from '../../ui/cardFactory.js';
import { AttachmentBuilder } from 'discord.js';
import { getSetting, setSetting } from '../../db/kv.js';

export const data = new SlashCommandBuilder()
  .setName('theme')
  .setDescription('Get or set guild theme and cards style')
  .addSubcommand((s) => s.setName('get').setDescription('Show current theme and cards style'))
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Set theme')
      .addStringOption((o) => {
        let builder = o.setName('theme').setDescription('Theme preset').setRequired(true);
        // Offer canonical themes + friendly aliases
        const names = Object.keys(Themes);
        for (const n of names) builder = builder.addChoices({ name: n, value: n });
        builder = builder.addChoices(
          { name: 'classic', value: 'midnight' },
          { name: 'night', value: 'midnight' },
          { name: 'neon', value: 'neon' },
          { name: 'mono', value: 'slate' },
        );
        return builder;
      }),
  )
  .addSubcommand((s) =>
    s
      .setName('cards-style')
      .setDescription('Set playing cards style')
      .addStringOption((o) =>
        o
          .setName('style')
          .setDescription('emoji or image')
          .setRequired(true)
          .addChoices(
            { name: 'emoji (Unicode suits)', value: 'unicode' },
            { name: 'image (rendered)', value: 'image' },
          ),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Guild-only command.' });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  console.info(
    JSON.stringify({
      msg: 'interaction_theme',
      name: interaction.commandName,
      sub,
      options: (interaction.options as any)?._hoistedOptions?.map((x: any) => ({ name: x.name, value: x.value })) ?? [],
      guildId: interaction.guildId || null,
    }),
  );
  const db = getGuildDb(interaction.guildId);
  if (sub === 'get') {
    const themeName = getSetting(db, 'theme') || 'midnight';
    const theme = getThemeByName(themeName);
    const emb = themedEmbed(theme, 'Theme', `Current theme: ${theme.name}`);
    const card = await generateCard({ layout: 'Wallet', theme, payload: { balance: 0, title: 'Theme Preview', subtitle: theme.name } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    await interaction.reply({ embeds: [emb.setImage(`attachment://${card.filename}`)], files: [file] });
  } else if (sub === 'set') {
    const name = interaction.options.getString('theme', true);
    const theme = getThemeByName(name);
    setSetting(db, 'theme', theme.name);
    const emb = themedEmbed(theme, 'Theme Updated', `Theme set to: ${theme.name}`);
    const card = await generateCard({ layout: 'Wallet', theme, payload: { balance: 0, title: 'Theme Preview', subtitle: theme.name } });
    const file = new AttachmentBuilder(card.buffer, { name: card.filename });
    await interaction.reply({ embeds: [emb.setImage(`attachment://${card.filename}`)], files: [file] });
  } else if (sub === 'cards-style') {
    const style = interaction.options.getString('style', true) as 'unicode' | 'image';
    setSetting(db, 'cards_style', style);
    await interaction.reply({ content: `Cards style set to ${style}.` });
  } else {
    await interaction.reply({ content: 'Unknown subcommand.' });
  }
}
