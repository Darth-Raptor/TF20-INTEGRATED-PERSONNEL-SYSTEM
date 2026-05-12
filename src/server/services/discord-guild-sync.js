import { config } from "../config.js";
import { getDb, isDbConfigured } from "../db.js";

let startPromise = null;

function guildSyncConfigured() {
  return Boolean(config.discord.botToken && config.discord.guildId);
}

function serializeGuildRoles(member) {
  try {
    return member.roles.cache
      .filter((role) => role.name !== "@everyone")
      .map((role) => role.name)
      .sort();
  } catch {
    return [];
  }
}

function displayNameForUser(user, member) {
  return user?.globalName || member?.displayName || user?.displayName || user?.username || "Unknown Discord User";
}

async function createProfileRecordArtifacts(tx, { profileId, actorUserId, action, noteType, note, oldValue, newValue }) {
  if (!profileId) return;

  await tx.administrativeNote.create({
    data: {
      profileId,
      noteType,
      note,
      authorUserId: actorUserId,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId,
      affectedProfileId: profileId,
      module: "Discord Guild Sync",
      action,
      oldValue,
      newValue,
      reason: note,
      severity: "Info",
      systemGenerated: true,
    },
  });
}

async function handleGuildMemberJoin(member) {
  if (!isDbConfigured()) return;

  const db = getDb();
  const discordUser = member.user;
  const currentRoles = serializeGuildRoles(member);
  const existing = await db.user.findUnique({
    where: { discordId: discordUser.id },
    include: {
      profile: true,
    },
  });

  const nextDisplayName = displayNameForUser(discordUser, member);
  const shouldEnableAccount = !["Discharged", "BannedDoNotRehire"].includes(existing?.accountStatus || "Applicant");

  const user = await db.user.upsert({
    where: { discordId: discordUser.id },
    create: {
      discordId: discordUser.id,
      discordUsername: discordUser.username,
      discordDisplayName: nextDisplayName,
      accountStatus: "Applicant",
      accountDisabled: false,
    },
    update: {
      discordUsername: discordUser.username,
      discordDisplayName: nextDisplayName,
      ...(shouldEnableAccount ? { accountDisabled: false } : {}),
    },
    include: {
      profile: true,
    },
  });

  await db.$transaction(async (tx) => {
    await tx.discordSyncLog.create({
      data: {
        userId: user.id,
        action: "guild-member-join",
        status: "Success",
        currentRoles,
      },
    });

    await createProfileRecordArtifacts(tx, {
      profileId: user.profile?.id,
      actorUserId: user.id,
      action: "Discord Guild Join Detected",
      noteType: "DiscordServer",
      note: `Discord guild join detected for ${nextDisplayName}. Portal access ${shouldEnableAccount ? "enabled" : "left unchanged"} automatically.`,
      oldValue: existing
        ? {
            accountDisabled: existing.accountDisabled,
            accountStatus: existing.accountStatus,
          }
        : null,
      newValue: {
        accountDisabled: user.accountDisabled,
        accountStatus: user.accountStatus,
        currentRoles,
      },
    });
  });
}

async function handleGuildMemberLeave(member) {
  if (!isDbConfigured()) return;

  const db = getDb();
  const discordUser = member.user;
  const existing = await db.user.findUnique({
    where: { discordId: discordUser.id },
    include: {
      profile: true,
    },
  });

  if (!existing) {
    await db.discordSyncLog.create({
      data: {
        action: "guild-member-leave",
        status: "MissingUser",
        error: `No portal user matched Discord ID ${discordUser.id}.`,
      },
    });
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        accountDisabled: true,
      },
    });

    await tx.discordSyncLog.create({
      data: {
        userId: existing.id,
        action: "guild-member-leave",
        status: "Success",
        currentRoles: [],
      },
    });

    await createProfileRecordArtifacts(tx, {
      profileId: existing.profile?.id,
      actorUserId: existing.id,
      action: "Discord Guild Leave Detected",
      noteType: "DiscordServer",
      note: `Discord guild leave detected for ${displayNameForUser(discordUser)}. Portal access disabled automatically pending rejoin or staff review.`,
      oldValue: {
        accountDisabled: existing.accountDisabled,
        accountStatus: existing.accountStatus,
      },
      newValue: {
        accountDisabled: true,
        accountStatus: existing.accountStatus,
      },
    });
  });
}

export function startDiscordGuildSync() {
  if (startPromise) return startPromise;

  if (!guildSyncConfigured()) {
    console.warn("Discord guild sync is not configured. Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID to enable join/leave automation.");
    return null;
  }

  startPromise = (async () => {
    let discord;
    try {
      discord = await import("discord.js");
    } catch (error) {
      console.warn("Discord guild sync could not start because discord.js is not installed.", error?.message || error);
      return null;
    }

    const { Client, Events, GatewayIntentBits } = discord;
    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    client.once(Events.ClientReady, () => {
      console.log(`Discord guild sync connected for guild ${config.discord.guildId}.`);
    });

    client.on(Events.GuildMemberAdd, (member) => {
      if (member.guild?.id !== config.discord.guildId) return;
      handleGuildMemberJoin(member).catch((error) => {
        console.error("Discord guild join sync failed.", error);
      });
    });

    client.on(Events.GuildMemberRemove, (member) => {
      if (member.guild?.id !== config.discord.guildId) return;
      handleGuildMemberLeave(member).catch((error) => {
        console.error("Discord guild leave sync failed.", error);
      });
    });

    await client.login(config.discord.botToken);
    return client;
  })().catch((error) => {
    console.error("Discord guild sync startup failed.", error);
    startPromise = null;
    return null;
  });

  return startPromise;
}

export function isDiscordGuildSyncConfigured() {
  return guildSyncConfigured();
}
