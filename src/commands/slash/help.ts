import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { themedEmbed } from '../../ui/embeds.js';
import { getGuildTheme } from '../../ui/theme.js';
import { respondOnce } from '../../util/interactions.js';

export const data = new SlashCommandBuilder().setName('help').setDescription('Quick help');

export async function run(i: ChatInputCommandInteraction) {
  const theme = getGuildTheme(i.guildId);
  await respondOnce(
    i,
    () => ({ embeds: [themedEmbed(theme, 'Help', 'Use /balance, /daily, /faucet, /slots, /blackjack.')]}),
    async () => {
      try {
        const { getGuildDb } = await import('../../db/connection.js');
        if (!i.guildId) return { embeds: [themedEmbed(theme, 'Help', 'This bot only works in servers.')] };
        const db = getGuildDb(i.guildId);
        const row = db
          .prepare('SELECT max_bet, min_bet, faucet_limit, public_results, theme FROM guild_settings LIMIT 1')
          .get() as any;
        const settings = {
          max_bet: row?.max_bet ?? 10000,
          min_bet: row?.min_bet ?? 10,
          faucet_limit: row?.faucet_limit ?? 100,
          public_results: row?.public_results ?? 0,
          theme: row?.theme ?? 'midnight',
        };
        const extra = themedEmbed(theme, 'Help — Server Defaults')
          .addFields(
            { name: 'Min bet', value: String(settings.min_bet), inline: true },
            { name: 'Max bet', value: String(settings.max_bet), inline: true },
            { name: 'Faucet', value: String(settings.faucet_limit), inline: true },
          );
        const bj = themedEmbed(theme, 'Blackjack')
          .addFields(
            { name: 'Basics', value: 'Hit draws a card; Stand lets dealer play. Double Down only as first action.' },
            { name: 'Payouts', value: 'Blackjack 3:2; normal win 1:1; dealer bust 1:1; tie = push (refund). Dealer stands on soft 17.' },
            { name: 'Usage', value: '“/blackjack start bet:100” then use buttons or “/blackjack hit/stand/double”.' },
          );
        const styles = themedEmbed(theme, 'Playing Cards Style')
          .setDescription('Use /theme cards-style to choose between Unicode (fast, no uploads) or Image (crisp, works if your device font lacks the Playing Cards block).');
        return { embeds: [extra, bj, styles] };
      } catch {
        return { embeds: [themedEmbed(theme, 'Help', 'Defaults unavailable.')] };
      }
    },
  );
}
