import { Client, Events, parsePrefixCommand } from '@fluxerjs/core';

const client = new Client({ intents: 0 });

client.on(Events.Ready, () => {
  console.log(`Ready! Logged in as ${client.user?.username}`);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content) return;

  const parsed = parsePrefixCommand(message.content, '.');
  if (!parsed) return;

  if (parsed.command === 'ping') {
    await message.reply('Pong!');
  }
});

const token = process.env.FLUXER_BOT_TOKEN;
if (!token) {
  console.error('FLUXER_BOT_TOKEN is not set');
  process.exit(1);
}

await client.login(token);
