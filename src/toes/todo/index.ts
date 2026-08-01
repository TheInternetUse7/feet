import { EmbedBuilder } from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import type { Message } from "@fluxerjs/core";
import * as service from "./service.js";

const todoToe: ToeModule = {
  name: "todo",
  description: "Manage personal and channel task lists",
  help: [
    "**`.todo add <task>`** - Add a new task",
    "**`.todo list`** - List pending tasks",
    "**`.todo done <id>`** - Mark a task as completed",
    "**`.todo clear`** - Remove all completed tasks",
  ].join("\n"),
  prefixCommands: ["todo"],

  init(ctx: ToeContext) {
    service.initTable(ctx.db);
  },

  async execute(message: Message, ctx: ToeContext, args: string[]) {
    const sub = args[0]?.toLowerCase();

    if (sub === "add") {
      const task = args.slice(1).join(" ");
      if (!task) {
        await message.reply("Usage: `.todo add <task>`");
        return;
      }
      const item = service.addTask(
        ctx.db,
        message.author.id,
        message.guildId,
        task,
      );
      await message.reply(`Task #${item.id} added: **${item.task}**`);
      return;
    }

    if (sub === "list") {
      const items = service.listPending(
        ctx.db,
        message.author.id,
        message.guildId,
      );
      if (items.length === 0) {
        await message.reply("No pending tasks.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("Pending Tasks")
        .setColor(0x5865f2)
        .setDescription(items.map((i) => `\`#${i.id}\` ${i.task}`).join("\n"));
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === "done") {
      const id = parseInt(args[1], 10);
      if (isNaN(id)) {
        await message.reply("Usage: `.todo done <id>`");
        return;
      }
      const ok = service.completeTask(ctx.db, id, message.author.id);
      if (!ok) {
        await message.reply(`Task #${id} not found or already completed.`);
        return;
      }
      await message.reply(`Task #${id} marked as completed.`);
      return;
    }

    if (sub === "clear") {
      const count = service.clearCompleted(
        ctx.db,
        message.author.id,
        message.guildId,
      );
      await message.reply(`Cleared ${count} completed task(s).`);
      return;
    }

    await message.reply("Usage: `.todo <add|list|done|clear>`");
  },
};

export default todoToe;
