import { Client, Events } from '@fluxerjs/core';
import { createDatabase } from './db/connection.js';
import { loadToes } from './core/toeLoader.js';

const client = new Client({ intents: 0 });
const db = createDatabase();

client.on(Events.Ready, async () => {
  console.log(`Ready! Logged in as ${client.user?.username}`);
  const toes = await loadToes(client, db);
  console.log(`[BOOT] ${toes.size} TOE(s) loaded`);
});

client.on(Events.Error, (err) => {
  console.error('Client error:', err);
});

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) {
  console.error('FLUXER_BOT_TOKEN is not set');
  process.exit(1);
}

await client.login(token);
