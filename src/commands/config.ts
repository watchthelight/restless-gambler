import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField, MessageFlags } from 'discord.js';
import { getGuildDb } from '../db/connection.js';
import { getSetting, getSettingNum, setSetting } from '../db/kv.js';
import { makePublicAdmin } from './util/adminBuilder.js';
import { parseHumanAmount as parseMaxBetAmount, setMaxBetDisabled, setMaxBetValue, getMaxBet } from '../config/maxBet.js';
import { jsonStringifySafeBigint } from '../utils/json.js';
import { ensurePublicDefer, channelFallback } from '../lib/publicReply.js';
import { okCard, errorCard } from '../ui/cards.js';
import { getMaxAdminGrant, setMaxAdminGrant, ECONOMY_LIMITS } from '../config/economy.js';
import { parseHumanAmount, fmtCoins } from '../lib/amount.js';
import { amountErrorEmbed } from '../interactions/errors/amount.js';
import { requireAdmin } from '../admin/guard.js';
import { logInfo, logError } from '../utils/logger.js';

export const data = makePublicAdmin(
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Guild configuration • v2')
)
  .addSubcommand((sc) =>
    sc
      .setName('set')
      .setDescription('Set a config key (admin only)')
      .addStringOption((o) =>
        o
          .setName('key')
          .setDescription('Key')
          .setRequired(true)
          .addChoices(
            { name: 'max_bet', value: 'max_bet' },
            { name: 'min_bet', value: 'min_bet' },
            { name: 'faucet_limit', value: 'faucet_limit' },
            { name: 'public_results', value: 'public_results' },
            { name: 'theme', value: 'theme' },
            { name: 'rank_xp_rate', value: 'rank_xp_rate' },
            { name: 'rank_xp_cap_min', value: 'rank_xp_cap_min' },
            { name: 'rank_xp_cap_max', value: 'rank_xp_cap_max' },
            { name: 'luck_bonus_bps', value: 'luck_bonus_bps' },
            { name: 'luck_max_bps', value: 'luck_max_bps' },
            { name: 'luck_duration_sec', value: 'luck_duration_sec' },
            { name: 'rank_curve', value: 'rank_curve' },
            { name: 'rank_max_level', value: 'rank_max_level' },
            { name: 'rank_public_promotions', value: 'rank_public_promotions' },
            { name: 'xp_enabled', value: 'xp_enabled' },
            { name: 'xp_per_1000_wagered', value: 'xp_per_1000_wagered' },
            { name: 'xp_flat_per_round', value: 'xp_flat_per_round' },
            { name: 'xp_min_per_round', value: 'xp_min_per_round' },
            { name: 'xp_max_per_round', value: 'xp_max_per_round' },
            { name: 'xp_cap_per_minute', value: 'xp_cap_per_minute' },
            { name: 'xp_cooldown_ms', value: 'xp_cooldown_ms' },
            { name: 'economy.max_admin_grant', value: 'economy.max_admin_grant' },
          ),
      )
      .addStringOption((o) => o.setName('value').setDescription('Value or theme preset').setRequired(true).setAutocomplete(false)),
  )
  .addSubcommand((sc) =>
    sc
      .setName('view')
      .setDescription('View a config section (public card)')
      .addStringOption((o) =>
        o
          .setName('section')
          .setDescription('Section to view')
          .setRequired(true)
          .addChoices(
            { name: 'economy', value: 'economy' },
          ),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName('get')
      .setDescription('Get a config value')
      .addStringOption((o) =>
        o
          .setName('key')
          .setDescription('Key')
          .setRequired(true)
          .addChoices(
            { name: 'max_bet', value: 'max_bet' },
            { name: 'min_bet', value: 'min_bet' },
            { name: 'faucet_limit', value: 'faucet_limit' },
            { name: 'public_results', value: 'public_results' },
            { name: 'theme', value: 'theme' },
            { name: 'rank_xp_rate', value: 'rank_xp_rate' },
            { name: 'rank_xp_cap_min', value: 'rank_xp_cap_min' },
            { name: 'rank_xp_cap_max', value: 'rank_xp_cap_max' },
            { name: 'luck_bonus_bps', value: 'luck_bonus_bps' },
            { name: 'luck_max_bps', value: 'luck_max_bps' },
            { name: 'luck_duration_sec', value: 'luck_duration_sec' },
            { name: 'rank_curve', value: 'rank_curve' },
            { name: 'rank_max_level', value: 'rank_max_level' },
            { name: 'rank_public_promotions', value: 'rank_public_promotions' },
            { name: 'xp_enabled', value: 'xp_enabled' },
            { name: 'xp_per_1000_wagered', value: 'xp_per_1000_wagered' },
            { name: 'xp_flat_per_round', value: 'xp_flat_per_round' },
            { name: 'xp_min_per_round', value: 'xp_min_per_round' },
            { name: 'xp_max_per_round', value: 'xp_max_per_round' },
            { name: 'xp_cap_per_minute', value: 'xp_cap_per_minute' },
            { name: 'xp_cooldown_ms', value: 'xp_cooldown_ms' },
            { name: 'economy.max_admin_grant', value: 'economy.max_admin_grant' },
          ),
      ),
  );

export async function handleConfig(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Guild-only command.', flags: MessageFlags.Ephemeral });
    return;
  }
  const sub = interaction.options.getSubcommand(true);
  if (sub === 'view') {
    const section = interaction.options.getString('section', true);
    if (section === 'economy') {
      await ensurePublicDefer(interaction);
      const cap = getMaxAdminGrant(interaction.guildId);
      const card = okCard({ title: '⚙️ Economy Config', description: `max_admin_grant: **${fmtCoins(cap)}**` });
      try {
        await channelFallback(interaction, { embeds: [card] } as any);
        logInfo('config view economy', { guild: { id: interaction.guildId!, name: interaction.guild?.name }, channel: { id: interaction.channelId }, user: { id: interaction.user.id, tag: interaction.user.tag }, command: 'config', sub: 'view' }, { cap: String(cap) });
      } catch (e) {
        logError('config view economy failed', { guild: { id: interaction.guildId!, name: interaction.guild?.name }, channel: { id: interaction.channelId }, user: { id: interaction.user.id, tag: interaction.user.tag }, command: 'config', sub: 'view' }, e as any);
      }
      return;
    }
  }
  else if (sub === 'set') {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: 'Admin only.', flags: MessageFlags.Ephemeral });
      return;
    }
    const key = interaction.options.getString('key', true);
    const value = interaction.options.getString('value', true);
    const db = getGuildDb(interaction.guildId);
    const now = Date.now();
    const set = (k: string, v: string) => setSetting(db, k, v);
    if (key === 'economy.max_admin_grant') {
      // New economy cap (public, card-style)
      try {
        await requireAdmin(interaction as any);
      } catch { return; }
      await ensurePublicDefer(interaction);
      const db = getGuildDb(interaction.guildId);
      const prev = getMaxAdminGrant(interaction.guildId);
      let amount: bigint;
      try {
        const parsedAmount = parseHumanAmount(value);
        if (!('value' in parsedAmount)) {
          const emb = amountErrorEmbed(parsedAmount, { command: 'config' });
          await channelFallback(interaction, { embeds: [emb] } as any);
          logError('config set economy.max_admin_grant failed', { guild: { id: interaction.guildId!, name: interaction.guild?.name }, channel: { id: interaction.channelId }, user: { id: interaction.user.id, tag: interaction.user.tag }, command: 'config', sub: 'set' }, new Error(parsedAmount.code));
          return;
        }
        amount = parsedAmount.value;
      } catch {
        const err = errorCard({ command: 'config', type: 'BadInput', message: `Invalid amount. Allowed range: 0 … ${fmtCoins(ECONOMY_LIMITS.MAX)}.`, errorId: 'NA' });
        await channelFallback(interaction, { embeds: [err] } as any);
        logError('config set economy.max_admin_grant failed', { guild: { id: interaction.guildId!, name: interaction.guild?.name }, channel: { id: interaction.channelId }, user: { id: interaction.user.id, tag: interaction.user.tag }, command: 'config', sub: 'set' }, new Error('bad_amount'));
        return;
      }
      if (amount < 0n || amount > ECONOMY_LIMITS.MAX) {
        const err = errorCard({ command: 'config', type: 'BadInput', message: `Invalid amount. Allowed range: 0 … ${fmtCoins(ECONOMY_LIMITS.MAX)}.`, errorId: 'NA' });
        await channelFallback(interaction, { embeds: [err] } as any);
        return;
      }
      try {
        setMaxAdminGrant(interaction.guildId, amount);
        try { db.prepare('INSERT INTO audit_log(json) VALUES(?)').run(jsonStringifySafeBigint({ msg: 'config_set', key: 'economy.max_admin_grant', old: String(prev), value: String(amount), guildId: interaction.guildId, admin: interaction.user.id, channelId: interaction.channelId })); } catch {}
        const card = okCard({ title: '⚙️ Economy config updated', description: `max_admin_grant set to **${fmtCoins(amount)}**` });
        await channelFallback(interaction, { embeds: [card] } as any);
        logInfo('config updated: economy.max_admin_grant', { guild: { id: interaction.guildId!, name: interaction.guild?.name }, channel: { id: interaction.channelId }, user: { id: interaction.user.id, tag: interaction.user.tag }, command: 'config', sub: 'set' }, { old: String(prev), new: String(amount) });
      } catch (e) {
        const errId = 'CFG-ECON-SET';
        const err = errorCard({ command: 'config', type: 'PersistError', message: 'Failed to update economy config.', errorId: errId, details: String((e as any)?.message || e) });
        await channelFallback(interaction, { embeds: [err] } as any);
        logError('config set economy.max_admin_grant failed', { guild: { id: interaction.guildId!, name: interaction.guild?.name }, channel: { id: interaction.channelId }, user: { id: interaction.user.id, tag: interaction.user.tag }, command: 'config', sub: 'set' }, e as any);
      }
    }
    else if (key === 'public_results') {
      set('public_results', value === 'true' ? '1' : '0');
    } else if (key === 'theme') {
      set('theme', value);
    } else if (key === 'min_bet') {
      const v = String(Math.max(0, Math.floor(parseInt(value, 10) || 0)));
      set('slots.min_bet', v);
      set('blackjack.min_bet', v);
    } else if (key === 'max_bet') {
      // New per-guild max bet config with disable or bigint numeric value
      const raw = value.trim();
      const isDisable = /^(disable|off|false|none|unlimited)$/i.test(raw);
      if (isDisable) {
        setMaxBetDisabled(db);
        // audit
        try { db.prepare('INSERT INTO audit_log(json) VALUES(?)').run(jsonStringifySafeBigint({ msg: 'config_set', key: 'max_bet', value: 'unlimited', guildId: interaction.guildId, admin: interaction.user.id })); } catch {}
        await interaction.reply({ content: 'Max bet disabled (unlimited).' });
        return;
      }
      try {
        const limit = parseMaxBetAmount(raw);
        setMaxBetValue(db, limit);
        try { db.prepare('INSERT INTO audit_log(json) VALUES(?)').run(jsonStringifySafeBigint({ msg: 'config_set', key: 'max_bet', value: limit.toString(), guildId: interaction.guildId, admin: interaction.user.id })); } catch {}
        await interaction.reply({ content: `Max bet set to ${limit.toString()}.` });
        return;
      } catch (e: any) {
        await interaction.reply({ content: `Invalid max bet: ${raw}. Use a number like 10k, 2m, 1_000_000 or "disable".`, flags: MessageFlags.Ephemeral });
        return;
      }
    } else if (key === 'faucet_limit') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 100)));
      set('faucet_limit', v);
    } else if (key === 'rank_xp_rate') {
      const v = String(Math.max(0, parseFloat(value) || 1.0));
      set('rank_xp_rate', v);
    } else if (key === 'rank_xp_cap_min') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 5)));
      set('rank_xp_cap_min', v);
    } else if (key === 'rank_xp_cap_max') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 250)));
      set('rank_xp_cap_max', v);
    } else if (key === 'luck_bonus_bps') {
      const v = String(Math.max(0, Math.floor(parseInt(value, 10) || 150)));
      set('luck_bonus_bps', v);
    } else if (key === 'luck_max_bps') {
      const v = String(Math.max(0, Math.floor(parseInt(value, 10) || 300)));
      set('luck_max_bps', v);
    } else if (key === 'luck_duration_sec') {
      const v = String(Math.max(60, Math.floor(parseInt(value, 10) || 3600)));
      set('luck_duration_sec', v);
    } else if (key === 'rank_curve') {
      const allowed = ['linear', 'quadratic', 'exponential'];
      const v = allowed.includes(value) ? value : 'quadratic';
      set('rank_curve', v);
    } else if (key === 'rank_max_level') {
      const v = String(Math.max(1, Math.min(1000, Math.floor(parseInt(value, 10) || 100))));
      set('rank_max_level', v);
    } else if (key === 'rank_public_promotions') {
      set('rank_public_promotions', value === 'true' ? '1' : '0');
    } else if (key === 'xp_enabled') {
      set('xp_enabled', value === 'true' ? '1' : '0');
    } else if (key === 'xp_per_1000_wagered') {
      const v = String(Math.max(0, parseFloat(value) || 5));
      set('xp_per_1000_wagered', v);
    } else if (key === 'xp_flat_per_round') {
      const v = String(Math.max(0, parseFloat(value) || 0));
      set('xp_flat_per_round', v);
    } else if (key === 'xp_min_per_round') {
      const v = String(Math.max(0, Math.floor(parseInt(value, 10) || 10)));
      set('xp_min_per_round', v);
    } else if (key === 'xp_max_per_round') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 250)));
      set('xp_max_per_round', v);
    } else if (key === 'xp_cap_per_minute') {
      const v = String(Math.max(1, Math.floor(parseInt(value, 10) || 1000)));
      set('xp_cap_per_minute', v);
    } else if (key === 'xp_cooldown_ms') {
      const v = String(Math.max(0, Math.floor(parseInt(value, 10) || 1500)));
      set('xp_cooldown_ms', v);
    } else {
      await interaction.reply({ content: `Unknown key: ${key}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (key !== 'economy.max_admin_grant') {
      await interaction.reply({ content: `Set ${key} to ${value}`, flags: MessageFlags.Ephemeral });
    }
  } else if (sub === 'get') {
    const key = interaction.options.getString('key', true);
    const db = getGuildDb(interaction.guildId);
    let value: string | number | null = null;
    if (key === 'min_bet') {
      const v = getSetting(db, 'slots.min_bet') ?? getSetting(db, 'blackjack.min_bet');
      value = v ?? '10';
    } else if (key === 'max_bet') {
      const cur = getMaxBet(db);
      value = cur.disabled ? 'unlimited' : cur.limit.toString();
    } else if (key === 'faucet_limit') {
      value = getSetting(db, 'faucet_limit') ?? '100';
    } else if (key === 'public_results') {
      value = getSetting(db, 'public_results') ?? '1';
    } else if (key === 'theme') {
      value = getSetting(db, 'theme') ?? 'midnight';
    } else if (key === 'rank_xp_rate') {
      value = getSetting(db, 'rank_xp_rate') ?? '1.0';
    } else if (key === 'rank_xp_cap_min') {
      value = getSetting(db, 'rank_xp_cap_min') ?? '5';
    } else if (key === 'rank_xp_cap_max') {
      value = getSetting(db, 'rank_xp_cap_max') ?? '250';
    } else if (key === 'luck_bonus_bps') {
      value = getSetting(db, 'luck_bonus_bps') ?? '150';
    } else if (key === 'luck_max_bps') {
      value = getSetting(db, 'luck_max_bps') ?? '300';
    } else if (key === 'luck_duration_sec') {
      value = getSetting(db, 'luck_duration_sec') ?? '3600';
    } else if (key === 'rank_curve') {
      value = getSetting(db, 'rank_curve') ?? 'quadratic';
    } else if (key === 'rank_max_level') {
      value = getSetting(db, 'rank_max_level') ?? '100';
    } else if (key === 'rank_public_promotions') {
      value = getSetting(db, 'rank_public_promotions') ?? '1';
    } else if (key === 'xp_enabled') {
      value = getSetting(db, 'xp_enabled') ?? 'true';
    } else if (key === 'xp_per_1000_wagered') {
      value = getSetting(db, 'xp_per_1000_wagered') ?? '5';
    } else if (key === 'xp_flat_per_round') {
      value = getSetting(db, 'xp_flat_per_round') ?? '0';
    } else if (key === 'xp_min_per_round') {
      value = getSetting(db, 'xp_min_per_round') ?? '10';
    } else if (key === 'xp_max_per_round') {
      value = getSetting(db, 'xp_max_per_round') ?? '250';
    } else if (key === 'xp_cap_per_minute') {
      value = getSetting(db, 'xp_cap_per_minute') ?? '1000';
    } else if (key === 'xp_cooldown_ms') {
      value = getSetting(db, 'xp_cooldown_ms') ?? '1500';
    } else if (key === 'economy.max_admin_grant') {
      value = String(getMaxAdminGrant(interaction.guildId));
    }
    await interaction.reply({ content: `${key} = ${value}`, flags: MessageFlags.Ephemeral });
  }
}
