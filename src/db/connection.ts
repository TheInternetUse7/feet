import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

export function createDatabase(): DatabaseSync {
  const dbPath = process.env.DB_PATH ?? path.resolve('feet.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
