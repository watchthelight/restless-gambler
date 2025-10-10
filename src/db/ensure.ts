import { runMigrationsOnce } from './migrate.js';

export function ensureSchema(): void {
  // New flow: runMigrations handles global admin DB and legacy mono DB migration.
  runMigrationsOnce();
}
