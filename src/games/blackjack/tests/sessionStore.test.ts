import { getGuildDb } from '../../../db/connection.js';
import { createSession, findActiveSession, endSession } from '../../../game/blackjack/sessionStore.js';

describe('blackjack session store', () => {
  test('endSession removes active session', () => {
    const gid = 'test_guild_bj_end_1';
    const uid = 'user_bj_1';
    const db = getGuildDb(gid);
    const id = 'test-session-1';
    createSession(db, { id, guild_id: gid, user_id: uid, state_json: JSON.stringify({ bet: 10, playerHands: [{ cards: [] }], dealer: { cards: [] } }) });
    const before = findActiveSession(db, gid, uid);
    expect(before?.id).toBe(id);
    endSession(gid, uid);
    const after = findActiveSession(db, gid, uid);
    expect(after).toBeUndefined();
  });
});

