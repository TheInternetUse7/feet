import type { Client } from "@fluxerjs/core";
import type { DatabaseSync } from "node:sqlite";
import * as service from "./service.js";

export function startScheduler(client: Client, db: DatabaseSync): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const due = service.getDueReminders(db);
      if (due.length > 0) console.log(`[SCHEDULER] Found ${due.length} due reminder(s)`);
      for (const reminder of due) {
        try {
          await client.channels.send(
            reminder.channel_id,
            `<@${reminder.user_id}> Reminder: ${reminder.message}`,
          );
          service.markSent(db, reminder.id);
          console.log(`[SCHEDULER] Sent reminder #${reminder.id}`);
        } catch (err) {
          console.error(`[SCHEDULER] Failed to send reminder #${reminder.id}:`, err);
          service.markSent(db, reminder.id);
        }
      }
    } catch (err) {
      console.error(`[SCHEDULER] Error:`, err);
    }
  }, 10_000);
}
