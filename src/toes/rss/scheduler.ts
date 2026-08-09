import { EmbedBuilder, type Client } from "@fluxerjs/core";
import type { DatabaseSync } from "node:sqlite";
import * as service from "./service.js";
import { fetchFeed } from "./fetcher.js";
import { parseUtcDbString } from "../../db/time.js";
import { log } from "../../shared/logger.js";

const logger = log("rss");

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const KEEP_ITEMS_PER_FEED = 200;
const TITLE_MAX = 256;

let lastPruneAt = 0;

export interface PollResult {
  posted: number;
  skipped: number;
}

export async function postNewItems(client: Client, db: DatabaseSync): Promise<PollResult> {
  const feeds = service.listFeeds(db);
  const result: PollResult = { posted: 0, skipped: 0 };
  for (const feed of feeds) {
    const r = await pollFeed(client, db, feed);
    result.posted += r.posted;
    result.skipped += r.skipped;
  }
  return result;
}

export async function pollFeed(
  client: Client,
  db: DatabaseSync,
  feed: service.Feed,
): Promise<PollResult> {
  const result: PollResult = { posted: 0, skipped: 0 };
  try {
    const data = await fetchFeed(feed.url);
    service.markFeedOk(db, feed.id);
    for (const entry of data.entries ?? []) {
      service.insertItem(db, feed.id, entry);
    }

    const pending = service.listUnposted(
      db,
      feed.id,
      feed.post_limit === 0 ? null : feed.post_limit,
    );
    for (const item of pending) {
      try {
        await sendItemEmbed(client, feed, item);
        result.posted++;
      } catch (err) {
        logger.error(`Failed to post item #${item.id} from feed #${feed.id}:`, err);
      } finally {
        service.markPosted(db, item.id);
      }
    }

    const skipped = service.skipOverflow(db, feed.id);
    result.skipped += skipped;
    if (skipped > 0) {
      try {
        await client.channels.send(
          feed.channel_id,
          `…and ${skipped} more item(s) were skipped for **${feed.title}** — view them with \`.rss backlog ${feed.id}\``,
        );
      } catch (err) {
        logger.error(`Failed to send overflow notice for feed #${feed.id}:`, err);
      }
    }
  } catch (err) {
    service.markFeedError(db, feed.id, err instanceof Error ? err.message : String(err));
    logger.warn(`Failed to fetch feed #${feed.id} (${feed.url}):`, err);
  }
  return result;
}

export function startScheduler(client: Client, db: DatabaseSync): NodeJS.Timeout {
  return setInterval(async () => {
    try {
      const result = await postNewItems(client, db);
      if (result.posted > 0 || result.skipped > 0) {
        logger.info(`Polled feeds; posted ${result.posted} item(s), skipped ${result.skipped}`);
      }
      if (Date.now() - lastPruneAt >= PRUNE_INTERVAL_MS) {
        lastPruneAt = Date.now();
        const pruned = service.pruneItems(db, KEEP_ITEMS_PER_FEED);
        if (pruned > 0) logger.info(`Pruned ${pruned} old item(s)`);
      }
    } catch (err) {
      logger.error("Poll error:", err);
    }
  }, POLL_INTERVAL_MS);
}

async function sendItemEmbed(
  client: Client,
  feed: service.Feed,
  item: service.FeedItem,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setAuthor({ name: feed.title })
    .setTitle(item.title.slice(0, TITLE_MAX))
    .setColor(0x57f287)
    .setDescription(item.description ?? "");
  if (item.link) embed.setURL(item.link);
  if (item.published_at) {
    const published = parseUtcDbString(item.published_at);
    if (!isNaN(published.getTime())) embed.setTimestamp(published);
  }
  await client.channels.send(feed.channel_id, { embeds: [embed] });
}
