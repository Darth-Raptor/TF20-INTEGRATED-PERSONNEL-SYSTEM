import { config } from "../config.js";
import { getDb, isDbConfigured } from "../db.js";

let startPromise = null;
let reconcilePromise = null;
let reconcileTimer = null;

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

function displayNameForPortalUser(user) {
  return user?.displayAlias || user?.discordDisplayName || user?.discordUsername || "Unknown Discord User";
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

async function recordGuildMemberLeaveForUser(existing, options = {}) {
  if (!existing || existing.accountDisabled) return false;

  const db = getDb();
  const source = options.source || "live";
  const displayName = options.discordUser ? displayNameForUser(options.discordUser) : displayNameForPortalUser(existing);
  const action = source === "reconcile" ? "Discord Guild Leave Reconciled" : "Discord Guild Leave Detected";
  const note =
    source === "reconcile"
      ? `Discord guild reconciliation detected ${displayName} is no longer in the server. Portal access disabled automatically pending rejoin or staff review.`
      : `Discord guild leave detected for ${displayName}. Portal access disabled automatically pending rejoin or staff review.`;

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
        status: source === "reconcile" ? "Reconciled" : "Success",
        expectedRoles: source === "reconcile" ? { source: "guild-reconciliation" } : undefined,
        currentRoles: [],
      },
    });

    await createProfileRecordArtifacts(tx, {
      profileId: existing.profile?.id,
      actorUserId: existing.id,
      action,
      noteType: "DiscordServer",
      note,
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

  return true;
}

async function handleGuildMemberJoin(member, options = {}) {
  if (!isDbConfigured()) return;
  if (member.user?.bot) return;

  const mode = options.mode || "live";
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

  const joinedAt = member.joinedAt || member.joinedTimestamp || null;
  const noteText =
    mode === "backfill"
      ? `Discord guild membership backfilled for ${nextDisplayName}.${joinedAt ? ` Joined server on ${new Date(joinedAt).toISOString()}.` : ""}`
      : `Discord guild join detected for ${nextDisplayName}. Portal access ${shouldEnableAccount ? "enabled" : "left unchanged"} automatically.`;

  await db.$transaction(async (tx) => {
    await tx.discordSyncLog.create({
      data: {
        userId: user.id,
        action: mode === "backfill" ? "guild-member-backfill" : "guild-member-join",
        status: "Success",
        expectedRoles: joinedAt ? { joinedAt: new Date(joinedAt).toISOString() } : undefined,
        currentRoles,
      },
    });

    await createProfileRecordArtifacts(tx, {
      profileId: user.profile?.id,
      actorUserId: user.id,
      action: mode === "backfill" ? "Discord Guild Membership Backfilled" : "Discord Guild Join Detected",
      noteType: "DiscordServer",
      note: noteText,
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
        joinedAt: joinedAt ? new Date(joinedAt).toISOString() : null,
      },
    });
  });
}

async function handleGuildMemberLeave(member) {
  if (!isDbConfigured()) return;
  if (member.user?.bot) return;

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

  await recordGuildMemberLeaveForUser(existing, { discordUser, source: "live" });
}

async function reconcileDiscordGuildMembersForClient(client, options = {}) {
  if (!isDbConfigured()) return { disabled: 0, currentMembers: 0, checkedUsers: 0 };

  const mode = options.mode || "manual";
  const guild = await client.guilds.fetch(config.discord.guildId);
  const members = await guild.members.fetch();
  const currentDiscordIds = new Set();

  for (const member of members.values()) {
    if (member.user?.bot) continue;
    currentDiscordIds.add(member.user.id);
  }

  const db = getDb();
  const users = await db.user.findMany({
    where: { accountDisabled: false },
    include: { profile: true },
  });
  let disabled = 0;

  for (const user of users) {
    if (!user.discordId || currentDiscordIds.has(user.discordId)) continue;
    const didDisable = await recordGuildMemberLeaveForUser(user, { source: "reconcile" });
    if (didDisable) disabled += 1;
  }

  await db.discordSyncLog.create({
    data: {
      action: "guild-member-reconcile",
      status: "Success",
      expectedRoles: {
        mode,
        checkedUsers: users.length,
        currentMemberCount: currentDiscordIds.size,
        disabledUserCount: disabled,
      },
      currentRoles: [],
    },
  });

  return {
    guildId: guild.id,
    guildName: guild.name,
    checkedUsers: users.length,
    currentMembers: currentDiscordIds.size,
    disabled,
  };
}

function queueDiscordGuildReconciliation(client, mode) {
  if (reconcilePromise) return reconcilePromise;

  reconcilePromise = reconcileDiscordGuildMembersForClient(client, { mode })
    .then((result) => {
      console.log(
        `Discord guild reconciliation ${mode} complete: checked ${result.checkedUsers}, current ${result.currentMembers}, disabled ${result.disabled}.`,
      );
      return result;
    })
    .catch((error) => {
      console.error("Discord guild reconciliation failed.", error);
      return null;
    })
    .finally(() => {
      reconcilePromise = null;
    });

  return reconcilePromise;
}

function startDiscordGuildReconciliation(client) {
  queueDiscordGuildReconciliation(client, "startup");

  const intervalMs = Number(config.discord.guildReconcileIntervalMs);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0 || reconcileTimer) return;

  reconcileTimer = setInterval(() => {
    queueDiscordGuildReconciliation(client, "scheduled");
  }, intervalMs);
  reconcileTimer.unref?.();
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
      startDiscordGuildReconciliation(client);
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

export async function backfillDiscordGuildMembers() {
  if (!guildSyncConfigured()) {
    throw new Error("Discord guild sync is not configured. Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID first.");
  }
  if (!isDbConfigured()) {
    throw new Error("Database is not configured.");
  }

  const discord = await import("discord.js");
  const { Client, GatewayIntentBits } = discord;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(config.discord.botToken);
    const guild = await client.guilds.fetch(config.discord.guildId);
    const members = await guild.members.fetch();
    let processed = 0;

    for (const member of members.values()) {
      if (member.user?.bot) continue;
      await handleGuildMemberJoin(member, { mode: "backfill" });
      processed += 1;
    }

    return {
      guildId: guild.id,
      guildName: guild.name,
      processed,
    };
  } finally {
    await client.destroy();
  }
}

export async function reconcileDiscordGuildMembers() {
  if (!guildSyncConfigured()) {
    throw new Error("Discord guild sync is not configured. Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID first.");
  }
  if (!isDbConfigured()) {
    throw new Error("Database is not configured.");
  }

  const discord = await import("discord.js");
  const { Client, GatewayIntentBits } = discord;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  try {
    await client.login(config.discord.botToken);
    return await reconcileDiscordGuildMembersForClient(client, { mode: "manual" });
  } finally {
    await client.destroy();
  }
}
