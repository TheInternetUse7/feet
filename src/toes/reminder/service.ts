import type Database from 'better-sqlite3';

export interface ReminderItem {
  id: number;
  user_id: string;
  channel_id: string;
  message: string;
  trigger_at: string;
  is_sent: number;
}

export function initTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS toe_reminder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message TEXT NOT NULL,
      trigger_at TIMESTAMP NOT NULL,
      is_sent INTEGER DEFAULT 0
    )
  `);
}

export function addReminder(
  db: Database.Database,
  userId: string,
  channelId: string,
  message: string,
  triggerAt: Date,
): ReminderItem {
  const stmt = db.prepare(
    'INSERT INTO toe_reminder_items (user_id, channel_id, message, trigger_at) VALUES (?, ?, ?, ?)',
  );
  const result = stmt.run(userId, channelId, message, triggerAt.toISOString().replace('T', ' ').replace('Z', ''));
  return db.prepare('SELECT * FROM toe_reminder_items WHERE id = ?').get(result.lastInsertRowid) as ReminderItem;
}

export function listPending(db: Database.Database, userId: string): ReminderItem[] {
  return db
    .prepare(
      'SELECT * FROM toe_reminder_items WHERE user_id = ? AND is_sent = 0 ORDER BY trigger_at',
    )
    .all(userId) as ReminderItem[];
}

export function cancelReminder(db: Database.Database, id: number, userId: string): boolean {
  const result = db
    .prepare(
      'DELETE FROM toe_reminder_items WHERE id = ? AND user_id = ? AND is_sent = 0',
    )
    .run(id, userId);
  return result.changes > 0;
}

export function getDueReminders(db: Database.Database): ReminderItem[] {
  return db
    .prepare(
      "SELECT * FROM toe_reminder_items WHERE trigger_at <= datetime('now', 'utc') AND is_sent = 0",
    )
    .all() as ReminderItem[];
}

export function markSent(db: Database.Database, id: number): void {
  db.prepare('UPDATE toe_reminder_items SET is_sent = 1 WHERE id = ?').run(id);
}
