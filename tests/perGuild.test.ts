import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { closeAll } from '../src/db/connection.js';

jest.mock('../src/cli/ui', () => ({
  ui: {
    bar: () => ({ tick: () => { }, stop: () => { } }),
    say: () => { },
    timed: async (label: string, fn: () => Promise<any>) => fn(),
  },
}));

describe('per-guild databases', () => {
  let baseDir = path.resolve('./data/test-guilds');
  const G1 = '111111111111111111';
  const G2 = '222222222222222222';

  beforeAll(() => {
    try { closeAll(); } catch { }
    // Use a fresh temp directory per run to avoid leftover WAL files on Windows
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-guilds-'));
    process.env.DATA_DIR = baseDir;
    process.env.ADMIN_GLOBAL_DB_PATH = ':memory:';
    // Ensure the directory exists
    try { fs.mkdirSync(baseDir, { recursive: true }); } catch { }
  });

  test('economy state does not cross guilds', async () => {
    const { adjustBalance, getBalance, transfer } = await import('../src/economy/wallet.js');
    // Faucet-like grants
    await adjustBalance(G1, 'U1', 100, 'seed');
    await adjustBalance(G2, 'U1', 300, 'seed');
    expect(getBalance(G1, 'U1')).toBe(100n);
    expect(getBalance(G2, 'U1')).toBe(300n);
    // Transfer within G1
    await transfer(G1, 'U1', 'U2', 50);
    expect(getBalance(G1, 'U1')).toBe(50n);
    expect(getBalance(G1, 'U2')).toBe(50n);
    // G2 unaffected
    expect(getBalance(G2, 'U1')).toBe(300n);
    expect(getBalance(G2, 'U2')).toBe(0n);
  });

  test('guild admin is scoped; super admin is global', async () => {
    const { addGuildAdmin, isGuildAdmin, isSuperAdmin } = await import('../src/admin/roles.js');
    // Seeded super admin
    expect(isSuperAdmin('697169405422862417')).toBe(true);
    // Add a guild admin to G1 only
    addGuildAdmin(G1, 'U3');
    expect(isGuildAdmin(G1, 'U3')).toBe(true);
    expect(isGuildAdmin(G2, 'U3')).toBe(false);
  });

  test('legacy migration creates per-guild files', async () => {
    // Create a legacy mono DB with a guild_settings table carrying guild_id
    const legacyDir = path.resolve('./data');
    const legacyPath = path.join(legacyDir, 'data.db');
    try { fs.mkdirSync(legacyDir, { recursive: true }); } catch { }
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(legacyPath);
    db.exec(`CREATE TABLE IF NOT EXISTS guild_settings(guild_id TEXT PRIMARY KEY, max_bet INTEGER, min_bet INTEGER, faucet_limit INTEGER, public_results INTEGER, theme TEXT);
             INSERT OR REPLACE INTO guild_settings(guild_id, max_bet, min_bet, faucet_limit, public_results, theme) VALUES('${G1}',10000,10,100,1,'midnight');`);
    db.exec(`CREATE TABLE IF NOT EXISTS wallets(user_id TEXT PRIMARY KEY, balance INTEGER, updated_at INTEGER);
             INSERT OR REPLACE INTO wallets(user_id,balance,updated_at) VALUES('U1',123,${Date.now()});`);
    db.close();
    process.env.DATA_DB_PATH = legacyPath; // Point to legacy
    const { runMigrations } = await import('../src/db/migrate.js');
    runMigrations();
    const g1Path = path.join(baseDir, `${G1}.db`);
    expect(fs.existsSync(g1Path)).toBe(true);
    // Check balances table exists and has migrated row
    const g1db = new (await import('better-sqlite3')).default(g1Path);
    const row = g1db.prepare('SELECT balance FROM balances WHERE user_id = ?').get('U1') as { balance?: number | string | bigint } | undefined;
    const t = typeof row?.balance;
    expect(row && (t === 'string' || t === 'bigint' || t === 'number')).toBe(true);
  });
});
