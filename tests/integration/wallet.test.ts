import { adjustBalance, getBalance, transfer } from '../../src/economy/wallet.js';
import { getDB } from '../../src/db/connection.js';

describe('wallet economy', () => {
  beforeAll(() => {
    const db = getDB('data');
    db.exec(`
      CREATE TABLE IF NOT EXISTS wallets(
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
    const b = await adjustBalance(u, 1000, 'seed');
    expect(b).toBeGreaterThanOrEqual(1000);
    expect(getBalance(u)).toBe(b);
  });

  test('transfer updates both users', async () => {
    const a = 'userA';
    const b = 'userB';
    await adjustBalance(a, 500, 'seed');
    const { fromBalance, toBalance } = await transfer(a, b, 200);
    expect(fromBalance).toBeGreaterThanOrEqual(300);
    expect(toBalance).toBeGreaterThanOrEqual(200);
  });
});
