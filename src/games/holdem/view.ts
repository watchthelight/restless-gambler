import { EmbedBuilder, time } from 'discord.js';
import { formatBalance } from '../../util/formatBalance.js';
import type { HoldemTable, HoldemPlayer } from './store.js';

const brand = 0x0f192a;

export function createdEmbed(t: HoldemTable) {
  return new EmbedBuilder()
    .setColor(brand)
    .setTitle('♠ Hold\'em')
    .setDescription(`Table #${t.id} created in this channel.`)
    .addFields(
      { name: 'Blinds', value: `${formatBalance(BigInt(t.small_blind))}/${formatBalance(BigInt(t.big_blind))}`, inline: true },
      { name: 'Buy-in', value: `${formatBalance(BigInt(t.min_buyin))} – ${formatBalance(BigInt(t.max_buyin))}`, inline: true },
      { name: 'Seats', value: String(t.seats), inline: true },
    )
    .setFooter({ text: 'Good luck.' });
}

export function joinedEmbed(t: HoldemTable, seat: number, stack: number) {
  return new EmbedBuilder()
    .setColor(brand)
    .setTitle('Hold\'em')
    .setDescription(`Joined **Table #${t.id}** · Seat **${seat}**`)
    .addFields(
      { name: 'Stack', value: formatBalance(BigInt(stack)), inline: true },
      { name: 'Blinds', value: `${formatBalance(BigInt(t.small_blind))}/${formatBalance(BigInt(t.big_blind))}`, inline: true },
    );
}

export function leftEmbed(tableId: number, stack: number) {
  return new EmbedBuilder()
    .setColor(brand)
    .setTitle('Hold\'em')
    .setDescription(`You left **Table #${tableId}**`)
    .addFields({ name: 'Returned', value: formatBalance(BigInt(stack)), inline: true });
}

export function statusEmbed(t: HoldemTable, players: HoldemPlayer[]) {
  const seats = `${players.length}/${t.seats}`;
  const lines = players.length
    ? players.map(p => `• <@${p.user_id}> — Seat ${p.seat} — ${formatBalance(BigInt(p.stack))}`).join('\n')
    : '_No players yet_';
  return new EmbedBuilder()
    .setColor(brand)
    .setTitle(`Hold\'em · Table #${t.id}`)
    .addFields(
      { name: 'Blinds', value: `${formatBalance(BigInt(t.small_blind))}/${formatBalance(BigInt(t.big_blind))}`, inline: true },
      { name: 'Buy-in', value: `${formatBalance(BigInt(t.min_buyin))} – ${formatBalance(BigInt(t.max_buyin))}`, inline: true },
      { name: 'Seats', value: seats, inline: true },
    )
    .setDescription(lines);
}
