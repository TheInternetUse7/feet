import { EmbedBuilder, type Client, type GuildChannel } from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import type { Message } from "@fluxerjs/core";
import * as service from "./service.js";
import { startScheduler, postNewItems, pollFeed } from "./scheduler.js";
import { fetchFeed } from "./fetcher.js";
import { parseUtcDbString } from "../../db/time.js";

const ID_RE = /^[1-9]\d*$/;
const CHANNEL_MENTION_RE = /^<#(\d+)>$/;
const LIST_LIMIT = 25;
const BACKLOG_PAGE_SIZE = 10;
const MAX_POST_LIMIT = 50;

function parseId(str: string | undefined): number | null {
  return str !== undefined && ID_RE.test(str) ? parseInt(str, 10) : null;
}

function resolveChannelId(client: Client, ref: string | undefined): string | null {
  if (!ref) return null;
  const mention = CHANNEL_MENTION_RE.exec(ref);
  if (mention) return mention[1];
  if (/^\d+$/.test(ref)) return ref;
  const byName = Array.from(client.channels.values()).find(
    (c): c is GuildChannel => "name" in c && c.name === ref,
  );
  return byName ? byName.id : null;
}

let schedulerTimer: NodeJS.Timeout | null = null;

const rssToe: ToeModule = {
  name: "rss",
  description: "Subscribe to RSS/Atom feeds and post new items",
  help: [
    "**`.rss add <url> [#channel]`** — Subscribe to a feed (defaults to this channel)",
    "**`.rss remove <id>`** — Unsubscribe from a feed",
    "**`.rss list`** — Show subscribed feeds",
    "**`.rss limit <id> <n>`** — Max items posted per poll (1-50, 0 = unlimited, default 10)",
    "**`.rss backlog <id> [page]`** — Browse items skipped by the limit",
    "**`.rss fetch`** — Manually check all feeds for new items now",
    "",
    "The channel can be a mention, ID, or name. New items are posted as embeds every 5 minutes.",
  ].join("\n"),
  prefixCommands: ["rss"],

  init(ctx: ToeContext) {
    service.initTable(ctx.db);
    if (!schedulerTimer) {
      schedulerTimer = startScheduler(ctx.client, ctx.db);
    }
  },

  async execute(message: Message, ctx: ToeContext, args: string[]) {
    const sub = args[0]?.toLowerCase();

    if (sub === "add") {
      const url = args[1];
      if (!url) {
        await message.reply("Usage: `.rss add <url> [#channel]`");
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        await message.reply("That doesn't look like a valid URL.");
        return;
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        await message.reply("Only `http://` and `https://` URLs are supported.");
        return;
      }
      const feedUrl = parsed.toString();
      if (service.getFeedByUrl(ctx.db, feedUrl)) {
        await message.reply("That feed is already subscribed.");
        return;
      }

      const channelId = resolveChannelId(ctx.client, args[2]) ?? message.channelId;

      let data;
      try {
        data = await fetchFeed(feedUrl);
      } catch {
        await message.reply(
          "Couldn't load a feed from that URL. Make sure it points to a valid RSS/Atom feed.",
        );
        return;
      }

      const title = data.title ?? feedUrl;
      const feed = service.addFeed(ctx.db, feedUrl, title, channelId, message.author.id);
      const result = await pollFeed(ctx.client, ctx.db, feed);
      const summary =
        result.posted > 0
          ? `posted ${result.posted} item(s)`
          : result.skipped > 0
            ? `no new items posted (${result.skipped} in backlog)`
            : "nothing new yet (will poll every 5 minutes)";
      await message.reply(
        `Feed #${feed.id} added: **${title}** → <#${channelId}> (limit ${feed.post_limit} per poll) — ${summary}`,
      );
      return;
    }

    if (sub === "remove") {
      const id = parseId(args[1]);
      if (id === null) {
        await message.reply("Usage: `.rss remove <id>`");
        return;
      }
      const ok = service.removeFeed(ctx.db, id);
      await message.reply(ok ? `Feed #${id} removed.` : `Feed #${id} not found.`);
      return;
    }

    if (sub === "list") {
      const feeds = service.listFeeds(ctx.db);
      if (feeds.length === 0) {
        await message.reply("No feeds subscribed. Add one with `.rss add <url>`.");
        return;
      }
      const shown = feeds.slice(0, LIST_LIMIT);
      const lines = shown.map((f) => {
        const limit = f.post_limit === 0 ? "∞" : String(f.post_limit);
        const header = `\`#${f.id}\` **${f.title}** → <#${f.channel_id}> (limit ${limit})`;
        const meta = f.last_fetched_at
          ? `  ${f.url} · fetched <t:${Math.floor(parseUtcDbString(f.last_fetched_at).getTime() / 1000)}:R>`
          : `  ${f.url}`;
        const error = f.last_error ? `  ⚠️ ${f.last_error}` : null;
        return [header, meta, error].filter(Boolean).join("\n");
      });
      if (feeds.length > LIST_LIMIT) {
        lines.push(`...and ${feeds.length - LIST_LIMIT} more`);
      }
      const embed = new EmbedBuilder()
        .setTitle("Subscribed Feeds")
        .setColor(0x5865f2)
        .setDescription(lines.join("\n\n"));
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === "limit") {
      const id = parseId(args[1]);
      const n = parseInt(args[2], 10);
      if (id === null || isNaN(n) || n < 0 || n > MAX_POST_LIMIT) {
        await message.reply(
          `Usage: \`.rss limit <id> <n>\` (1-${MAX_POST_LIMIT}, or 0 for unlimited)`,
        );
        return;
      }
      const ok = service.setPostLimit(ctx.db, id, n);
      if (!ok) {
        await message.reply(`Feed #${id} not found.`);
        return;
      }
      await message.reply(
        n === 0
          ? `Feed #${id} will post everything (unlimited).`
          : `Feed #${id} will post up to ${n} item(s) per poll.`,
      );
      return;
    }

    if (sub === "backlog") {
      const id = parseId(args[1]);
      if (id === null) {
        await message.reply("Usage: `.rss backlog <id> [page]`");
        return;
      }
      const feed = service.getFeed(ctx.db, id);
      if (!feed) {
        await message.reply(`Feed #${id} not found.`);
        return;
      }
      const total = service.countBacklog(ctx.db, id);
      if (total === 0) {
        await message.reply(`No backlog for **${feed.title}** — nothing was skipped.`);
        return;
      }
      const pages = Math.ceil(total / BACKLOG_PAGE_SIZE);
      const page = Math.min(Math.max(parseInt(args[2] ?? "1", 10) || 1, 1), pages);
      const items = service.listBacklog(
        ctx.db,
        id,
        BACKLOG_PAGE_SIZE,
        (page - 1) * BACKLOG_PAGE_SIZE,
      );
      const lines = items.map((i) => {
        const link = i.link ? `[${i.title}](${i.link})` : i.title;
        const when = i.published_at
          ? ` · <t:${Math.floor(parseUtcDbString(i.published_at).getTime() / 1000)}:R>`
          : "";
        return `${link}${when}`;
      });
      const embed = new EmbedBuilder()
        .setTitle(`Backlog — ${feed.title}`)
        .setColor(0xfee75c)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Page ${page}/${pages} · ${total} item(s) skipped` });
      await message.reply({ embeds: [embed] });
      return;
    }

    if (sub === "fetch") {
      const result = await postNewItems(ctx.client, ctx.db);
      const parts: string[] = [];
      if (result.posted > 0) parts.push(`${result.posted} posted`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (see \`.rss backlog\`)`);
      await message.reply(
        parts.length > 0
          ? `Checked all feeds; ${parts.join(", ")}.`
          : "Checked all feeds; nothing new.",
      );
      return;
    }

    await message.reply("Usage: `.rss <add|remove|list|limit|backlog|fetch>`");
  },

  async destroy() {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  },
};

export default rssToe;
