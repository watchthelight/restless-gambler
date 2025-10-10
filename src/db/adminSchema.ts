import type Database from "better-sqlite3";

type ColInfo = { name: string; notnull: 0 | 1; dflt_value: any };
function tableCols(db: Database.Database, table: string): ColInfo[] {
    return db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[];
}
function colNames(cols: ColInfo[]) { return new Set(cols.map(c => String(c.name))); }

export function ensureSuperAdminsSchema(db: Database.Database, log = console) {
    const has = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='super_admins'`).all().length > 0;
    if (!has) {
        db.exec(`CREATE TABLE super_admins(user_id TEXT PRIMARY KEY, added_at INTEGER);`);
        log.info?.({ msg: "admin_schema_created" });
        return;
    }
    const cols = tableCols(db, "super_admins");
    const names = colNames(cols);
    if (!names.has("added_at")) {
        db.exec(`ALTER TABLE super_admins ADD COLUMN added_at INTEGER;`);
        if (names.has("created_at")) {
            db.exec(`UPDATE super_admins SET added_at = created_at WHERE added_at IS NULL;`);
        } else {
            db.exec(`UPDATE super_admins SET added_at = strftime('%s','now') WHERE added_at IS NULL;`);
        }
        log.info?.({ msg: "admin_schema_upgraded", added_at: true });
    }
}

export function superAdminInsertSQL(db: Database.Database) {
    const cols = tableCols(db, "super_admins");
    const names = colNames(cols);
    const hasCreated = names.has("created_at");
    const hasAdded = names.has("added_at");
    const createdNotNull = cols.find(c => c.name === "created_at")?.notnull === 1;

    // Build column list and values to satisfy NOT NULL constraints
    const fields: string[] = ["user_id"];
    const values: string[] = ["?"];
    const params: any[] = []; // we'll push user_id later

    if (hasAdded) {
        fields.push("added_at");
        values.push("strftime('%s','now')");
    }
    if (hasCreated) {
        // If created_at exists and is NOT NULL, we must set it.
        if (createdNotNull) {
            fields.push("created_at");
            values.push("strftime('%s','now')");
        }
    }

    const sql = `INSERT INTO super_admins(${fields.join(", ")}) VALUES(${values.join(", ")})
               ON CONFLICT(user_id) DO NOTHING`;
    return { sql };
}
