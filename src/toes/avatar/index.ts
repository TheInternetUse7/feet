import { EmbedBuilder, type GuildMember, type Message } from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import {
  MAX_SIZE,
  fetchMember,
  formatUsername,
  isNotFoundError,
  resolveGuild,
  resolveTargetUser,
  userDisplayName,
} from "../../shared/user.js";

async function showUserAvatar(message: Message, ctx: ToeContext, args: string[]) {
  const query = args.length > 0 ? args.join(" ") : "";
  const user = await resolveTargetUser(message, ctx, query);
  if (!user) return;

  const url = user.displayAvatarURL({ size: MAX_SIZE });
  const embed = new EmbedBuilder()
    .setTitle(userDisplayName(user))
    .setAuthor({ name: formatUsername(user), iconURL: user.displayAvatarURL({ size: 64 }) })
    .setDescription(`[Open original](${url})`)
    .setImage(url)
    .setColor(user.avatarColor ?? 0x5865f2)
    .setFooter({ text: user.avatar === null ? "Default avatar — no custom avatar set" : "Avatar" });
  await message.reply({ embeds: [embed] });
}

async function showGuildIcon(message: Message, ctx: ToeContext, guildIdArg?: string) {
  const guild = await resolveGuild(message, ctx, guildIdArg, {
    noContext: "This command only works in a server. `.avatar guild` needs a guild context.",
    notFound: (id) => `Couldn't find guild \`${id}\` — I can only show icons for servers I'm in.`,
    loadFailed: "Couldn't load this server's icon. Try again later.",
  });
  if (!guild) return;

  const url = guild.iconURL({ size: MAX_SIZE });
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

  const guild = await resolveGuild(message, ctx, undefined, {
    loadFailed: "Couldn't load this server. Try again later.",
  });
  if (!guild) return;

  const query = args.length > 0 ? args.join(" ") : "";
  const user = await resolveTargetUser(message, ctx, query);
  if (!user) return;

  let member: GuildMember;
  try {
    member = await fetchMember(guild, user.id);
  } catch (err) {
    if (isNotFoundError(err)) {
      await message.reply(`**${userDisplayName(user)}** isn't a member of **${guild.name}**.`);
    } else {
      await message.reply("Failed to fetch the member's avatar (network error). Try again later.");
    }
    return;
  }

  const serverUrl = member.avatarURL({ size: MAX_SIZE });
  const fallbackUrl = member.user.displayAvatarURL({ size: MAX_SIZE });
  const embed = new EmbedBuilder()
    .setTitle(`Server avatar of ${member.displayName}`)
    .setAuthor({ name: formatUsername(member.user), iconURL: fallbackUrl })
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
