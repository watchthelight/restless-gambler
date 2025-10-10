import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('data/guilds/1414225727179591712.db');
const db = new Database(dbPath, { readonly: true });

try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name));
    if (tables.some(t => t.name === 'guild_settings')) {
        console.log('guild_settings exists');
        const row = db.prepare('SELECT * FROM guild_settings LIMIT 1').get();
        console.log('Row:', row);
    } else {
        console.log('guild_settings does not exist');
    }
} catch (e) {
    console.error(e);
} finally {
    db.close();
}
