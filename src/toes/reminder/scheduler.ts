import type { Client } from "@fluxerjs/core";
import type { DatabaseSync } from "node:sqlite";
import * as service from "./service.js";

const DM_BLOCKED_CODE = "CANNOT_SEND_MESSAGES_TO_USER";

function errorCode(err: unknown): string | undefined {
  return err instanceof Error ? (err as { code?: string }).code : undefined;
}

async function sendViaDm(client: Client, reminder: service.ReminderItem): Promise<Error | null> {
  try {
    const user = await client.users.fetch(reminder.user_id);
    await user.send(`Reminder: ${reminder.message}`);
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

export function startScheduler(client: Client, db: DatabaseSync): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const due = service.getDueReminders(db);
      if (due.length > 0) console.log(`[SCHEDULER] Found ${due.length} due reminder(s)`);
      for (const reminder of due) {
        try {
          if (service.getDeliveryMode(db, reminder.user_id) === "dm") {
            const err = await sendViaDm(client, reminder);
            if (!err) {
              service.markSent(db, reminder.id);
              console.log(`[SCHEDULER] Sent reminder #${reminder.id} via DM`);
              continue;
            }
            if (errorCode(err) === DM_BLOCKED_CODE) {
              service.setDeliveryMode(db, reminder.user_id, "channel");
              console.log(
                `[SCHEDULER] DMs blocked for user ${reminder.user_id}; delivery mode reverted to channel`,
              );
            }
            console.warn(
              `[SCHEDULER] DM failed for reminder #${reminder.id} (${errorCode(err) ?? "unknown"} — ${err.message}), falling back to channel`,
            );
          }
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
