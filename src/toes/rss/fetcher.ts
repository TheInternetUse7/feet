import { extract, type FeedData } from "@extractus/feed-extractor";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "FEET-Bot/1.0 (Fluxer Expandable Everyday Toolkit RSS TOE; https://github.com/TheInternetUse7/feet)";

export async function fetchFeed(url: string): Promise<FeedData> {
  return extract(
    url,
    { descriptionMaxLen: 250 },
    {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    },
  );
}
