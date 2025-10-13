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
        info: QUIET ? (() => { }) : (log.info?.bind(log) ?? (() => { })),
        warn: log.warn?.bind(log) ?? (() => { }),
        error: log.error?.bind(log) ?? (() => { }),
    };

    // Helper functions for schema inspection
    const hasTable = (table: string) => !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(table);
    const hasCol = (table: string, col: string) => !!db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`).pluck().get(table, col);
    const getColType = (table: string, col: string) => db.prepare(`SELECT type FROM pragma_table_info(?) WHERE name = ?`).pluck().get(table, col) as string;

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
            let sql = stripOuterTransactions(raw).trim();

            // Special handling for 003_add_updated_at_to_guild_settings.sql: Skip if column already exists
            if (file === '003_add_updated_at_to_guild_settings.sql') {
                if (hasCol('guild_settings', 'updated_at')) {
                    logger.info({ msg: 'migration_skip_column_exists', guildId, file, table: 'guild_settings', column: 'updated_at' });
                    db.prepare("INSERT OR IGNORE INTO _migrations(name, applied_at) VALUES (?, strftime('%s','now'))").run(file);
                    continue;
                }
            }

            // Special handling for 011_convert_to_huge_decimal.sql: Generate safe conversions based on existing schema
            if (file === '011_convert_to_huge_decimal.sql') {
                const conversions: { table: string; cols: string[] }[] = [
                    { table: 'balances', cols: ['balance'] },
                    { table: 'blackjack_sessions', cols: ['bet'] },
                    { table: 'holdem_tables', cols: ['small_blind', 'buy_in_min', 'buy_in_max'] },
                    { table: 'roulette_rounds', cols: ['payout_total'] },
                    { table: 'slots_rounds', cols: ['bet', 'payout'] },
                    { table: 'loans', cols: ['amount'] },
                ];
                const safeSqlParts: string[] = [];
                for (const { table, cols } of conversions) {
                    if (!hasTable(table)) continue;
                    for (const col of cols) {
                        if (!hasCol(table, col)) continue;
                        const colType = getColType(table, col);
                        if (colType === 'TEXT') continue; // Already TEXT, skip
                        // For balances, use temp table approach for safety
                        if (table === 'balances' && col === 'balance') {
                            safeSqlParts.push(`
CREATE TABLE balances_huge (
  user_id TEXT PRIMARY KEY,
  balance TEXT NOT NULL DEFAULT '{"t":"hd","s":0,"m":"0","sc":"0","e":"0"}',
  updated_at INTEGER NOT NULL
);
INSERT INTO balances_huge (user_id, balance, updated_at)
SELECT
  user_id,
  CASE
    WHEN balance LIKE '{%' THEN balance
    ELSE '{"t":"hd","s":' ||
      CASE WHEN CAST(balance AS INTEGER) < 0 THEN '-1' ELSE CASE WHEN CAST(balance AS INTEGER) = 0 THEN '0' ELSE '1' END END ||
      ',"m":"' || ABS(CAST(balance AS INTEGER)) || '","sc":"0","e":"0"}'
  END as balance,
  COALESCE(updated_at, strftime('%s','now')) as updated_at
FROM balances;
DROP TABLE balances;
ALTER TABLE balances_huge RENAME TO balances;
CREATE INDEX IF NOT EXISTS idx_balances_user ON balances(user_id);
                            `.trim());
                        } else {
                            // For other tables, use UPDATE to convert to JSON TEXT
                            safeSqlParts.push(`UPDATE ${table} SET ${col} = '{"t":"hd","s":' ||
  CASE WHEN CAST(${col} AS INTEGER) < 0 THEN '-1' ELSE CASE WHEN CAST(${col} AS INTEGER) = 0 THEN '0' ELSE '1' END END ||
  ',"m":"' || ABS(CAST(${col} AS INTEGER)) || '","sc":"0","e":"0"}' WHERE ${col} IS NOT NULL;`);
                        }
                    }
                }
                sql = safeSqlParts.join('\n');
            }

            const spName = `mig_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;
            db.exec(`SAVEPOINT ${spName};`);
            try {
                // Split SQL into statements for better error reporting
                const stmts = sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean);
                for (const stmt of stmts) {
                    try {
                        db.exec(stmt);
                    } catch (stmtError: any) {
                        logger.error({ msg: 'migrate_guild_error', guildId, file, error: String(stmtError), message: stmtError?.message, failingStmt: stmt.slice(0, 200) });
                        throw stmtError;
                    }
                }
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
                    logger.error({ msg: 'migrate_guild_error', guildId, file, error: String(e), message: e?.message, sqlPreview: sql.substring(0, 200) });
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
