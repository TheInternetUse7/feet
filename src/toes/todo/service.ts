import type { DatabaseSync } from "node:sqlite";
import { get, all, run } from "../../db/query.js";
import { migrate, type Migration } from "../../db/migrate.js";

export interface TodoItem {
  id: number;
  user_id: string;
  task: string;
  completed_at: string | null;
  created_at: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    up(db: DatabaseSync) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS toe_todo_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          task TEXT NOT NULL,
          completed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_todo_user ON toe_todo_items(user_id, completed_at);
      `);
    },
  },
];

export function initTable(db: DatabaseSync): void {
  migrate(db, "todo", migrations);
}

export function addTask(db: DatabaseSync, userId: string, task: string): TodoItem {
  return get<TodoItem>(
    db,
    "INSERT INTO toe_todo_items (user_id, task) VALUES (?, ?) RETURNING id, user_id, task, completed_at, created_at",
    userId,
    task,
  )!;
}

export function listPending(db: DatabaseSync, userId: string): TodoItem[] {
  return all<TodoItem>(
    db,
    "SELECT * FROM toe_todo_items WHERE user_id = ? AND completed_at IS NULL ORDER BY id",
    userId,
  );
}

export function listCompleted(db: DatabaseSync, userId: string): TodoItem[] {
  return all<TodoItem>(
    db,
    "SELECT * FROM toe_todo_items WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC, id DESC",
    userId,
  );
}

export function completeTask(db: DatabaseSync, id: number, userId: string): boolean {
  const result = run(
    db,
    "UPDATE toe_todo_items SET completed_at = datetime('now') WHERE id = ? AND user_id = ? AND completed_at IS NULL",
    id,
    userId,
  );
  return Number(result.changes) > 0;
}

export function clearCompleted(db: DatabaseSync, userId: string): number {
  const result = run(
    db,
    "DELETE FROM toe_todo_items WHERE user_id = ? AND completed_at IS NOT NULL",
    userId,
  );
  return Number(result.changes);
}

export function removeTask(db: DatabaseSync, id: number, userId: string): boolean {
  const result = run(db, "DELETE FROM toe_todo_items WHERE id = ? AND user_id = ?", id, userId);
  return Number(result.changes) > 0;
}
