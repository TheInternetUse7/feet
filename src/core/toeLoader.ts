import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Events, parsePrefixCommand } from "@fluxerjs/core";
import type { Client, Message } from "@fluxerjs/core";
import type { DatabaseSync } from "node:sqlite";
import type { ToeModule, ToeContext } from "../types/toe.js";
import { log } from "../shared/logger.js";

const PREFIX = ".";
const toeLog = log("toe");
const cmdLog = log("cmd");

let messageHandlerAttached = false;

export async function loadToes(client: Client, db: DatabaseSync): Promise<Map<string, ToeModule>> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const toesDir = path.resolve(__dirname, "..", "toes");
  const entries = await fs.readdir(toesDir, { withFileTypes: true });
  const modules = new Map<string, ToeModule>();
  const prefixMap = new Map<string, ToeModule>();
  const ctx: ToeContext = { client, db };

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const toePath = path.join(toesDir, entry.name, "index.js");
    try {
      const mod = await import(pathToFileURL(toePath).href);
      const toe: ToeModule = mod.default ?? mod.toe;

      if (!toe || typeof toe.name !== "string" || typeof toe.execute !== "function") {
        toeLog.warn(`Skipping ${entry.name}: invalid module shape`);
        continue;
      }

      if (toe.init) {
        await toe.init(ctx);
      }

      modules.set(toe.name, toe);

      for (const cmd of toe.prefixCommands) {
        prefixMap.set(cmd, toe);
      }

      toeLog.info(
        `Loaded: ${toe.name} (${toe.prefixCommands.map((c) => `${PREFIX}${c}`).join(", ")})`,
      );
    } catch (err) {
      toeLog.error(`Failed to load ${entry.name}:`, err);
    }
  }

  if (!messageHandlerAttached) {
    messageHandlerAttached = true;
    client.on(Events.MessageCreate, async (message: Message) => {
      if (message.author.bot || !message.content) return;

      const parsed = parsePrefixCommand(message.content, PREFIX);
      if (!parsed) return;

      const { command, args } = parsed;

      if (command === "help") {
        if (args[0]) {
          const toe = modules.get(args[0]);
          await message.reply(toe ? toe.help : `Unknown command: ${args[0]}`);
        } else {
          const lines = Array.from(modules.values()).map(
            (t) => `**${PREFIX}${t.prefixCommands[0]}** — ${t.description}`,
          );
          await message.reply(
            lines.length
              ? `${lines.join("\n")}\n\nUse \`.help <command>\` for details.`
              : "No commands loaded.",
          );
        }
        return;
      }

      const toe = prefixMap.get(command);
      if (!toe) return;

      cmdLog.debug(`.${command} by ${message.author.id} in ${message.channelId}`);

      try {
        await toe.execute(message, ctx, args);
      } catch (err) {
        toeLog.error(`Error in ${toe.name}.${command}:`, err);
      }
    });
  }

  return modules;
}
