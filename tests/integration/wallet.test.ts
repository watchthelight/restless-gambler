import { adjustBalance, getBalance, transfer } from '../../src/economy/wallet.js';
import { getGuildDb } from '../../src/db/connection.js';

describe('wallet economy', () => {
  beforeAll(() => {
    const db = getGuildDb('testguild');
    db.exec(`
      CREATE TABLE IF NOT EXISTS balances(
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transactions(
        id INTEGER PRIMARY KEY,
        user_id TEXT NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  });

  test('adjust and get balance', async () => {
    const u = 'user1';
    const b = await adjustBalance('testguild', u, 1000n, 'seed');
    expect(b).toBeGreaterThanOrEqual(1000n);
    expect(getBalance('testguild', u)).toBe(b);
  });

  test('transfer updates both users', async () => {
    const a = 'userA';
    const b = 'userB';
    await adjustBalance('testguild', a, 500n, 'seed');
    const { from, to } = await transfer('testguild', a, b, 200n);
    expect(from).toBeGreaterThanOrEqual(300n);
    expect(to).toBeGreaterThanOrEqual(200n);
  });
});
