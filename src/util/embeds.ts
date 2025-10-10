import { EmbedBuilder, Colors } from 'discord.js';

export function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Blurple)
    .setFooter({
      text: 'Play-money only. No real-money gambling.',
    });
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Red)
    .setTitle('Oops!')
    .setDescription(message)
    .setFooter({ text: 'Play-money only. No real-money gambling.' });
}

