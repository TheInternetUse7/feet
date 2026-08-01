import type { DatabaseSync } from 'node:sqlite';

export interface TodoItem {
  id: number;
  user_id: string;
  guild_id: string | null;
  task: string;
  status: string;
  created_at: string;
}

export function initTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS toe_todo_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT,
      task TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function addTask(db: DatabaseSync, userId: string, guildId: string | null, task: string): TodoItem {
  const stmt = db.prepare(
    'INSERT INTO toe_todo_items (user_id, guild_id, task) VALUES (?, ?, ?)',
  );
  const result = stmt.run(userId, guildId, task);
  return db.prepare('SELECT * FROM toe_todo_items WHERE id = ?').get(result.lastInsertRowid) as unknown as TodoItem;
}

export function listPending(db: DatabaseSync, userId: string, guildId: string | null): TodoItem[] {
  return db
    .prepare(
      'SELECT * FROM toe_todo_items WHERE user_id = ? AND guild_id IS ? AND status = ? ORDER BY id',
    )
    .all(userId, guildId, 'pending') as unknown as TodoItem[];
}

export function completeTask(db: DatabaseSync, id: number, userId: string): boolean {
  const result = db
    .prepare(
      'UPDATE toe_todo_items SET status = ? WHERE id = ? AND user_id = ? AND status = ?',
    )
    .run('completed', id, userId, 'pending');
  return result.changes > 0;
}

export function clearCompleted(db: DatabaseSync, userId: string, guildId: string | null): number {
  const result = db
    .prepare(
      'DELETE FROM toe_todo_items WHERE user_id = ? AND guild_id IS ? AND status = ?',
    )
    .run(userId, guildId, 'completed');
  return result.changes as number;
}
