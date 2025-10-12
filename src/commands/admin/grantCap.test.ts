import { getGuildDb } from '../../db/connection.js';
import { ensureAttached } from '../../admin/adminStore.js';
import * as AdminCmd from './index.js';
import { setMaxAdminGrant, getMaxAdminGrant, ECONOMY_LIMITS } from '../../config/economy.js';
import { formatBalance } from '../../util/formatBalance.js';

function makeIx({ guildId, adminId, targetId, amount }: { guildId: string; adminId: string; targetId: string; amount: number }) {
  const messages: any[] = [];
  const ix: any = {
    commandName: 'admin',
    guildId,
    guild: { id: guildId, name: 'Test Guild' },
    channelId: '12345',
    user: { id: adminId, tag: 'Admin#0001', username: 'Admin' },
    options: {
      getSubcommandGroup: (_?: boolean) => null,
      getSubcommand: (_?: boolean) => 'give',
      getUser: (_: string, __: boolean) => ({ id: targetId, tag: 'Target#0001', username: 'Target' }),
      getInteger: (_: string, __: boolean) => amount,
    },
    replied: false,
    deferred: false,
    reply: (payload: any) => { messages.push(payload); ix.replied = true; return Promise.resolve(payload); },
    editReply: (payload: any) => { messages.push(payload); ix.replied = true; return Promise.resolve(payload); },
    followUp: (payload: any) => { messages.push(payload); return Promise.resolve(payload); },
  };
  return { ix, messages };
}

describe('admin give respects max_admin_grant cap', () => {
  const guildId = 'G-CAP-TEST';
  const adminId = 'U-ADMIN';
  const targetId = 'U-TARGET';

  beforeAll(() => {
    process.env.ADMIN_GLOBAL_DB_PATH = ':memory:'; // speed up
    const db = getGuildDb(guildId);
    ensureAttached(db as any);
    // make admin a SUPER admin
    try { db.prepare(`INSERT OR IGNORE INTO admin.super_admins(user_id) VALUES(?)`).run(adminId); } catch {}
  });

  test('clamps to configured cap and posts warning', async () => {
    setMaxAdminGrant(guildId, 50_000n);
    const { ix, messages } = makeIx({ guildId, adminId, targetId, amount: 100_000 });
    await (AdminCmd as any).execute(ix);
    // Find warning embed
    const hasWarning = messages.some((m) => {
      const embeds = (m?.embeds || []) as any[];
      return embeds.some((e) => {
        const j = typeof e.toJSON === 'function' ? e.toJSON() : e;
        const desc: string = j?.description || '';
        return /Amount clamped to maximum grant/i.test(desc) && desc.includes(formatBalance(50_000));
      });
    });
    expect(hasWarning).toBe(true);
  });

  test('resetting cap restores default', () => {
    setMaxAdminGrant(guildId, ECONOMY_LIMITS.DEFAULT);
    const cap = getMaxAdminGrant(guildId);
    expect(cap).toBe(ECONOMY_LIMITS.DEFAULT);
  });
});
