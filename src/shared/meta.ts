import fs from "node:fs";
import path from "node:path";

export const BOT_NAME = "FEET";
export const BOT_TAGLINE = "Fluxer Expandable Everyday Toolkit";
export const REPO_URL = "https://github.com/TheInternetUse7/feet";
export const DEV_USER_ID = "1472176940872634407";
export const SUPPORT_URL = "https://fluxer.gg/EaU5Zd1L";

let cachedCommit: string | null = null;

function readGitHead(): string | null {
  try {
    const gitDir = path.resolve(".git");
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    const match = /^ref:\s*(.+)$/.exec(head);
    if (!match) return head;
    return fs.readFileSync(path.join(gitDir, match[1]), "utf8").trim();
  } catch {
    return null;
  }
}

export function runningCommit(): string {
  if (cachedCommit !== null) return cachedCommit;
  const full = process.env.GIT_COMMIT ?? readGitHead() ?? "dev";
  cachedCommit = full === "dev" ? full : full.slice(0, 7);
  return cachedCommit;
}
