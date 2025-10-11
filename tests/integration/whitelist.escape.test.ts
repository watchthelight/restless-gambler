import { initInteractionRouter } from '../../src/interactions/router.js';
import { getGuildDb } from '../../src/db/connection.js';
import { setWhitelistMode } from '../../src/db/commandControl.js';

describe('Whitelist mode escape hatch', () => {
  const gid = 'wguild-escape';

  function makeClient() {
    const handlers: Record<string, Function[]> = {};
    const guildsCache = { size: 0, reduce: (fn: (acc: number, g: any) => number, init: number) => init } as any;
    const client: any = {
      on: (event: string, cb: any) => { (handlers[event] = handlers[event] || []).push(cb); },
      _emit: async (event: string, payload: any) => { for (const cb of handlers[event] || []) await cb(payload); },
      guilds: { cache: guildsCache },
      ws: { ping: 0 },
      shard: { ids: [0] },
    };
    return client;
  }

  function makeInteraction(name: string, sub?: string) {
    const calls: any[] = [];
    const i: any = {
      isAutocomplete: () => false,
      isButton: () => false,
      isChatInputCommand: () => true,
      commandName: name,
      guildId: gid,
      channelId: 'chan-id',
      createdTimestamp: Date.now(),
      user: { id: 'tester', tag: 'tester#1', username: 'tester' },
      channel: { name: 'chan' },
      guild: { name: 'g' },
      inGuild: () => true,
      member: { permissions: { has: () => true } }, // allow admin-only gate
      deferred: false,
      replied: false,
      reply: (p: any) => { calls.push(['reply', p]); return Promise.resolve(); },
      editReply: (p: any) => { calls.push(['edit', p]); return Promise.resolve(); },
      deferReply: () => { (i.deferred = true); return Promise.resolve(); },
      fetchReply: async () => ({ id: 'm1' }),
      options: { getSubcommand: () => sub, getSubcommandGroup: () => null, getInteger: () => 1 },
    };
    return { i, calls };
  }

  it('allows /admin whitelist-release while in whitelist mode', async () => {
    const client = makeClient();
    initInteractionRouter(client as any);

    // Activate whitelist: allow only 'ping'
    const db = getGuildDb(gid);
    setWhitelistMode(db, gid, ['ping'], []);

    // Mark user as guild admin so /admin command passes requireAdmin
    db.prepare('INSERT OR IGNORE INTO guild_admins(user_id, added_at) VALUES(?, ?)').run('tester', Date.now());

    // Attempt escape hatch via command
    const rel = makeInteraction('admin', 'whitelist-release');
    rel.i.client = client as any;
    await (client as any)._emit('interactionCreate', rel.i);

    // After release, a non-whitelisted command should not be blocked
    const b = makeInteraction('blackjack');
    b.i.client = client as any;
    await (client as any)._emit('interactionCreate', b.i);

    const gotWhitelistError = b.calls.some((c) => /whitelist mode active/i.test(c[1]?.content || ''));
    expect(gotWhitelistError).toBe(false);
  });
});
