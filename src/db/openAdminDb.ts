import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export function openAdminDb(file = "data/admin_global.db") {
    try { if (process.env.JEST_WORKER_ID) console.debug({ msg: 'open_admin_db', file }); } catch {}
    // Respect SQLite's in-memory special name
    if (file === ':memory:') {
        const mem = new Database(':memory:');
        mem.pragma("journal_mode = WAL");
        return mem;
    }
    const p = path.resolve(file);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const db = new Database(p);
    db.pragma("journal_mode = WAL");
    return db;
}
