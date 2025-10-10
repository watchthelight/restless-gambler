import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, AttachmentBuilder, MessageFlags } from 'discord.js';
import { themedEmbed } from '../ui/embeds.js';
import { getGuildTheme } from '../ui/theme.js';
import { generateCard } from '../ui/cardFactory.js';

export const data = new SlashCommandBuilder()
  .setName('dev')
  .setDescription('Developer tools')
  .addSubcommand((sc) => sc.setName('demo').setDescription('Render a demo card').addStringOption((o) => o.setName('component').setRequired(true).setDescription('Component: notice|list|wallet|slots|roulette|blackjack')));

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
    await interaction.reply({ content: 'Admin only.' });
    return;
  }
  const theme = getGuildTheme(interaction.guildId);
  const comp = interaction.options.getString('component', true);
  let buffer: Buffer, filename: string;
  switch (comp) {
    case 'notice': {
      const card = await generateCard({ layout: 'Notice', theme, payload: { title: 'Demo', message: 'This is a demo notice card.' } });
      buffer = card.buffer; filename = card.filename; break;
    }
    case 'wallet': {
      const card = await generateCard({ layout: 'Wallet', theme, payload: { balance: 123456, title: 'Wallet', subtitle: 'Demo' } });
      buffer = card.buffer; filename = card.filename; break;
    }
    case 'list': {
      const card = await generateCard({ layout: 'List', theme, payload: { rows: Array.from({ length: 10 }).map((_, i) => ({ rank: i + 1, user: `User${i + 1}`, value: (10 - i) * 1000 })) } });
      buffer = card.buffer; filename = card.filename; break;
    }
    case 'slots': {
      const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'slots', grid: [['7','7','7'],['BAR','W','BAR'],['A','A','A']], bet: 100, payout: 300, delta: 200, balance: 1000 } });
      buffer = card.buffer; filename = card.filename; break;
    }
    case 'roulette': {
      const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'roulette', number: 17, color: 'black', bet: 50, payout: 0, delta: -50, balance: 950 } });
      buffer = card.buffer; filename = card.filename; break;
    }
    case 'blackjack': {
      const card = await generateCard({ layout: 'GameResult', theme, payload: { kind: 'blackjack', dealer: ['K♠', '??'], player: ['10♥','A♦'], bet: 100, payout: 250, delta: 150, balance: 1150 } });
      buffer = card.buffer; filename = card.filename; break;
    }
    default:
      await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Unknown component.' });
      return;
  }
  const file = new AttachmentBuilder(buffer, { name: filename });
  const embed = themedEmbed(theme, 'Demo', comp).setImage(`attachment://${filename}`);
  await interaction.reply({ embeds: [embed], files: [file] });
}
