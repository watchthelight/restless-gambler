import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export function openAdminDb(file = "data/admin_global.db") {
    const p = path.resolve(file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const db = new Database(p);
    db.pragma("journal_mode = WAL");
    return db;
}
