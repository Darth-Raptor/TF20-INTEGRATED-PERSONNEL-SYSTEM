const DISCORD_PROVIDER = "Discord";

export async function ingestDiscordMembershipEvent({ prisma, config, payload }) {
  const normalized = normalizeDiscordMembershipEventPayload(payload);
  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.data.guildId !== config.discord.approvedGuildId) {
    return failure("invalid_guild", "Discord membership event does not match the approved guild.");
  }

  const linkedIdentity = await prisma.authIdentity.findFirst({
    where: {
      provider: DISCORD_PROVIDER,
      providerAccountId: normalized.data.providerAccountId,
      unlinkedAt: null,
    },
    select: { accountId: true },
  });

  try {
    const event = await prisma.$transaction(async (tx) => {
      const created = await tx.discordMembershipEvent.create({
        data: {
          externalEventId: normalized.data.externalEventId,
          providerAccountId: normalized.data.providerAccountId,
          accountId: linkedIdentity?.accountId ?? null,
          guildId: normalized.data.guildId,
          eventType: normalized.data.eventType,
          source: "BotBridge",
          username: normalized.data.username,
          displayName: normalized.data.displayName,
          serverNickname: normalized.data.serverNickname,
          occurredAt: normalized.data.occurredAt,
        },
      });

      await tx.integrationLog.create({
        data: {
          provider: DISCORD_PROVIDER,
          action: created.eventType === "Join" ? "guild-member-join" : "guild-member-leave",
          status: "Success",
          accountId: created.accountId,
          relatedRecordType: "DiscordMembershipEvent",
          relatedRecordId: created.id,
          requestPayload: {
            eventId: normalized.data.externalEventId,
            discordUserId: normalized.data.providerAccountId,
            guildId: normalized.data.guildId,
            eventType: normalized.data.eventType,
            occurredAt: normalized.data.occurredAt.toISOString(),
            username: normalized.data.username,
            displayName: normalized.data.displayName,
            serverNickname: normalized.data.serverNickname,
          },
          responsePayload: {
            source: "bot-bridge",
            linkedAccountId: created.accountId,
          },
          createdAt: created.occurredAt,
        },
      });

      return created;
    });

    return { ok: true, created: true, event };
  } catch (error) {
    if (error?.code === "P2002") {
      const existing = await prisma.discordMembershipEvent.findUniqueOrThrow({
        where: { externalEventId: normalized.data.externalEventId },
      });
      return { ok: true, created: false, event: existing };
    }
    throw error;
  }
}

export function normalizeDiscordMembershipEventPayload(payload) {
  const externalEventId = normalizeText(payload?.eventId ?? payload?.externalEventId);
  const providerAccountId = normalizeText(payload?.discordUserId ?? payload?.providerAccountId);
  const guildId = normalizeText(payload?.guildId);
  const username = normalizeOptionalText(payload?.username);
  const displayName = normalizeOptionalText(payload?.displayName);
  const serverNickname = normalizeOptionalText(payload?.serverNickname);
  const eventType = normalizeDiscordMembershipEventType(payload?.eventType);
  const occurredAt = parseDate(payload?.occurredAt);

  if (!externalEventId) {
    return failure("validation_error", "Discord membership event ID is required.");
  }
  if (!providerAccountId) {
    return failure("validation_error", "Discord membership event Discord user ID is required.");
  }
  if (!guildId) {
    return failure("validation_error", "Discord membership event guild ID is required.");
  }
  if (!eventType) {
    return failure("validation_error", "Discord membership event type must be join or leave.");
  }
  if (!occurredAt) {
    return failure("validation_error", "Discord membership event occurredAt must be a valid date.");
  }

  return {
    ok: true,
    data: {
      externalEventId,
      providerAccountId,
      guildId,
      eventType,
      occurredAt,
      username,
      displayName,
      serverNickname,
    },
  };
}

export async function linkDiscordMembershipEventsToAccount({ tx, accountId, providerAccountId }) {
  if (!tx || !accountId || !providerAccountId) {
    return { count: 0 };
  }

  const updated = await tx.discordMembershipEvent.updateMany({
    where: {
      providerAccountId,
      accountId: null,
    },
    data: {
      accountId,
    },
  });

  return { count: updated.count };
}

export async function ensureDiscordOAuthMembershipJoinEvent({
  tx,
  accountId,
  providerAccountId,
  guildId,
  guildPayload,
  username,
  displayName,
}) {
  const occurredAt = extractDiscordGuildJoinedAt(guildPayload);
  if (!tx || !accountId || !providerAccountId || !guildId || !occurredAt) {
    return { created: false, event: null };
  }

  const existingJoin = await tx.discordMembershipEvent.findFirst({
    where: {
      providerAccountId,
      eventType: "Join",
    },
    select: { id: true },
  });
  if (existingJoin) {
    return { created: false, event: null };
  }

  const externalEventId = buildOAuthBackfillEventId({
    guildId,
    providerAccountId,
    occurredAt,
  });

  const existingById = await tx.discordMembershipEvent.findUnique({
    where: { externalEventId },
  });
  if (existingById) {
    if (!existingById.accountId) {
      await tx.discordMembershipEvent.update({
        where: { id: existingById.id },
        data: { accountId },
      });
    }
    return { created: false, event: existingById };
  }

  const event = await tx.discordMembershipEvent.create({
    data: {
      externalEventId,
      providerAccountId,
      accountId,
      guildId,
      eventType: "Join",
      source: "OAuthBackfill",
      username: username ?? null,
      displayName: displayName ?? null,
      occurredAt,
    },
  });

  await tx.integrationLog.create({
    data: {
      provider: DISCORD_PROVIDER,
      action: "guild-member-join",
      status: "Success",
      accountId,
      relatedRecordType: "DiscordMembershipEvent",
      relatedRecordId: event.id,
      requestPayload: {
        discordUserId: providerAccountId,
      },
      responsePayload: {
        source: "oauth-guild-verification",
        joinedAt: occurredAt.toISOString(),
      },
      createdAt: occurredAt,
    },
  });

  return { created: true, event };
}

export async function listDiscordMembershipTimelineEntries(prisma, application) {
  if (!application?.accountId) {
    return [];
  }

  const events = await prisma.discordMembershipEvent.findMany({
    where: { accountId: application.accountId },
    orderBy: [{ occurredAt: "asc" }, { capturedAt: "asc" }],
  });

  const timeline = events.map(mapDiscordMembershipEventToTimelineEntry);
  const fallbackJoinEntry = buildFallbackDiscordJoinTimelineEntry(application, timeline);
  if (fallbackJoinEntry) {
    timeline.unshift(fallbackJoinEntry);
  }

  return timeline.sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export function mapDiscordMembershipEventToTimelineEntry(event) {
  if (!event || (event.eventType !== "Join" && event.eventType !== "Leave")) {
    return null;
  }

  return {
    id: `discord-membership:${event.id}`,
    newStatus: null,
    createdAt: event.occurredAt,
    reason:
      event.eventType === "Join"
        ? "Discord account joined the server."
        : "Discord account left the server.",
    displayLabel: event.eventType === "Join" ? "Discord Server - Join" : "Discord Server - Left",
  };
}

export function buildOAuthBackfillEventId({ guildId, providerAccountId, occurredAt }) {
  return `oauth-joined-at:${guildId}:${providerAccountId}:${occurredAt.toISOString()}`;
}

export function extractDiscordGuildJoinedAt(guildPayload) {
  const rawValue =
    guildPayload &&
    typeof guildPayload === "object" &&
    !Array.isArray(guildPayload) &&
    "joined_at" in guildPayload
      ? guildPayload.joined_at
      : null;
  if (!rawValue) {
    return null;
  }

  const joinedAt = new Date(rawValue);
  return Number.isNaN(joinedAt.getTime()) ? null : joinedAt;
}

function buildFallbackDiscordJoinTimelineEntry(application, timeline) {
  const hasJoinEntry = (timeline ?? []).some(
    (entry) => entry?.displayLabel === "Discord Server - Join",
  );
  if (hasJoinEntry) {
    return null;
  }

  const authIdentity = (application?.account?.authIdentities ?? []).find(
    (identity) => identity?.provider === DISCORD_PROVIDER && !identity?.unlinkedAt,
  );
  const occurredAt = extractDiscordGuildJoinedAt(authIdentity?.metadata);
  if (!occurredAt) {
    return null;
  }

  return {
    id: `discord-fallback:${authIdentity.id}:${occurredAt.toISOString()}`,
    newStatus: null,
    createdAt: occurredAt,
    reason: "Discord account joined the server.",
    displayLabel: "Discord Server - Join",
  };
}

function normalizeDiscordMembershipEventType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "join") return "Join";
  if (normalized === "leave") return "Leave";
  return null;
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function failure(code, message) {
  return {
    ok: false,
    code,
    message,
  };
}
