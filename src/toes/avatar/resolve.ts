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
  const candidates: User[] = [...client.users.values()];
  if (client.user && !candidates.includes(client.user)) {
    candidates.push(client.user);
  }

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

export function userDisplayName(user: User): string {
  return user.globalName ?? user.username;
}

export function formatUsername(user: User): string {
  return user.discriminator !== "0" ? `${user.username}#${user.discriminator}` : user.username;
}
