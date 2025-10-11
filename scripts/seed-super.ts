// scripts/seed-super.ts (optional one-off)
import Database from 'better-sqlite3';
// Use built output to avoid TS path issues in one-off execution
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { attachAdmin } from '../dist/db/adminGlobal.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage: tsx scripts/seed-super.ts <USER_ID>');
  process.exit(1);
}

const db = new Database('data/guilds/_bootstrap.db');
attachAdmin(db as any);
db.prepare(`INSERT OR IGNORE INTO admin.super_admins(user_id) VALUES (?)`).run(String(id));
console.log('seeded super', id);
