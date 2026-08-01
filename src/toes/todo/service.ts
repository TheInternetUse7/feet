import type { DatabaseSync } from 'node:sqlite';

export interface TodoItem {
  id: number;
  user_id: string;
  task: string;
  completed_at: string | null;
  created_at: string;
}

export function initTable(db: DatabaseSync): void {
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
}

export function addTask(db: DatabaseSync, userId: string, task: string): TodoItem {
  return db
    .prepare(
      'INSERT INTO toe_todo_items (user_id, task) VALUES (?, ?) RETURNING id, user_id, task, completed_at, created_at',
    )
    .get(userId, task) as unknown as TodoItem;
}

export function listPending(db: DatabaseSync, userId: string): TodoItem[] {
  return db
    .prepare(
      'SELECT * FROM toe_todo_items WHERE user_id = ? AND completed_at IS NULL ORDER BY id',
    )
    .all(userId) as unknown as TodoItem[];
}

export function listCompleted(db: DatabaseSync, userId: string): TodoItem[] {
  return db
    .prepare(
      'SELECT * FROM toe_todo_items WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC, id DESC',
    )
    .all(userId) as unknown as TodoItem[];
}

export function completeTask(db: DatabaseSync, id: number, userId: string): boolean {
  const result = db
    .prepare(
      "UPDATE toe_todo_items SET completed_at = datetime('now') WHERE id = ? AND user_id = ? AND completed_at IS NULL",
    )
    .run(id, userId);
  return result.changes > 0;
}

export function clearCompleted(db: DatabaseSync, userId: string): number {
  const result = db
    .prepare(
      'DELETE FROM toe_todo_items WHERE user_id = ? AND completed_at IS NOT NULL',
    )
    .run(userId);
  return result.changes as number;
}

export function removeTask(db: DatabaseSync, id: number, userId: string): boolean {
  const result = db
    .prepare('DELETE FROM toe_todo_items WHERE id = ? AND user_id = ?')
    .run(id, userId);
  return result.changes > 0;
}
