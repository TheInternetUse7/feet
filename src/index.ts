import { Client, Events } from "@fluxerjs/core";
import type { ToeModule } from "./types/toe.js";
import { createDatabase } from "./db/connection.js";
import { loadToes } from "./core/toeLoader.js";
import { log } from "./shared/logger.js";

const logger = log("boot");

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) {
  logger.error("FLUXER_BOT_TOKEN is not set");
  process.exit(1);
}

const client = new Client({ intents: 0 });
const db = createDatabase();
let toes = new Map<string, ToeModule>();

client.on(Events.Ready, async () => {
  logger.info(`Ready! Logged in as ${client.user?.username}`);
  toes = await loadToes(client, db);
  logger.info(`${toes.size} TOE(s) loaded`);
});

client.on(Events.Error, (err) => {
  logger.error("Client error:", err);
});

async function shutdown() {
  logger.info("Destroying TOEs...");
  try {
    for (const toe of toes.values()) {
      if (toe.destroy) await toe.destroy();
    }
  } catch (err) {
    logger.error("TOE destroy failed:", err);
  } finally {
    db.close();
    client.destroy();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  process.exit(1);
});

try {
  await client.login(token);
} catch (err) {
  logger.error("Failed to login:", err);
  db.close();
  process.exit(1);
}
