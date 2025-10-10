import type Database from "better-sqlite3";

export function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table});`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

export const hasColumn = tableHasColumn;

export function ensureColumn(
  db: Database.Database,
  table: string,
  column: string,
  ddlType: string,
  defaultValueSql?: string,
): void {
  if (!tableHasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddlType};`);
    if (defaultValueSql) db.exec(defaultValueSql);
  }
}
