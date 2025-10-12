import fs from 'node:fs';
import path from 'node:path';

export type RebootMarker = { guildId: string; channelId: string };

const markerPath = path.resolve('.reboot.marker.json');

export async function setRebootMarker(marker: RebootMarker): Promise<void> {
  try {
    fs.writeFileSync(markerPath, JSON.stringify(marker), { encoding: 'utf8' });
  } catch { /* ignore */ }
}

export async function consumeRebootMarker(): Promise<RebootMarker | null> {
  try {
    if (!fs.existsSync(markerPath)) return null;
    const text = fs.readFileSync(markerPath, 'utf8');
    try { fs.unlinkSync(markerPath); } catch {}
    const data = JSON.parse(text);
    if (data && typeof data.guildId === 'string' && typeof data.channelId === 'string') {
      return { guildId: data.guildId, channelId: data.channelId };
    }
  } catch { /* ignore */ }
  return null;
}

