import type { DatabaseSync } from "node:sqlite";
import { log } from "../shared/logger.js";

const logger = log("migrate");

export interface Migration {
  version: number;
  up: (db: DatabaseSync) => void;
}

function currentVersion(db: DatabaseSync, namespace: string): number {
  const row = db
    .prepare("SELECT version FROM feet_migrations WHERE namespace = ?")
    .get(namespace) as { version: number } | undefined;
  return row?.version ?? 0;
}

export function migrate(db: DatabaseSync, namespace: string, migrations: Migration[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feet_migrations (
      namespace TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const current = currentVersion(db, namespace);
  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;
    db.exec("BEGIN");
    try {
      migration.up(db);
      db.prepare(
        `INSERT INTO feet_migrations (namespace, version) VALUES (?, ?)
         ON CONFLICT(namespace) DO UPDATE SET version = excluded.version, applied_at = CURRENT_TIMESTAMP`,
      ).run(namespace, migration.version);
      db.exec("COMMIT");
      logger.info(`${namespace} -> v${migration.version}`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
