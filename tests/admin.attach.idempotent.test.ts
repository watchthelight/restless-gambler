import Database from 'better-sqlite3';
import { ensureAdminAttached } from '../src/db/adminGlobal';

test('ensureAdminAttached is idempotent', () => {
  const db = new Database(':memory:');
  expect(() => ensureAdminAttached(db)).not.toThrow();
  // call again should not throw “already in use”
  expect(() => ensureAdminAttached(db)).not.toThrow();
  const list = db.pragma('database_list', { simple: false }) as Array<{ name: string }>;
  expect(list.find((r: any) => r.name === 'admin')).toBeTruthy();
});

