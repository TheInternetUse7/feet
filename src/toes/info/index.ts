import {
  ChannelType,
  EmbedBuilder,
  UserFlagsBits,
  parsePrefixCommand,
  type GuildMember,
  type Message,
  type User,
} from "@fluxerjs/core";
import type { ToeModule, ToeContext } from "../../types/toe.js";
import { formatDateTimestamp, snowflakeDate } from "../../db/time.js";
import { capList } from "../../shared/list.js";
import {
  BOT_NAME,
  BOT_TAGLINE,
  DEV_USER_ID,
  REPO_URL,
  SUPPORT_URL,
  runningCommit,
} from "../../shared/meta.js";
import {
  MAX_SIZE,
  fetchMember,
  formatUsername,
  resolveGuild,
  resolveTargetUser,
  userDisplayName,
} from "../../shared/user.js";

const ROLE_CAP = 15;

const BADGES: Array<{ bit: bigint; label: string }> = [
  { bit: UserFlagsBits.Staff, label: "Staff" },
  { bit: UserFlagsBits.Partner, label: "Partner" },
  { bit: UserFlagsBits.BugHunter, label: "Bug Hunter" },
  { bit: UserFlagsBits.FriendlyBot, label: "Friendly Bot" },
];

function formatBadges(user: User): string {
  const labels: string[] = [];
  if (user.bot) labels.push("Bot");
  if (user.system) labels.push("System");
  if (user.flags !== null) {
    const flags = BigInt(user.flags);
    for (const badge of BADGES) {
      if ((flags & badge.bit) !== 0n) labels.push(badge.label);
    }
  }
  return labels.length > 0 ? labels.join(" · ") : "*none*";
}

function resolveBannerUrl(
  user: User,
  member: GuildMember | null,
  profileBanner: string | null,
  size: number,
): string | null {
  if (member?.banner) return member.bannerURL({ size });
  const cached = user.bannerURL({ size });
  if (cached) return cached;
  if (profileBanner) {
    const prev = user.banner;
    user.banner = profileBanner;
    const url = user.bannerURL({ size });
    user.banner = prev;
    return url;
  }
  return null;
}

function formatRoles(member: GuildMember): string {
  const roles = [...member.roles.cache.values()]
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position);
  if (roles.length === 0) return "*no roles*";
  return capList(roles, ROLE_CAP, (r) => r.toString()).join(" ");
}

function verificationLabel(level: number): string {
  switch (level) {
    case 0:
      return "None";
    case 1:
      return "Low (verified email required)";
    case 2:
      return "Medium (registered 5+ minutes)";
    case 3:
      return "High (member for 10+ minutes)";
    case 4:
      return "Very high (verified phone required)";
    default:
      return `Unknown (${level})`;
  }
}

function formatFeatures(features: string[]): string {
  if (features.length === 0) return "*none*";
  const shown = features.slice(0, 12);
  const extra = features.length - shown.length;
  return extra > 0 ? `${shown.join(", ")}, +${extra} more` : shown.join(", ");
}

async function showWhois(message: Message, ctx: ToeContext, args: string[]) {
  const query = args.length > 0 ? args.join(" ") : "";
  const user = await resolveTargetUser(message, ctx, query);
  if (!user) return;

  let fetchedUser = user;
  let member: GuildMember | null = null;
  let profileBanner: string | null = null;
  let profileFailed = false;

  try {
    const profile = await ctx.client.users.fetchWithProfile(user.id, {
      guildId: message.guildId ?? undefined,
    });
    fetchedUser = profile.user;
    member = profile.member;
    profileBanner = profile.globalProfile?.userProfile?.banner ?? null;
  } catch {
    profileFailed = true;
  }

  const createdDate = snowflakeDate(fetchedUser.id);

  const embed = new EmbedBuilder()
    .setTitle(userDisplayName(fetchedUser))
    .setAuthor({
      name: formatUsername(fetchedUser),
      iconURL: fetchedUser.displayAvatarURL({ size: 64 }),
    })
    .setThumbnail(fetchedUser.displayAvatarURL({ size: 256 }))
    .setColor(fetchedUser.avatarColor ?? 0x5865f2)
    .addFields(
      { name: "User ID", value: fetchedUser.id, inline: true },
      {
        name: "Account created",
        value: createdDate ? formatDateTimestamp(createdDate) : "Unknown",
        inline: true,
      },
      { name: "Badges", value: formatBadges(fetchedUser), inline: false },
    );

  if (member) {
    embed.addFields(
      {
        name: "Joined server",
        value: formatDateTimestamp(member.joinedAt),
        inline: true,
      },
      { name: "Roles", value: formatRoles(member), inline: false },
    );
  }

  const banner = resolveBannerUrl(fetchedUser, member, profileBanner, MAX_SIZE);
  if (banner) {
    embed.setImage(banner);
  }
  if (profileFailed) {
    embed.setFooter({ text: "Profile unavailable — showing cached data" });
  }

  await message.reply({ embeds: [embed] });
}

async function showServerinfo(message: Message, ctx: ToeContext, args: string[]) {
  const guild = await resolveGuild(message, ctx, args[0], {
    noContext: "This command only works in a server. `.serverinfo` needs a guild context.",
    notFound: (id) => `Couldn't find guild \`${id}\` — I can only show info for servers I'm in.`,
    loadFailed: "Couldn't load this server. Try again later.",
  });
  if (!guild) return;

  let ownerName: string;
  try {
    const owner = await fetchMember(guild, guild.ownerId);
    ownerName = owner.displayName;
  } catch {
    ownerName = `<@${guild.ownerId}>`;
  }

  const channelCounts = { text: 0, voice: 0, category: 0, link: 0, other: 0 };
  for (const channel of guild.channels.values()) {
    switch (channel.type) {
      case ChannelType.GuildText:
        channelCounts.text++;
        break;
      case ChannelType.GuildVoice:
        channelCounts.voice++;
        break;
      case ChannelType.GuildCategory:
        channelCounts.category++;
        break;
      case ChannelType.GuildLink:
        channelCounts.link++;
        break;
      default:
        channelCounts.other++;
    }
  }
  const totalChannels = guild.channels.size;
  const channelSummary =
    totalChannels === 0
      ? "*no channels cached*"
      : `${totalChannels} total (${channelCounts.text} text, ${channelCounts.voice} voice, ${channelCounts.category} category${channelCounts.link > 0 ? `, ${channelCounts.link} link` : ""}${channelCounts.other > 0 ? `, ${channelCounts.other} other` : ""})`;

  const createdDate = snowflakeDate(guild.id);

  const embed = new EmbedBuilder()
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ size: 256 }))
    .setColor(0x5865f2)
    .addFields(
      { name: "Guild ID", value: guild.id, inline: true },
      {
        name: "Created",
        value: createdDate ? formatDateTimestamp(createdDate) : "Unknown",
        inline: true,
      },
      { name: "Owner", value: ownerName, inline: true },
      {
        name: "Members",
        value:
          guild.memberCount !== null ? String(guild.memberCount) : `${guild.members.size} (cached)`,
        inline: true,
      },
      {
        name: "Online",
        value: guild.onlineCount !== null ? String(guild.onlineCount) : "unknown",
        inline: true,
      },
      { name: "Channels", value: channelSummary, inline: false },
      { name: "Roles", value: String(guild.roles.size), inline: true },
      { name: "Emojis", value: String(guild.emojis.size), inline: true },
      { name: "Stickers", value: String(guild.stickers.size), inline: true },
      {
        name: "Verification level",
        value: verificationLabel(guild.verificationLevel),
        inline: true,
      },
      { name: "Features", value: formatFeatures(guild.features), inline: false },
    );

  const banner = guild.bannerURL({ size: 1024 });
  if (banner) {
    embed.setImage(banner);
  }

  await message.reply({ embeds: [embed] });
}

async function showAbout(message: Message) {
  const embed = new EmbedBuilder()
    .setTitle(BOT_NAME)
    .setDescription(BOT_TAGLINE)
    .setColor(0x57f287)
    .addFields(
      { name: "Developer", value: `<@${DEV_USER_ID}>`, inline: true },
      { name: "Running commit", value: `\`${runningCommit()}\``, inline: true },
      {
        name: "Links",
        value: `[Source code](${REPO_URL}) · [Support community](${SUPPORT_URL})`,
        inline: false,
      },
    )
    .setFooter({ text: "Open-source bot for Fluxer" });
  await message.reply({ embeds: [embed] });
}

const infoToe: ToeModule = {
  name: "info",
  description: "Show user and server info",
  help: [
    "**`.whois [user]`** - Show info about a user (mention, ID, or name)",
    "**`.serverinfo [id]`** - Show info about this server (or another server the bot is in, by ID)",
    "**`.about`** - Show info about this bot (source, commit, support)",
  ].join("\n"),
  prefixCommands: ["whois", "serverinfo", "about"],

  async execute(message: Message, ctx: ToeContext, args: string[]) {
    const parsed = parsePrefixCommand(message.content, ".");
    const command = parsed?.command ?? "whois";

    if (command === "serverinfo") {
      await showServerinfo(message, ctx, args);
      return;
    }
    if (command === "about") {
      await showAbout(message);
      return;
    }

    await showWhois(message, ctx, args);
  },
};

export default infoToe;
