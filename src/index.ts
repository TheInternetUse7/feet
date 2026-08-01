import { Client, Events } from "@fluxerjs/core";
import type { ToeModule } from "./types/toe.js";
import { createDatabase } from "./db/connection.js";
import { loadToes } from "./core/toeLoader.js";

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
  for (const toe of toes.values()) {
    if (toe.destroy) await toe.destroy();
  }
  db.close();
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) {
  console.error("FLUXER_BOT_TOKEN is not set");
  process.exit(1);
}

await client.login(token);
