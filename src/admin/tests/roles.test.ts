describe('admin roles', () => {
  beforeAll(() => {
    process.env.ADMIN_DB_PATH = ':memory:';
    // Re-import modules with in-memory DB
  });

  test('seed and role resolution', async () => {
    jest.isolateModules(() => {
      const { getDB } = require('../../db/connection.js');
      const db = getDB('admin');
      db.exec(`
        CREATE TABLE IF NOT EXISTS admins(
          uid TEXT PRIMARY KEY,
          nickname TEXT,
          role TEXT CHECK(role IN ('SUPER','ADMIN')),
          created_at INTEGER
        );
      `);
      const now = Date.now();
      db.prepare('INSERT INTO admins(uid, nickname, role, created_at) VALUES (?,?,?,?)').run('697169405422862417', 'Bash', 'SUPER', now);
      const { getRole, Role, addAdmin, removeAdmin } = require('../roles');
      expect(getRole('697169405422862417')).toBe(Role.SUPER);
      expect(getRole('unknown')).toBe(Role.BASE);
      addAdmin('u1', 'Test', 'ADMIN');
      expect(getRole('u1')).toBe(Role.ADMIN);
      removeAdmin('u1');
      expect(getRole('u1')).toBe(Role.BASE);
    });
  });
});
