import { Client, Events } from "@fluxerjs/core";
import type { ToeModule } from "./types/toe.js";
import { createDatabase } from "./db/connection.js";
import { loadToes } from "./core/toeLoader.js";

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) {
  console.error("FLUXER_BOT_TOKEN is not set");
  process.exit(1);
}

const client = new Client({ intents: 0 });
const db = createDatabase();
let toes = new Map<string, ToeModule>();

client.on(Events.Ready, async () => {
  console.log(`Ready! Logged in as ${client.user?.username}`);
  toes = await loadToes(client, db);
  console.log(`[BOOT] ${toes.size} TOE(s) loaded`);
});

client.on(Events.Error, (err) => {
  console.error("Client error:", err);
});

async function shutdown() {
  console.log("\n[SHUTDOWN] Destroying TOEs...");
  try {
    for (const toe of toes.values()) {
      if (toe.destroy) await toe.destroy();
    }
  } catch (err) {
    console.error("[SHUTDOWN] TOE destroy failed:", err);
  } finally {
    db.close();
    client.destroy();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

try {
  await client.login(token);
} catch (err) {
  console.error("Failed to login:", err);
  db.close();
  process.exit(1);
}
