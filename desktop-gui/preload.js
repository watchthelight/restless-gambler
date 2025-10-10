import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('botGUI', {
  build: () => ipcRenderer.invoke('build'),
  start: () => ipcRenderer.invoke('start'),
  stop: () => ipcRenderer.invoke('stop'),
  reboot: () => ipcRenderer.invoke('reboot'),
  sendMessage: (guildId, channelId, content) => ipcRenderer.invoke('send-message', { guildId, channelId, content }),
  onLogLine: (cb) => ipcRenderer.on('log-line', (_e, line) => { try { cb(line); } catch {} })
});

