import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

function stripOuterTransactions(sql: string): string {
    return sql
        .replace(/\bBEGIN(?:\s+TRANSACTION)?\s*;?/gi, "")
        .replace(/\bCOMMIT\s*;?/gi, "");
}

export function migrateGuildDb(db: Database.Database, guildId: string, log: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void; error?: (...args: any[]) => void } = console) {
    const QUIET = !process.env.VERBOSE;
    const logger = {
        info: QUIET ? (() => {}) : (log.info?.bind(log) ?? (() => { })),
        warn: log.warn?.bind(log) ?? (() => { }),
        error: log.error?.bind(log) ?? (() => { }),
    };

    try {
        if (!QUIET) logger.info({ msg: 'migrate_guild_start', guildId });

        // Check and rebuild _migrations if necessary
        const tableInfo = db.prepare("PRAGMA table_info(_migrations)").all() as any[];
        const columnNames = new Set(tableInfo.map(col => col.name.toLowerCase()));
        const expectedColumns = new Set(['name', 'applied_at']);
        const isValid = columnNames.size === expectedColumns.size && [...expectedColumns].every(name => columnNames.has(name));
        if (tableInfo.length === 0) {
            db.exec("CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);");
        } else if (!isValid) {
            logger.warn({ msg: 'migrations_table_malformed', guildId, columns: tableInfo.map(c => c.name) });
            // Rebuild online
            const legacyRows = db.prepare("SELECT * FROM _migrations").all() as any[];
            db.exec("DROP TABLE _migrations;");
            db.exec("CREATE TABLE _migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);");
            for (const row of legacyRows) {
                let name: string;
                if (row.name) {
                    name = String(row.name);
                } else if (row.id) {
                    name = String(row.id);
                } else {
                    name = 'legacy-' + Math.random().toString(36).substr(2, 9);
                }
                const appliedAt = row.applied_at || Date.now();
                db.prepare("INSERT OR IGNORE INTO _migrations(name, applied_at) VALUES (?, ?)").run(name, appliedAt);
            }
        }

        // Read applied migrations
        const appliedRows = db.prepare('SELECT name FROM _migrations').all();
        const appliedSet = new Set(appliedRows.map((r: any) => r.name));

        // Read migration files
        const migrationsDir = path.resolve('src/db/migrations/guild');
        if (!fs.existsSync(migrationsDir)) {
            logger.warn({ msg: 'migrations_dir_missing', guildId, dir: migrationsDir });
            return;
        }
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        for (const file of files) {
            if (appliedSet.has(file)) {
                logger.info({ msg: 'migration_already_applied', guildId, file });
                continue;
            }
            const sqlPath = path.join(migrationsDir, file);
            const raw = fs.readFileSync(sqlPath, 'utf8');
            const sql = stripOuterTransactions(raw).trim();

            const spName = `mig_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;
            db.exec(`SAVEPOINT ${spName};`);
            try {
                if (sql.length) db.exec(sql);
                db.prepare("INSERT OR IGNORE INTO _migrations(name, applied_at) VALUES (?, strftime('%s','now'))").run(file);
                db.exec(`RELEASE ${spName};`);
                logger.info({ msg: 'migrate_guild', guildId, file });
            } catch (e: any) {
                // Check if error is due to column already existing (duplicate column error)
                const isDuplicateColumn = e && typeof e.message === 'string' && e.message.includes('duplicate column');
                if (isDuplicateColumn) {
                    // Column already exists, mark migration as applied and continue
                    db.exec(`RELEASE ${spName};`);
                    db.prepare("INSERT OR IGNORE INTO _migrations(name, applied_at) VALUES (?, strftime('%s','now'))").run(file);
                    logger.info({ msg: 'migrate_guild_skipped_duplicate', guildId, file, reason: 'column already exists' });
                } else {
                    db.exec(`ROLLBACK TO ${spName};`);
                    db.exec(`RELEASE ${spName};`);
                    logger.error({ msg: 'migrate_guild_error', guildId, file, error: String(e) });
                    throw e;
                }
            }
        }

        // Post-migration schema validation for guild_settings
        try {
            const guildSettingsInfo = db.prepare("PRAGMA table_info(guild_settings)").all() as any[];
            const hasUpdatedAt = guildSettingsInfo.some((col: any) => col.name === 'updated_at');

            if (!hasUpdatedAt) {
                logger.warn({ msg: 'schema_validation_failed', guildId, table: 'guild_settings', missing: 'updated_at' });
                // Attempt to add the column as a fallback
                try {
                    db.exec("ALTER TABLE guild_settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;");
                    logger.info({ msg: 'schema_repair_success', guildId, table: 'guild_settings', column: 'updated_at' });
                } catch (repairError: any) {
                    logger.error({ msg: 'schema_repair_failed', guildId, table: 'guild_settings', error: String(repairError) });
                }
            }
        } catch (validationError: any) {
            logger.warn({ msg: 'schema_validation_error', guildId, error: String(validationError) });
        }

        logger.info({ msg: 'migrate_guild_done', guildId });
    } catch (e) {
        logger.error({ msg: 'migrate_guild_error', guildId, error: String(e) });
        throw e;
    }
}
