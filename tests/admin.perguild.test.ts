import { beforeAll, afterAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { getGlobalAdminDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';
import { addGuildAdmin, removeGuildAdmin, listAdminsForGuild, isAdminInGuild } from '../src/admin/adminStore.js';

describe('per-guild admin isolation', () => {
    let baseDir = path.resolve('./data/test-admins');
    const G1 = '111111111111111111';
    const G2 = '222222222222222222';
    const SUPER_ID = '697169405422862417';
    const U1 = 'U1';
    const U2 = 'U2';

    afterAll(() => {
        // Clean up test databases
        const guildsTemp = path.join(baseDir, 'guilds_temp');
        if (fs.existsSync(guildsTemp)) {
            const files = fs.readdirSync(guildsTemp);
            for (const f of files) {
                fs.unlinkSync(path.join(guildsTemp, f));
            }
            fs.rmdirSync(guildsTemp);
        }
    });

    test('add/remove scoped to guild; list shows only current guild admins + global super', () => {
        const adminDb = new Database(':memory:');
        // Create table
        adminDb.exec(`CREATE TABLE IF NOT EXISTS admin_users (
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          guild_id TEXT,
          created_at TEXT
        );`);
        // Seed global super
        adminDb.prepare(`INSERT OR IGNORE INTO admin_users (user_id, role, guild_id, created_at) VALUES (?, 'super', NULL, datetime('now'))`).run(SUPER_ID);

        // Add U1 as admin in G1 only
        addGuildAdmin(adminDb, G1, U1);
        // Add U2 as admin in G2 only
        addGuildAdmin(adminDb, G2, U2);

        // List for G1: super + U1, not U2
        const listG1 = listAdminsForGuild(adminDb, G1);
        expect(listG1.superIds).toEqual([SUPER_ID]);
        expect(listG1.adminIds).toEqual([U1]);
        expect(listG1.adminIds).not.toContain(U2);

        // List for G2: super + U2, not U1
        const listG2 = listAdminsForGuild(adminDb, G2);
        expect(listG2.superIds).toEqual([SUPER_ID]);
        expect(listG2.adminIds).toEqual([U2]);
        expect(listG2.adminIds).not.toContain(U1);

        // isAdminInGuild checks scoped
        expect(isAdminInGuild(adminDb, G1, U1)).toBe(true);
        expect(isAdminInGuild(adminDb, G2, U1)).toBe(false);
        expect(isAdminInGuild(adminDb, G1, U2)).toBe(false);
        expect(isAdminInGuild(adminDb, G2, U2)).toBe(true);

        // Remove U1 from G1: affects only G1
        removeGuildAdmin(adminDb, G1, U1);
        expect(listAdminsForGuild(adminDb, G1).adminIds).toEqual([]); // U1 removed from G1
        expect(listAdminsForGuild(adminDb, G2).adminIds).toEqual([U2]); // G2 unaffected

        // Remove from wrong guild does nothing
        removeGuildAdmin(adminDb, G2, U1);
        expect(listAdminsForGuild(adminDb, G1).adminIds).toEqual([]); // Still empty

        adminDb.close();
    });

    test('migration deletes legacy global admin rows (no leaks)', async () => {
        // Use a unique directory for this test to avoid interference
        const testDir = path.join(baseDir, 'migration-test-' + Date.now());
        const legacyPath = path.join(testDir, 'admin_legacy.db');
        // Clean up any existing test database and WAL files
        if (fs.existsSync(legacyPath)) {
            fs.unlinkSync(legacyPath);
        }
        if (fs.existsSync(legacyPath + '-shm')) {
            fs.unlinkSync(legacyPath + '-shm');
        }
        if (fs.existsSync(legacyPath + '-wal')) {
            fs.unlinkSync(legacyPath + '-wal');
        }
        fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
        const adminDb = new Database(legacyPath);
        // Disable WAL mode for simpler cleanup
        adminDb.pragma('journal_mode = DELETE');

        // Create legacy table WITHOUT guild_id column (simulating old schema)
        adminDb.exec(`CREATE TABLE IF NOT EXISTS admin_users (
          user_id TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`);

        // Create legacy super_admins table (for 000_admin_core migration to import from)
        adminDb.exec(`CREATE TABLE IF NOT EXISTS super_admins (
          user_id TEXT PRIMARY KEY
        )`);
        // Insert SUPER_ID into legacy table
        adminDb.prepare(`INSERT INTO super_admins (user_id) VALUES (?)`).run(SUPER_ID);

        // Create tracking table for migrations
        adminDb.exec(`CREATE TABLE IF NOT EXISTS applied_migrations(
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`);

        // Insert legacy data: admin without guild_id (will be deleted by migration)
        adminDb.prepare(`INSERT INTO admin_users (user_id, role, created_at) VALUES (?, 'admin', datetime('now'))`).run(U1);
        adminDb.close();

        // Run migrations (will apply 002_admin_guild_scope.sql which adds guild_id column)
        const originalPath = process.env.ADMIN_GLOBAL_DB_PATH;
        const originalDataDir = process.env.DATA_DIR;
        const originalLegacyData = process.env.DATA_DB_PATH;
        const originalVerbose = process.env.VERBOSE;
        try {
            process.env.ADMIN_GLOBAL_DB_PATH = legacyPath;
            // Use a separate data dir to avoid processing other test databases
            process.env.DATA_DIR = path.join(testDir, 'guilds_temp');
            // Point to non-existent legacy DB to skip legacy migration
            process.env.DATA_DB_PATH = path.join(baseDir, 'nonexistent_legacy.db');
            // Disable verbose logging to avoid prototype patching issues
            delete process.env.VERBOSE;
            await runMigrations();

            // Reopen and check: legacy admin deleted, super kept
            const migratedDb = new Database(legacyPath);
            const admins = migratedDb.prepare(`SELECT user_id, role, guild_id FROM admin_users WHERE role = 'admin'`).all();
            expect(admins).toEqual([]); // Legacy global admin deleted by migration
            const supers = migratedDb.prepare(`SELECT user_id FROM admin_users WHERE role = 'super' AND guild_id IS NULL`).all();
            expect(supers.map((r: any) => r.user_id)).toContain(SUPER_ID); // Super preserved
            migratedDb.close();
        } finally {
            // Restore original env
            if (originalPath) {
                process.env.ADMIN_GLOBAL_DB_PATH = originalPath;
            } else {
                delete process.env.ADMIN_GLOBAL_DB_PATH;
            }
            if (originalDataDir) {
                process.env.DATA_DIR = originalDataDir;
            } else {
                delete process.env.DATA_DIR;
            }
            if (originalLegacyData) {
                process.env.DATA_DB_PATH = originalLegacyData;
            } else {
                delete process.env.DATA_DB_PATH;
            }
            if (originalVerbose) {
                process.env.VERBOSE = originalVerbose;
            } else {
                delete process.env.VERBOSE;
            }
        }
    });
});
