import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export type SlashModule = { data: SlashCommandBuilder; execute: (i: ChatInputCommandInteraction, ctx?: any) => Promise<void> };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

export async function loadSlash(): Promise<Map<string, SlashModule>> {
  const map = new Map<string, SlashModule>();
  // Resolve to compiled dist directory of this module
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = walk(here);
  for (const f of files) {
    if (f.endsWith(path.sep + 'index.js')) continue; // skip self
    try {
      const m: any = await import(pathToFileURL(f).href);
      const data = m?.data;
      const exec = m?.execute || m?.run; // support execute or run
      if (data?.name && typeof exec === 'function') {
        if (!map.has(data.name)) map.set(data.name, { data, execute: exec });
      }
    } catch {
      // ignore broken modules
    }
  }
  return map;
}

