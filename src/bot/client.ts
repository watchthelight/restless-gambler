import type { Client } from 'discord.js';

let _client: Client | null = null;

export function setClient(c: Client) {
  _client = c;
}

export function getClient(): Client {
  if (!_client) throw new Error('Client not initialized');
  return _client;
}

