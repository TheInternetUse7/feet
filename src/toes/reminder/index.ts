import { EmbedBuilder } from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import type { Message } from "@fluxerjs/core";
import * as service from "./service.js";
import { startScheduler } from "./scheduler.js";

const DURATION_RE = /^(\d+)(s|m|h|d)$/;

function parseDuration(str: string): number | null {
  const match = DURATION_RE.exec(str);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  switch (match[2]) {
    case "s":
      return val * 1000;
    case "m":
      return val * 60 * 1000;
    case "h":
      return val * 60 * 60 * 1000;
    case "d":
      return val * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;

const reminderToe: ToeModule = {
  name: "reminder",
  description: "Schedule time-based reminders",
  help: [
    "**`.remind in <duration> <message>`** — Set a reminder (e.g., `.remind in 10m Check oven`)",
    "**`.remind list`** — Show pending reminders",
    "**`.remind cancel <id>`** — Cancel a pending reminder",
    "**`.remind dm on|off`** — Deliver reminders via DM instead of the channel (falls back to channel if DMs are blocked)",
    "",
    "Durations: `Ns`, `Nm`, `Nh`, `Nd`",
  ].join("\n"),
  prefixCommands: ["remind"],

  init(ctx: ToeContext) {
    service.initTable(ctx.db);
    if (!schedulerTimer) {
      schedulerTimer = startScheduler(ctx.client, ctx.db);
    }
  },

  async execute(message: Message, ctx: ToeContext, args: string[]) {
    const sub = args[0]?.toLowerCase();

    if (sub === "in") {
      const durationStr = args[1];
      const msgParts = args.slice(2);
      if (!durationStr || msgParts.length === 0) {
        await message.reply(
          "Usage: `.remind in <duration> <message>` (e.g., `.remind in 10m Check oven`)",
        );
        return;
      }

      const ms = parseDuration(durationStr);
      if (ms === null) {
        await message.reply(
          "Invalid duration. Use `Ns`, `Nm`, `Nh`, or `Nd` (e.g., `10m`, `2h`, `1d`).",
        );
        return;
      }

      const triggerAt = new Date(Date.now() + ms);
      const item = service.addReminder(
        ctx.db,
        message.author.id,
        message.channelId,
        msgParts.join(" "),
        triggerAt,
      );

      await message.reply(
        `Reminder #${item.id} set for <t:${Math.floor(triggerAt.getTime() / 1000)}:R>: **${item.message}**`,
      );
      return;
    }

    if (sub === "list") {
      const items = service.listPending(ctx.db, message.author.id);
      if (items.length === 0) {
        await message.reply("No pending reminders.");
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("Pending Reminders")
        .setColor(0xfee75c)
        .setDescription(
          items
            .map(
              (i) =>
                `\`#${i.id}\` <t:${Math.floor(new Date(i.trigger_at).getTime() / 1000)}:R> — ${i.message}`,
            )
            .join("\n"),
        );
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === "dm") {
      const mode = args[1]?.toLowerCase();
      if (mode === "on" || mode === "off") {
        service.setDeliveryMode(ctx.db, message.author.id, mode === "on" ? "dm" : "channel");
        await message.reply(
          mode === "on"
            ? "Reminders will be sent via DM (with fallback to this channel if DMs are blocked)."
            : "Reminders will be sent in the channel they were created in.",
        );
        return;
      }
      const current = service.getDeliveryMode(ctx.db, message.author.id);
      await message.reply(
        current === "dm" ? "DM delivery is **on**." : "DM delivery is **off** (channel delivery).",
      );
      return;
    }

    if (sub === "cancel") {
      const id = parseInt(args[1], 10);
      if (isNaN(id)) {
        await message.reply("Usage: `.remind cancel <id>`");
        return;
      }
      const ok = service.cancelReminder(ctx.db, id, message.author.id);
      if (!ok) {
        await message.reply(`Reminder #${id} not found or already sent.`);
        return;
      }
      await message.reply(`Reminder #${id} cancelled.`);
      return;
    }

    await message.reply("Usage: `.remind <in|list|cancel|dm>`");
  },

  async destroy() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  },
};

export default reminderToe;
