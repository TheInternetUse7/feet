import type { DatabaseSync, SQLInputValue, StatementResultingChanges } from "node:sqlite";

export function get<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

export function all<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function run(
  db: DatabaseSync,
  sql: string,
  ...params: SQLInputValue[]
): StatementResultingChanges {
  return db.prepare(sql).run(...params);
}
