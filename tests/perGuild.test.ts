import { beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

describe('per-guild databases', () => {
  const baseDir = path.resolve('./data/test-guilds');
  const G1 = '111111111111111111';
  const G2 = '222222222222222222';

  beforeAll(() => {
    process.env.DATA_DIR = baseDir;
    process.env.ADMIN_GLOBAL_DB_PATH = ':memory:';
    // Clean test dir
    try { fs.rmSync(baseDir, { recursive: true, force: true }); } catch {}
  });

  test('economy state does not cross guilds', async () => {
    const { adjustBalance, getBalance, transfer } = await import('../src/economy/wallet.js');
    // Faucet-like grants
    await adjustBalance(G1, 'U1', 100, 'seed');
    await adjustBalance(G2, 'U1', 300, 'seed');
    expect(getBalance(G1, 'U1')).toBe(100);
    expect(getBalance(G2, 'U1')).toBe(300);
    // Transfer within G1
    await transfer(G1, 'U1', 'U2', 50);
    expect(getBalance(G1, 'U1')).toBe(50);
    expect(getBalance(G1, 'U2')).toBe(50);
    // G2 unaffected
    expect(getBalance(G2, 'U1')).toBe(300);
    expect(getBalance(G2, 'U2')).toBe(0);
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
    try { fs.mkdirSync(legacyDir, { recursive: true }); } catch {}
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
    const row = g1db.prepare('SELECT balance FROM balances WHERE user_id = ?').get('U1') as { balance?: number } | undefined;
    expect(row && typeof row.balance === 'number').toBe(true);
  });
});

