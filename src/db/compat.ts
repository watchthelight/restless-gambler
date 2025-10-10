import type Database from 'better-sqlite3';

export function ensureCompatViews(db: Database.Database) {
    db.exec(`
    CREATE VIEW IF NOT EXISTS v_guild_settings AS
    SELECT
      MAX(CASE WHEN key='theme' THEN value END) AS theme,
      MAX(CASE WHEN key='cards_style' THEN value END) AS cards_style,
      MAX(updated_at) AS updated_at
    FROM guild_settings;
  `);
}
