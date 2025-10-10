import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '-' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function which(bin: string): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where', [bin], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return out.split(/\r?\n/)[0] || null;
    } else {
      const out = execFileSync('bash', ['-lc', `command -v ${bin}`], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      return out || null;
    }
  } catch { return null; }
}

function backupOne(dbPath: string, backupsDir: string): string | null {
  if (!dbPath) return null;
  const abs = path.resolve(dbPath);
  if (!fs.existsSync(abs)) return null;
  const base = path.basename(abs);
  const out = path.join(backupsDir, base);
  const sqlite = which('sqlite3');
  try { fs.mkdirSync(backupsDir, { recursive: true }); } catch {}
  try {
    if (sqlite) {
      execFileSync(sqlite, [abs, ".backup", out], { stdio: 'inherit' });
    } else {
      fs.copyFileSync(abs, out);
    }
    return out;
  } catch (e) {
    console.error('backup failed for', abs, e);
    return null;
  }
}

async function main() {
  const stampDir = nowStamp();
  const backupsDir = path.resolve(path.join('backups', stampDir));
  const dataDb = process.env.DATA_DB_PATH || './data/data.db';
  const adminDb = (process.env.ADMIN_GLOBAL_DB_PATH || process.env.ADMIN_DB_PATH || './data/admin.db');
  const dataDir = process.env.DATA_DIR || './data/guilds';
  const made: string[] = [];
  const a = backupOne(adminDb, backupsDir); if (a) made.push(a);
  const d = backupOne(dataDb, backupsDir); if (d) made.push(d);
  try {
    if (fs.existsSync(dataDir)) {
      for (const f of fs.readdirSync(dataDir)) {
        if (!f.endsWith('.db')) continue;
        const p = path.join(dataDir, f);
        const b = backupOne(p, backupsDir);
        if (b) made.push(b);
      }
    }
  } catch {}
  console.log(JSON.stringify({ msg: 'backup_done', dir: backupsDir, files: made }));
}

main().catch((e) => { console.error('backup error', e); process.exit(1); });
