const logs = document.getElementById('logs');
const statusEl = document.getElementById('status');

function appendLog(line) {
  if (!line) return;
  const atBottom = Math.abs(logs.scrollHeight - logs.scrollTop - logs.clientHeight) < 8;
  logs.textContent += (logs.textContent ? '\n' : '') + line;
  if (atBottom) logs.scrollTop = logs.scrollHeight;
}

function setStatus(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (ok ? 'ok' : 'err');
}

botGUI.onLogLine((line) => appendLog(line));

document.getElementById('btnBuild').addEventListener('click', async () => {
  try { await botGUI.build(); appendLog('Build complete.'); } catch (e) { appendLog('Build failed: ' + (e?.message || e)); }
});

document.getElementById('btnStart').addEventListener('click', async () => {
  try { const r = await botGUI.start(); if (!r?.started) appendLog('Bot already running.'); } catch (e) { appendLog('Start failed: ' + (e?.message || e)); }
});

document.getElementById('btnStop').addEventListener('click', async () => {
  try { const r = await botGUI.stop(); if (!r?.stopped) appendLog('Bot is not running.'); } catch (e) { appendLog('Stop failed: ' + (e?.message || e)); }
});

document.getElementById('btnReboot').addEventListener('click', async () => {
  appendLog('Rebooting...');
  try { await botGUI.reboot(); } catch (e) { appendLog('Reboot failed: ' + (e?.message || e)); }
});

document.getElementById('btnSend').addEventListener('click', async () => {
  const guildId = document.getElementById('guildId').value.trim();
  const channelId = document.getElementById('channelId').value.trim();
  const content = document.getElementById('message').value;
  if (!channelId) { setStatus('Channel ID is required.', false); return; }
  if (!content || !content.trim()) { setStatus('Message content is required.', false); return; }
  setStatus('Sending...');
  try {
    await botGUI.sendMessage(guildId || null, channelId, content);
    setStatus('Message sent.', true);
  } catch (e) {
    setStatus('Send failed: ' + (e?.message || e), false);
  }
});

document.getElementById('btnClear').addEventListener('click', () => {
  document.getElementById('message').value = '';
  setStatus('');
});

