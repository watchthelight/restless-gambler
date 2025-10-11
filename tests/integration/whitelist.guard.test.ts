import { initInteractionRouter } from '../../src/interactions/router.js';
import { getGuildDb } from '../../src/db/connection.js';
import { setWhitelistMode, releaseWhitelist } from '../../src/db/commandControl.js';

describe('Whitelist mode runtime gating', () => {
  const gid = 'wguild';

  function makeClient() {
    const handlers: Record<string, Function[]> = {};
    // Minimal discord.js-like client stub used by router/commands
    const guildsCache = {
      size: 0,
      reduce: (fn: (acc: number, g: any) => number, init: number) => init,
    } as any;
    const client: any = {
      on: (event: string, cb: any) => { (handlers[event] = handlers[event] || []).push(cb); },
      _emit: async (event: string, payload: any) => {
        for (const cb of handlers[event] || []) await cb(payload);
      },
      guilds: { cache: guildsCache },
      ws: { ping: 0 },
      shard: { ids: [0] },
    };
    return client;
  }

  function makeInteraction(name: string) {
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
      // Router may auto-defer; provide flags to satisfy checks
      deferred: false,
      replied: false,
      reply: (p: any) => { calls.push(['reply', p]); return Promise.resolve(); },
      editReply: (p: any) => { calls.push(['edit', p]); return Promise.resolve(); },
      deferReply: () => { (i.deferred = true); return Promise.resolve(); },
      fetchReply: async () => ({ id: 'm1' }),
      options: { getSubcommand: () => 'hit', getInteger: () => 1 },
    };
    return { i, calls };
  }

  it('blocks non-whitelisted commands and releases correctly', async () => {
    const client = makeClient();
    initInteractionRouter(client as any);

    // Activate whitelist: allow only 'ping'
    const db = getGuildDb(gid);
    setWhitelistMode(db, gid, ['ping'], []);

    // Blacklist: try blackjack
    const b = makeInteraction('blackjack');
    // attach client reference expected by command handlers
    b.i.client = client as any;
    await (client as any)._emit('interactionCreate', b.i);
    expect(b.calls.length).toBeGreaterThan(0);
    const msg = b.calls[0][1]?.content || '';
    expect(msg).toMatch(/whitelist mode active/i);

    // Allowed: try ping (should not produce whitelist error)
    const p = makeInteraction('ping');
    p.i.client = client as any;
    await (client as any)._emit('interactionCreate', p.i);
    const gotWhitelistError = p.calls.some((c) => /whitelist mode active/i.test(c[1]?.content || ''));
    expect(gotWhitelistError).toBe(false);

    // Release and try blackjack again; should not be blocked by whitelist
    releaseWhitelist(db, gid);
    const b2 = makeInteraction('blackjack');
    b2.i.client = client as any;
    await (client as any)._emit('interactionCreate', b2.i);
    const gotErrorAfterRelease = b2.calls.some((c) => /whitelist mode active/i.test(c[1]?.content || ''));
    expect(gotErrorAfterRelease).toBe(false);
  });
});
