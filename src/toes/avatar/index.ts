import {
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type Message,
  type User,
} from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import * as resolve from "./resolve.js";

async function replyAmbiguous(message: Message, query: string, matches: User[]): Promise<null> {
  const lines = matches
    .slice(0, 5)
    .map((u) => `**${resolve.userDisplayName(u)}** — \`<@${u.id}>\``);
  await message.reply(
    `Multiple users match **"${query}"**:\n${lines.join("\n")}\n\nMention one or paste their ID instead.`,
  );
  return null;
}

async function resolveTargetUser(
  message: Message,
  ctx: ToeContext,
  query: string,
): Promise<User | null> {
  if (query === "" || query.toLowerCase() === "me") return message.author;

  const mentionId = resolve.mentionToId(query);
  if (mentionId !== null) {
    const cached = ctx.client.users.get(mentionId);
    if (cached) return cached;
    try {
      return await resolve.fetchUser(ctx.client, mentionId);
    } catch {
      await message.reply(
        `Couldn't find a user with ID \`${mentionId}\`. They may have deleted their account, or the bot can't see them.`,
      );
      return null;
    }
  }

  const search = resolve.searchUserByName(ctx.client, query);
  if (search.kind === "found") return search.user;
  if (search.kind === "ambiguous") return replyAmbiguous(message, query, search.matches);

  if (message.guildId) {
    try {
      const guild = await resolve.fetchGuild(ctx.client, message.guildId);
      const serverSearch = await resolve.searchServerMembers(guild, query);
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

async function showUserAvatar(message: Message, ctx: ToeContext, args: string[]) {
  const query = args.length > 0 ? args.join(" ") : "";
  const user = await resolveTargetUser(message, ctx, query);
  if (!user) return;

  const url = user.displayAvatarURL({ size: resolve.MAX_SIZE });
  const embed = new EmbedBuilder()
    .setTitle(resolve.userDisplayName(user))
    .setAuthor({ name: resolve.formatUsername(user), iconURL: user.displayAvatarURL({ size: 64 }) })
    .setDescription(`[Open original](${url})`)
    .setImage(url)
    .setColor(user.avatarColor ?? 0x5865f2)
    .setFooter({ text: user.avatar === null ? "Default avatar — no custom avatar set" : "Avatar" });
  await message.reply({ embeds: [embed] });
}

async function showGuildIcon(message: Message, ctx: ToeContext, guildIdArg?: string) {
  let guild: Guild;
  if (guildIdArg !== undefined) {
    if (!resolve.isSnowflake(guildIdArg)) {
      await message.reply(`Invalid guild ID: \`${guildIdArg}\`. Expected a 17-20 digit snowflake.`);
      return;
    }
    try {
      guild = await resolve.fetchGuild(ctx.client, guildIdArg);
    } catch (err) {
      if (resolve.isNotFoundError(err)) {
        await message.reply(
          `Couldn't find guild \`${guildIdArg}\` — I can only show icons for servers I'm in.`,
        );
      } else {
        await message.reply(
          `Failed to fetch guild \`${guildIdArg}\` (network error). Try again later.`,
        );
      }
      return;
    }
  } else {
    if (!message.guildId) {
      await message.reply(
        "This command only works in a server. `.avatar guild` needs a guild context.",
      );
      return;
    }
    try {
      guild = await resolve.fetchGuild(ctx.client, message.guildId);
    } catch {
      await message.reply("Couldn't load this server's icon. Try again later.");
      return;
    }
  }

  const url = guild.iconURL({ size: resolve.MAX_SIZE });
  if (!url) {
    await message.reply(`**${guild.name}** doesn't have an icon set.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(guild.name)
    .setDescription(`[Open original](${url})`)
    .setImage(url)
    .setColor(0x5865f2)
    .setFooter({ text: "Server icon" });
  await message.reply({ embeds: [embed] });
}

async function showMemberAvatar(message: Message, ctx: ToeContext, args: string[]) {
  if (!message.guildId) {
    await message.reply(
      "This command only works in a server. `.avatar member` needs a guild context.",
    );
    return;
  }

  let guild: Guild;
  try {
    guild = await resolve.fetchGuild(ctx.client, message.guildId);
  } catch {
    await message.reply("Couldn't load this server. Try again later.");
    return;
  }

  const query = args.length > 0 ? args.join(" ") : "";
  const user = await resolveTargetUser(message, ctx, query);
  if (!user) return;

  let member: GuildMember;
  try {
    member = await resolve.fetchMember(guild, user.id);
  } catch (err) {
    if (resolve.isNotFoundError(err)) {
      await message.reply(
        `**${resolve.userDisplayName(user)}** isn't a member of **${guild.name}**.`,
      );
    } else {
      await message.reply("Failed to fetch the member's avatar (network error). Try again later.");
    }
    return;
  }

  const serverUrl = member.avatarURL({ size: resolve.MAX_SIZE });
  const fallbackUrl = member.user.displayAvatarURL({ size: resolve.MAX_SIZE });
  const embed = new EmbedBuilder()
    .setTitle(`Server avatar of ${member.displayName}`)
    .setAuthor({ name: resolve.formatUsername(member.user), iconURL: fallbackUrl })
    .setDescription(`[Open original](${serverUrl ?? fallbackUrl})`)
    .setImage(serverUrl ?? fallbackUrl)
    .setColor(member.user.avatarColor ?? 0x5865f2)
    .setFooter({
      text: serverUrl ? "Server-specific avatar" : "No server avatar set — showing global avatar",
    });
  await message.reply({ embeds: [embed] });
}

const avatarToe: ToeModule = {
  name: "avatar",
  description: "Show user avatars and guild icons",
  help: [
    "**`.avatar`** - Show your global avatar",
    "**`.avatar <user>`** - Show a user's global avatar (mention, ID, or name)",
    "**`.avatar member <user>`** - Show a member's server-specific avatar (falls back to global)",
    "**`.avatar guild`** - Show this server's icon",
    "**`.avatar guild <id>`** - Show another server's icon (bot must be in it)",
  ].join("\n"),
  prefixCommands: ["avatar"],

  async execute(message: Message, ctx: ToeContext, args: string[]) {
    const sub = args[0]?.toLowerCase();

    if (sub === "guild") {
      await showGuildIcon(message, ctx, args[1]);
      return;
    }

    if (sub === "member") {
      await showMemberAvatar(message, ctx, args.slice(1));
      return;
    }

    await showUserAvatar(message, ctx, args);
  },
};

export default avatarToe;
