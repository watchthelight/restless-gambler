import { jest } from '@jest/globals';

describe('admin roles', () => {
  beforeAll(() => {
    process.env.ADMIN_DB_PATH = ':memory:';
    // Re-import modules with in-memory DB
  });

  test('seed and role resolution', async () => {
    const { getDB } = await import('../../db/connection.js');
    const db = getDB('admin');
    // Use updated schema with added_at (matches admin_global.sql)
    db.exec(`
      CREATE TABLE IF NOT EXISTS super_admins(
        user_id TEXT PRIMARY KEY,
        added_at INTEGER DEFAULT (strftime('%s','now'))
      );
    `);
    const { seedSuperAdmin, getRole, Role, addAdmin, removeAdmin } = await import('../roles.js');
    seedSuperAdmin('697169405422862417');
    expect(getRole('697169405422862417')).toBe(Role.SUPER);
    expect(getRole('unknown')).toBe(Role.BASE);
    addAdmin('u1', 'Test', 'SUPER');
    expect(getRole('u1')).toBe(Role.SUPER);
    removeAdmin('u1');
    expect(getRole('u1')).toBe(Role.BASE);
  });
});
