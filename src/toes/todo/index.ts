import { EmbedBuilder } from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import type { Message } from "@fluxerjs/core";
import * as service from "./service.js";
import { capList } from "../../shared/list.js";
import { parsePositiveId } from "../../shared/id.js";

const LIST_LIMIT = 20;

const todoToe: ToeModule = {
  name: "todo",
  description: "Manage your personal task list",
  help: [
    "**`.todo add <task>`** - Add a new task",
    "**`.todo list [done]`** - List pending tasks (add `done` for completed)",
    "**`.todo done <id>`** - Mark a task as completed",
    "**`.todo remove <id>`** - Delete a task",
    "**`.todo clear --yes`** - Remove all completed tasks (requires confirmation)",
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
      const item = service.addTask(ctx.db, message.author.id, task);
      await message.reply(`Task #${item.id} added: **${item.task}**`);
      return;
    }

    if (sub === "list") {
      const showDone = args[1]?.toLowerCase() === "done";
      const items = showDone
        ? service.listCompleted(ctx.db, message.author.id)
        : service.listPending(ctx.db, message.author.id);
      if (items.length === 0) {
        await message.reply(showDone ? "No completed tasks." : "No pending tasks.");
        return;
      }
      const lines = capList(items, LIST_LIMIT, (i) => `\`#${i.id}\` ${i.task}`);
      const embed = new EmbedBuilder()
        .setTitle(showDone ? "Completed Tasks" : "Pending Tasks")
        .setColor(showDone ? 0x57f287 : 0x5865f2)
        .setDescription(lines.join("\n"));
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === "done" || sub === "remove") {
      const id = parsePositiveId(args[1]);
      if (id === null) {
        await message.reply(`Usage: \`.todo ${sub} <id>\``);
        return;
      }
      const ok =
        sub === "done"
          ? service.completeTask(ctx.db, id, message.author.id)
          : service.removeTask(ctx.db, id, message.author.id);
      if (!ok) {
        await message.reply(`Task #${id} not found or already completed.`);
        return;
      }
      await message.reply(
        sub === "done" ? `Task #${id} marked as completed.` : `Task #${id} removed.`,
      );
      return;
    }

    if (sub === "clear") {
      if (args[1] !== "--yes") {
        await message.reply(
          "This permanently deletes all completed tasks. Run `.todo clear --yes` to confirm.",
        );
        return;
      }
      const count = service.clearCompleted(ctx.db, message.author.id);
      await message.reply(`Cleared ${count} task${count === 1 ? "" : "s"}.`);
      return;
    }

    await message.reply("Usage: `.todo <add|list|done|remove|clear>`");
  },
};

export default todoToe;
