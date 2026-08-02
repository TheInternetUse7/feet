import type { DatabaseSync } from "node:sqlite";
import type { FeedEntry } from "@extractus/feed-extractor";
import { get, all, run } from "../../db/query.js";
import { migrate, type Migration } from "../../db/migrate.js";
import { toUtcDbString } from "../../db/time.js";

export interface Feed {
  id: number;
  url: string;
  title: string;
  channel_id: string;
  added_by: string;
  post_limit: number;
  last_fetched_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface FeedItem {
  id: number;
  feed_id: number;
  guid: string;
  title: string;
  link: string | null;
  description: string | null;
  published_at: string | null;
  is_posted: number;
  is_skipped: number;
}

const migrations: Migration[] = [
  {
    version: 1,
    up(db: DatabaseSync) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS toe_rss_feeds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          added_by TEXT NOT NULL,
          last_fetched_at DATETIME,
          last_error TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS toe_rss_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feed_id INTEGER NOT NULL,
          guid TEXT NOT NULL,
          title TEXT NOT NULL,
          link TEXT,
          published_at DATETIME,
          is_posted INTEGER DEFAULT 0,
          UNIQUE(feed_id, guid)
        );
        CREATE INDEX IF NOT EXISTS idx_rss_items_feed ON toe_rss_items(feed_id);
      `);
    },
  },
  {
    version: 2,
    up(db: DatabaseSync) {
      db.exec(`
        ALTER TABLE toe_rss_feeds ADD COLUMN post_limit INTEGER NOT NULL DEFAULT 10;
        ALTER TABLE toe_rss_items ADD COLUMN description TEXT;
        ALTER TABLE toe_rss_items ADD COLUMN is_skipped INTEGER DEFAULT 0;
      `);
    },
  },
];

export function initTable(db: DatabaseSync): void {
  migrate(db, "rss", migrations);
}

export function addFeed(
  db: DatabaseSync,
  url: string,
  title: string,
  channelId: string,
  addedBy: string,
): Feed {
  return get<Feed>(
    db,
    "INSERT INTO toe_rss_feeds (url, title, channel_id, added_by) VALUES (?, ?, ?, ?) RETURNING id, url, title, channel_id, added_by, post_limit, last_fetched_at, last_error, created_at",
    url,
    title,
    channelId,
    addedBy,
  )!;
}

export function getFeed(db: DatabaseSync, id: number): Feed | undefined {
  return get<Feed>(db, "SELECT * FROM toe_rss_feeds WHERE id = ?", id);
}

export function getFeedByUrl(db: DatabaseSync, url: string): Feed | undefined {
  return get<Feed>(db, "SELECT * FROM toe_rss_feeds WHERE url = ?", url);
}

export function listFeeds(db: DatabaseSync): Feed[] {
  return all<Feed>(db, "SELECT * FROM toe_rss_feeds ORDER BY id");
}

export function setPostLimit(db: DatabaseSync, id: number, limit: number): boolean {
  const result = run(db, "UPDATE toe_rss_feeds SET post_limit = ? WHERE id = ?", limit, id);
  return Number(result.changes) > 0;
}

export function removeFeed(db: DatabaseSync, id: number): boolean {
  run(db, "DELETE FROM toe_rss_items WHERE feed_id = ?", id);
  const result = run(db, "DELETE FROM toe_rss_feeds WHERE id = ?", id);
  return Number(result.changes) > 0;
}

export function pruneItems(db: DatabaseSync, keepPerFeed: number): number {
  let pruned = 0;
  const feeds = all<{ id: number }>(db, "SELECT id FROM toe_rss_feeds");
  for (const feed of feeds) {
    const result = run(
      db,
      `DELETE FROM toe_rss_items
       WHERE feed_id = ? AND id NOT IN (
         SELECT id FROM toe_rss_items WHERE feed_id = ? ORDER BY published_at DESC, id DESC LIMIT ?
       )`,
      feed.id,
      feed.id,
      keepPerFeed,
    );
    pruned += Number(result.changes);
  }
  return pruned;
}

export function markFeedOk(db: DatabaseSync, id: number): void {
  run(
    db,
    "UPDATE toe_rss_feeds SET last_fetched_at = datetime('now', 'utc'), last_error = NULL WHERE id = ?",
    id,
  );
}

export function markFeedError(db: DatabaseSync, id: number, error: string): void {
  run(db, "UPDATE toe_rss_feeds SET last_error = ? WHERE id = ?", error.slice(0, 200), id);
}

export function insertItem(db: DatabaseSync, feedId: number, entry: FeedEntry): FeedItem | null {
  const result = run(
    db,
    "INSERT OR IGNORE INTO toe_rss_items (feed_id, guid, title, link, description, published_at) VALUES (?, ?, ?, ?, ?, ?)",
    feedId,
    entry.id,
    entry.title ?? entry.id,
    entry.link ?? null,
    entry.description ?? null,
    toUtcOrNull(entry.published),
  );
  if (Number(result.changes) === 0) return null;
  return get<FeedItem>(
    db,
    "SELECT * FROM toe_rss_items WHERE feed_id = ? AND guid = ?",
    feedId,
    entry.id,
  )!;
}

export function listUnposted(db: DatabaseSync, feedId: number, limit: number | null): FeedItem[] {
  const limitClause = limit === null ? "LIMIT -1" : "LIMIT ?";
  return all<FeedItem>(
    db,
    `SELECT * FROM toe_rss_items WHERE feed_id = ? AND is_posted = 0 ORDER BY published_at DESC, id DESC ${limitClause}`,
    ...(limit === null ? [feedId] : [feedId, limit]),
  );
}

export function markPosted(db: DatabaseSync, id: number): void {
  run(db, "UPDATE toe_rss_items SET is_posted = 1 WHERE id = ?", id);
}

export function skipOverflow(db: DatabaseSync, feedId: number): number {
  const result = run(
    db,
    "UPDATE toe_rss_items SET is_posted = 1, is_skipped = 1 WHERE feed_id = ? AND is_posted = 0",
    feedId,
  );
  return Number(result.changes);
}

export function countBacklog(db: DatabaseSync, feedId: number): number {
  const row = get<{ n: number }>(
    db,
    "SELECT COUNT(*) AS n FROM toe_rss_items WHERE feed_id = ? AND is_skipped = 1",
    feedId,
  );
  return row?.n ?? 0;
}

export function listBacklog(
  db: DatabaseSync,
  feedId: number,
  limit: number,
  offset: number,
): FeedItem[] {
  return all<FeedItem>(
    db,
    "SELECT * FROM toe_rss_items WHERE feed_id = ? AND is_skipped = 1 ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?",
    feedId,
    limit,
    offset,
  );
}

function toUtcOrNull(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return isNaN(date.getTime()) ? null : toUtcDbString(date);
}
