import type { DatabaseSync } from "node:sqlite";

export interface ReminderItem {
  id: number;
  user_id: string;
  channel_id: string;
  message: string;
  trigger_at: string;
  is_sent: number;
}

export function initTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS toe_reminder_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message TEXT NOT NULL,
      trigger_at TIMESTAMP NOT NULL,
      is_sent INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS toe_reminder_prefs (
      user_id TEXT PRIMARY KEY,
      delivery_mode TEXT NOT NULL DEFAULT 'channel' CHECK (delivery_mode IN ('channel', 'dm'))
    );
  `);
}

export type DeliveryMode = "channel" | "dm";

export function getDeliveryMode(db: DatabaseSync, userId: string): DeliveryMode {
  const row = db
    .prepare("SELECT delivery_mode FROM toe_reminder_prefs WHERE user_id = ?")
    .get(userId) as { delivery_mode: string } | undefined;
  return row?.delivery_mode === "dm" ? "dm" : "channel";
}

export function setDeliveryMode(db: DatabaseSync, userId: string, mode: DeliveryMode): void {
  db.prepare(
    `INSERT INTO toe_reminder_prefs (user_id, delivery_mode) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET delivery_mode = excluded.delivery_mode`,
  ).run(userId, mode);
}

export function addReminder(
  db: DatabaseSync,
  userId: string,
  channelId: string,
  message: string,
  triggerAt: Date,
): ReminderItem {
  const stmt = db.prepare(
    "INSERT INTO toe_reminder_items (user_id, channel_id, message, trigger_at) VALUES (?, ?, ?, ?)",
  );
  const result = stmt.run(
    userId,
    channelId,
    message,
    triggerAt.toISOString().replace("T", " ").replace("Z", ""),
  );
  return db
    .prepare("SELECT * FROM toe_reminder_items WHERE id = ?")
    .get(result.lastInsertRowid) as unknown as ReminderItem;
}

export function listPending(db: DatabaseSync, userId: string): ReminderItem[] {
  return db
    .prepare(
      "SELECT * FROM toe_reminder_items WHERE user_id = ? AND is_sent = 0 ORDER BY trigger_at",
    )
    .all(userId) as unknown as ReminderItem[];
}

export function cancelReminder(db: DatabaseSync, id: number, userId: string): boolean {
  const result = db
    .prepare("DELETE FROM toe_reminder_items WHERE id = ? AND user_id = ? AND is_sent = 0")
    .run(id, userId);
  return result.changes > 0;
}

export function getDueReminders(db: DatabaseSync): ReminderItem[] {
  return db
    .prepare(
      "SELECT * FROM toe_reminder_items WHERE trigger_at <= datetime('now', 'utc') AND is_sent = 0",
    )
    .all() as unknown as ReminderItem[];
}

export function markSent(db: DatabaseSync, id: number): void {
  db.prepare("UPDATE toe_reminder_items SET is_sent = 1 WHERE id = ?").run(id);
}
