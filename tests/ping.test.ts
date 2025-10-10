import { respondOnce } from '../src/util/interactions.js';

test('respondOnce sends single reply then edit', async () => {
  const calls: string[] = [];
  const i: any = {
    deferred: false,
    replied: false,
    reply: (p: any) => { calls.push('reply'); i.replied = true; return Promise.resolve(p); },
    editReply: (p: any) => { calls.push('edit'); return Promise.resolve(p); },
  };
  await respondOnce(i, () => ({ content: 'first' }), () => ({ content: 'final' }));
  expect(calls).toEqual(['reply', 'edit']);
});

