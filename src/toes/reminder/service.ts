import type { DatabaseSync } from "node:sqlite";
import { get, all, run } from "../../db/query.js";
import { migrate, type Migration } from "../../db/migrate.js";
import { toUtcDbString } from "../../db/time.js";

export interface ReminderItem {
  id: number;
  user_id: string;
  channel_id: string;
  message: string;
  trigger_at: string;
  is_sent: number;
}

export type DeliveryMode = "channel" | "dm";

const migrations: Migration[] = [
  {
    version: 1,
    up(db: DatabaseSync) {
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
    },
  },
];

export function initTable(db: DatabaseSync): void {
  migrate(db, "reminder", migrations);
}

export function getDeliveryMode(db: DatabaseSync, userId: string): DeliveryMode {
  const row = get<{ delivery_mode: string }>(
    db,
    "SELECT delivery_mode FROM toe_reminder_prefs WHERE user_id = ?",
    userId,
  );
  return row?.delivery_mode === "dm" ? "dm" : "channel";
}

export function setDeliveryMode(db: DatabaseSync, userId: string, mode: DeliveryMode): void {
  run(
    db,
    `INSERT INTO toe_reminder_prefs (user_id, delivery_mode) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET delivery_mode = excluded.delivery_mode`,
    userId,
    mode,
  );
}

export function addReminder(
  db: DatabaseSync,
  userId: string,
  channelId: string,
  message: string,
  triggerAt: Date,
): ReminderItem {
  const result = run(
    db,
    "INSERT INTO toe_reminder_items (user_id, channel_id, message, trigger_at) VALUES (?, ?, ?, ?)",
    userId,
    channelId,
    message,
    toUtcDbString(triggerAt),
  );
  return get<ReminderItem>(
    db,
    "SELECT * FROM toe_reminder_items WHERE id = ?",
    result.lastInsertRowid,
  )!;
}

export function listPending(db: DatabaseSync, userId: string): ReminderItem[] {
  return all<ReminderItem>(
    db,
    "SELECT * FROM toe_reminder_items WHERE user_id = ? AND is_sent = 0 ORDER BY trigger_at",
    userId,
  );
}

export function cancelReminder(db: DatabaseSync, id: number, userId: string): boolean {
  const result = run(
    db,
    "DELETE FROM toe_reminder_items WHERE id = ? AND user_id = ? AND is_sent = 0",
    id,
    userId,
  );
  return Number(result.changes) > 0;
}

export function getDueReminders(db: DatabaseSync): ReminderItem[] {
  return all<ReminderItem>(
    db,
    "SELECT * FROM toe_reminder_items WHERE trigger_at <= datetime('now', 'utc') AND is_sent = 0",
  );
}

export function markSent(db: DatabaseSync, id: number): void {
  run(db, "UPDATE toe_reminder_items SET is_sent = 1 WHERE id = ?", id);
}
