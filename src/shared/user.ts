import {
  ErrorCodes,
  FluxerError,
  parseUserMention,
  type Client,
  type Guild,
  type GuildMember,
  type Message,
  type User,
} from "@fluxerjs/core";
import type { ToeContext } from "../types/toe.js";

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

export async function replyAmbiguous(
  message: Message,
  query: string,
  matches: User[],
): Promise<null> {
  const lines = matches.slice(0, 5).map((u) => `**${userDisplayName(u)}** — \`<@${u.id}>\``);
  await message.reply(
    `Multiple users match **"${query}"**:\n${lines.join("\n")}\n\nMention one or paste their ID instead.`,
  );
  return null;
}

export async function resolveTargetUser(
  message: Message,
  ctx: ToeContext,
  query: string,
): Promise<User | null> {
  if (query === "" || query.toLowerCase() === "me") return message.author;

  const mentionId = mentionToId(query);
  if (mentionId !== null) {
    const cached = ctx.client.users.get(mentionId);
    if (cached) return cached;
    try {
      return await fetchUser(ctx.client, mentionId);
    } catch {
      await message.reply(
        `Couldn't find a user with ID \`${mentionId}\`. They may have deleted their account, or the bot can't see them.`,
      );
      return null;
    }
  }

  const search = searchUserByName(ctx.client, query);
  if (search.kind === "found") return search.user;
  if (search.kind === "ambiguous") return replyAmbiguous(message, query, search.matches);

  if (message.guildId) {
    try {
      const guild = await fetchGuild(ctx.client, message.guildId);
      const serverSearch = await searchServerMembers(guild, query);
      if (serverSearch.kind === "found") return serverSearch.user;
      if (serverSearch.kind === "ambiguous") {
        return replyAmbiguous(message, query, serverSearch.matches);
      }
    } catch {
      // Couldn't query the server's member index — fall through to not found.
    }
  }

  await message.reply(
    `Couldn't find a user matching **"${query}"**. Mention them or paste their ID instead.`,
  );
  return null;
}

export interface GuildResolveHints {
  noContext?: string;
  notFound?: (guildId: string) => string;
  loadFailed: string;
}

export async function resolveGuild(
  message: Message,
  ctx: ToeContext,
  guildIdArg: string | undefined,
  hints: GuildResolveHints,
): Promise<Guild | null> {
  if (guildIdArg !== undefined) {
    if (!isSnowflake(guildIdArg)) {
      await message.reply(`Invalid guild ID: \`${guildIdArg}\`. Expected a 17-20 digit snowflake.`);
      return null;
    }
    try {
      return await fetchGuild(ctx.client, guildIdArg);
    } catch (err) {
      if (isNotFoundError(err)) {
        await message.reply(
          hints.notFound ? hints.notFound(guildIdArg) : `Couldn't find guild \`${guildIdArg}\`.`,
        );
      } else {
        await message.reply(
          `Failed to fetch guild \`${guildIdArg}\` (network error). Try again later.`,
        );
      }
      return null;
    }
  }

  if (!message.guildId) {
    await message.reply(hints.noContext ?? "This command only works in a server.");
    return null;
  }
  try {
    return await fetchGuild(ctx.client, message.guildId);
  } catch {
    await message.reply(hints.loadFailed);
    return null;
  }
}
