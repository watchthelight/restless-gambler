import { spawn, execFile } from 'node:child_process';
import { audit } from '../admin/roles.js';

export async function restartProcess({ method, guildId, channelId, actorUid }: { method: string; guildId?: string | null; channelId?: string | null; actorUid: string }) {
  try {
    audit(actorUid, 'admin_reboot', undefined, { method, guildId: guildId ?? null, channelId: channelId ?? null, timestamp: Date.now() });
  } catch {}

  try {
    // @ts-ignore - client is available via global in many bots; ignore if not present
    if ((global as any).client) await (global as any).client.destroy().catch(() => {});
  } catch {}

  const cmd = process.env.REBOOT_CMD;
  if (cmd && cmd.trim().length > 0) {
    // Split into executable and args naively by spaces (simple case). Users can provide a path + args safely.
    const parts = cmd.split(' ').filter(Boolean);
    const file = parts.shift() as string;
    execFile(file, parts, (err) => {
      if (err) {
        console.error('reboot exec failed', err);
        process.exit(1);
      } else {
        process.exit(0);
      }
    });
    return;
  }
  // Self re-exec
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ msg: 'reboot', method: 'self-reexec' }));
  try {
    const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (e) {
    console.error('self-reexec spawn failed', e);
  }
  process.exit(0);
}
