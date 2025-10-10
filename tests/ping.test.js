import { respondOnce } from '../src/util/interactions.js';
test('respondOnce sends single reply then edit', async () => {
    const calls = [];
    const i = {
        deferred: false,
        replied: false,
        reply: (p) => { calls.push('reply'); i.replied = true; return Promise.resolve(p); },
        editReply: (p) => { calls.push('edit'); return Promise.resolve(p); },
    };
    await respondOnce(i, () => ({ content: 'first' }), () => ({ content: 'final' }));
    expect(calls).toEqual(['reply', 'edit']);
});
