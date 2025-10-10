import { allCommands } from './slash/index.js';

export type DesiredCommand = { name: string; json: any };

export function getDesiredCommands(): DesiredCommand[] {
  const builders = allCommands();
  const out: DesiredCommand[] = [];
  const seen = new Set<string>();
  for (const b of builders as any[]) {
    const j = typeof b.toJSON === 'function' ? b.toJSON() : b;
    const name = j.name as string;
    if (!name || name.length > 32) continue;
    if (seen.has(name)) continue; // ensure uniqueness
    seen.add(name);
    out.push({ name, json: j });
  }
  return out;
}

