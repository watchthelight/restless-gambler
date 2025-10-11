import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { getGuildDb } from '../../db/connection.js';
import { getGuildTheme } from '../../ui/theme.js';
import { themedEmbed } from '../../ui/embeds.js';
import { safeReply } from '../../interactions/reply.js';
import { KeyedMutexes } from '../../util/locks.js';
import { dbToBigint, bigintToDb } from '../../utils/bigint.js';

const messageLocks = new KeyedMutexes();

export async function handleButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'econ') return;
  if (parts[1] === 'resetme' && parts[2] === 'confirm') {
    const uid = parts[3];
    if (uid !== interaction.user.id) {
      await safeReply(interaction, { content: 'This button is not for you.', flags: MessageFlags.Ephemeral });
      return;
    }
    const created = parseInt(parts[4] || '0', 10);
    if (!Number.isFinite(created) || Date.now() - created > 60_000) {
      await interaction.reply({ content: 'Confirmation expired. Run /resetme again.' });
      return;
    }
    await messageLocks.runExclusive(`econ:${interaction.message?.id || interaction.id}`, async () => {
      await interaction.deferUpdate().catch(() => { });
      const db = getGuildDb(interaction.guildId!);
      const now = Date.now();
      const tx = db.transaction(() => {
        const row = db.prepare('SELECT balance FROM balances WHERE user_id = ?').get(interaction.user.id) as { balance?: number | string | bigint } | undefined;
        const cur = row?.balance != null ? dbToBigint(row.balance) : 0n;
        db.prepare('INSERT INTO balances(user_id, balance, updated_at) VALUES(?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET balance=excluded.balance, updated_at=excluded.updated_at').run(interaction.user.id, bigintToDb(0n), now);
        if (cur !== 0n) db.prepare('INSERT INTO transactions(user_id, delta, reason, created_at) VALUES (?,?,?,?)').run(interaction.user.id, Number(-cur), 'self:reset', now);
        db.prepare('DELETE FROM cooldowns WHERE user_id = ?').run(interaction.user.id);
      });
      tx();
      const theme = getGuildTheme(interaction.guildId);
      const embed = themedEmbed(theme, 'Reset Complete', 'Your balance and cooldowns have been reset.');
      console.log(JSON.stringify({ msg: 'econ', event: 'resetme', guildId: interaction.guildId, userId: interaction.user.id }));
      await interaction.editReply({ embeds: [embed], components: [] }).catch(() => { });
    });
  }
}
