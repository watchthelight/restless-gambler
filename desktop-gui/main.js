import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let botProc = null; // ChildProcess | null

// Noise filter settings
const NOISE_ENV = {
  NODE_NO_WARNINGS: '1',
  NPM_CONFIG_LOGLEVEL: 'error',
  NPM_CONFIG_PROGRESS: 'false',
  NPM_CONFIG_FUND: 'false',
  NPM_CONFIG_AUDIT: 'false',
};
const NOISE_RE = /deprecated|vulnerability|npm audit|are looking for funding|funding|\bWARN\b|warning/i;
const VERBOSE = process.env.VERBOSE === '1' || process.env.DEBUG === '1';

function loadConfig() {
  const cfgPath = path.join(__dirname, 'config.json');
  if (!fs.existsSync(cfgPath)) throw new Error(`Missing config.json at ${cfgPath}`);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const required = ['botDir', 'buildCommand', 'startCommand'];
  for (const k of required) if (!cfg[k] || typeof cfg[k] !== 'string' || cfg[k].trim() === '') throw new Error(`config.json missing field: ${k}`);
  return cfg;
}

function sendLog(line) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('log-line', line); } catch {}
}

function runShell(cmd, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, ...NOISE_ENV, ...extraEnv } });
    const tag = `[run] ${cmd}`;
    sendLog(`$ ${cmd}`);
    const forward = (d) => {
      const s = d.toString();
      s.split(/\r?\n/).forEach((l) => {
        if (!l) return;
        if (!VERBOSE && NOISE_RE.test(l)) return;
        sendLog(l);
      });
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('error', (e) => { sendLog(`[error] ${e.message}`); });
    child.on('close', (code) => {
      sendLog(`${tag} exited with code ${code}`);
      if (code === 0) resolve(true); else reject(new Error(`Exit ${code}`));
    });
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
}

function killTree(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) return resolve();
    const pid = proc.pid;
    if (process.platform === 'win32') {
      exec(`taskkill /PID ${pid} /T /F`, (err) => {
        if (err) sendLog(`[warn] taskkill error: ${err.message}`);
        resolve();
      });
    } else {
      try { proc.kill('SIGTERM'); } catch {}
      resolve();
    }
  });
}

function wireIpc() {
  const cfg = loadConfig();

  ipcMain.handle('build', async () => {
    try {
      await runShell(cfg.buildCommand, cfg.botDir, cfg.env || {});
      return true;
    } catch (e) {
      sendLog(`[build] error: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle('start', async () => {
    try {
      if (botProc && !botProc.killed) { sendLog('Bot already running.'); return { started: false }; }
      sendLog(`Starting bot: ${cfg.startCommand}`);
      botProc = spawn(cfg.startCommand, { cwd: cfg.botDir, shell: true, env: { ...process.env, ...NOISE_ENV, ...cfg.env } });
      const forward = (d) => {
        const s = d.toString();
        s.split(/\r?\n/).forEach((l) => { if (!l) return; if (!VERBOSE && NOISE_RE.test(l)) return; sendLog(l); });
      };
      botProc.stdout?.on('data', forward);
      botProc.stderr?.on('data', forward);
      botProc.on('exit', (code, signal) => {
        sendLog(`Bot exited with code ${code}${signal ? ` (signal ${signal})` : ''}`);
        botProc = null;
      });
      botProc.on('error', (e) => sendLog(`[bot] error: ${e.message}`));
      return { started: true };
    } catch (e) {
      sendLog(`[start] error: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle('stop', async () => {
    try {
      if (!botProc) { sendLog('Bot is not running.'); return { stopped: false }; }
      await killTree(botProc);
      botProc = null;
      sendLog('Bot stopped.');
      return { stopped: true };
    } catch (e) {
      sendLog(`[stop] error: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle('reboot', async () => {
    try {
      if (botProc) {
        await killTree(botProc);
        botProc = null;
      }
      await new Promise((r) => setTimeout(r, 800));
      sendLog('Reboot: starting bot...');
      botProc = spawn(cfg.startCommand, { cwd: cfg.botDir, shell: true, env: { ...process.env, ...NOISE_ENV, ...cfg.env } });
      const forward2 = (d) => {
        const s = d.toString();
        s.split(/\r?\n/).forEach((l) => { if (!l) return; if (!VERBOSE && NOISE_RE.test(l)) return; sendLog(l); });
      };
      botProc.stdout?.on('data', forward2);
      botProc.stderr?.on('data', forward2);
      botProc.on('exit', (code, signal) => { sendLog(`Bot exited with code ${code}${signal ? ` (signal ${signal})` : ''}`); botProc = null; });
      botProc.on('error', (e) => sendLog(`[bot] error: ${e.message}`));
      return { restarted: true };
    } catch (e) {
      sendLog(`[reboot] error: ${e.message}`);
      throw e;
    }
  });

  ipcMain.handle('send-message', async (_e, { guildId, channelId, content }) => {
    try {
      if (!channelId || !content) throw new Error('channelId and content required');
      const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
      if (!token) throw new Error('DISCORD_TOKEN (or BOT_TOKEN) not set in environment');
      const res = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content })
      });
      const text = await res.text();
      if (!res.ok) {
        sendLog(`[send-message] HTTP ${res.status}: ${text}`);
        throw new Error(text || `HTTP ${res.status}`);
      }
      sendLog(`Message sent to ${channelId}${guildId ? ` (guild ${guildId})` : ''}.`);
      return { ok: true };
    } catch (e) {
      sendLog(`[send-message] error: ${e.message}`);
      throw e;
    }
  });
}

app.whenReady().then(async () => {
  try {
    loadConfig();
  } catch (e) {
    // Surface config error
    console.error(e);
  }
  await createWindow();
  wireIpc();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
