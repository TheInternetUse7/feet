import { SnowflakeUtil } from "@fluxerjs/util";
import {
  ErrorCodes,
  FluxerError,
  parseUserMention,
  type Client,
  type Guild,
  type GuildMember,
  type User,
} from "@fluxerjs/core";

export const MAX_SIZE = 4096;
export const ROLE_CAP = 15;

const SNOWFLAKE_RE = /^\d{17,20}$/;

export function isSnowflake(str: string): boolean {
  return SNOWFLAKE_RE.test(str);
}

export function isNotFoundError(err: unknown): boolean {
  if (!FluxerError.isFluxerError(err)) return false;
  switch (err.code) {
    case ErrorCodes.GuildNotFound:
    case ErrorCodes.MemberNotFound:
    case ErrorCodes.RoleNotFound:
    case ErrorCodes.ChannelNotFound:
    case ErrorCodes.MessageNotFound:
      return true;
    default:
      return false;
  }
}

export function mentionToId(query: string): string | null {
  return parseUserMention(query);
}

export function fetchGuild(client: Client, guildId: string): Promise<Guild> {
  return client.guilds.resolve(guildId);
}

export function fetchUser(client: Client, userId: string): Promise<User> {
  return client.users.fetch(userId);
}

export function fetchMember(guild: Guild, userId: string): Promise<GuildMember> {
  return guild.members.resolve(userId);
}

export type NameSearchResult =
  | { kind: "found"; user: User }
  | { kind: "ambiguous"; matches: User[] }
  | { kind: "none" };

export function searchUserByName(client: Client, query: string): NameSearchResult {
  const q = query.toLowerCase();
  const byId = new Map<string, User>();
  for (const user of client.users.values()) {
    byId.set(user.id, user);
  }
  if (client.user) {
    byId.set(client.user.id, client.user);
  }
  const candidates = [...byId.values()];

  const exactDisc = /^(.+)#(\d{4})$/.exec(query);
  const matches = exactDisc
    ? candidates.filter(
        (u) =>
          u.username.toLowerCase() === exactDisc[1].toLowerCase() &&
          u.discriminator === exactDisc[2],
      )
    : candidates.filter((u) => u.globalName?.toLowerCase() === q || u.username.toLowerCase() === q);

  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "found", user: matches[0] };
  return { kind: "ambiguous", matches };
}

export async function searchServerMembers(guild: Guild, query: string): Promise<NameSearchResult> {
  const q = query.toLowerCase();
  const exactDisc = /^(.+)#(\d{4})$/.exec(query);

  let payload;
  try {
    payload = await guild.members.search({ query, limit: 25 });
  } catch {
    return { kind: "none" };
  }

  const byId = new Map<string, User>();
  for (const hit of payload.members) {
    const matchesName = exactDisc
      ? hit.username.toLowerCase() === exactDisc[1].toLowerCase() &&
        hit.discriminator === exactDisc[2]
      : hit.globalName?.toLowerCase() === q || hit.username.toLowerCase() === q;
    if (!matchesName) continue;

    const existing = hit.member?.user ?? guild.client.users.get(hit.userId);
    if (existing) {
      byId.set(hit.userId, existing);
      continue;
    }
    try {
      const user = await guild.client.users.fetch(hit.userId);
      byId.set(hit.userId, user);
    } catch {
      // User is unreachable — skip this hit.
    }
  }

  const matches = [...byId.values()];
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "found", user: matches[0] };
  return { kind: "ambiguous", matches };
}

export function userDisplayName(user: User): string {
  return user.globalName ?? user.username;
}

export function formatUsername(user: User): string {
  return user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username;
}

export function snowflakeDate(id: string): Date | null {
  if (!SNOWFLAKE_RE.test(id)) return null;
  try {
    return SnowflakeUtil.dateFromSnowflake(id);
  } catch {
    return null;
  }
}

export function formatTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}
