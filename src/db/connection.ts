import Database from 'better-sqlite3';
import path from 'node:path';

export function createDatabase(): Database.Database {
  const dbPath = path.resolve('feet.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
