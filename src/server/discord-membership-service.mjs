import {
  buildDiscordMembershipJoinMetadata,
  createPendingDiscordAccount,
  DISCORD_PROVIDER,
} from "./discord-account-service.mjs";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export async function ingestDiscordMembershipEvent({ prisma, config, payload }) {
  const normalized = normalizeDiscordMembershipEventPayload(payload);
  if (!normalized.ok) {
    return normalized;
  }

  if (normalized.data.guildId !== config.discord.approvedGuildId) {
    return failure("invalid_guild", "Discord membership event does not match the approved guild.");
  }

  try {
    const { event, pendingAccountCreated } = await prisma.$transaction(async (tx) => {
      let pendingAccountCreated = false;
      let linkedIdentity = await tx.authIdentity.findUnique({
        where: {
          provider_providerAccountId: {
            provider: DISCORD_PROVIDER,
            providerAccountId: normalized.data.providerAccountId,
          },
        },
        select: {
          id: true,
          accountId: true,
          username: true,
          displayName: true,
          metadata: true,
        },
      });

      if (!linkedIdentity && normalized.data.eventType === "Join") {
        const createdPendingAccount = await createPendingDiscordAccount({
          tx,
          providerAccountId: normalized.data.providerAccountId,
          username: normalized.data.username,
          displayName: normalized.data.displayName,
          metadata: buildDiscordMembershipJoinMetadata({
            guildId: normalized.data.guildId,
            occurredAt: normalized.data.occurredAt,
            username: normalized.data.username,
            displayName: normalized.data.displayName,
            serverNickname: normalized.data.serverNickname,
          }),
          lastGuildVerifiedAt: normalized.data.occurredAt,
          roleAssignmentReason: "Initial pending-user assignment after Discord guild join.",
          auditReason: "Created pending account from Discord guild join event.",
        });

        linkedIdentity = {
          id: createdPendingAccount.authIdentity.id,
          accountId: createdPendingAccount.account.id,
          username: createdPendingAccount.authIdentity.username,
          displayName: createdPendingAccount.authIdentity.displayName,
          metadata: createdPendingAccount.authIdentity.metadata,
        };
        pendingAccountCreated = true;
      } else if (linkedIdentity) {
        const identityPatch = buildDiscordIdentityPatchFromMembershipEvent(
          linkedIdentity,
          normalized.data,
        );
        if (Object.keys(identityPatch).length) {
          linkedIdentity = await tx.authIdentity.update({
            where: { id: linkedIdentity.id },
            data: identityPatch,
            select: {
              id: true,
              accountId: true,
              username: true,
              displayName: true,
              metadata: true,
            },
          });
        }
      }

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
            createdPendingAccount: pendingAccountCreated,
          },
          createdAt: created.occurredAt,
        },
      });

      return {
        event: created,
        pendingAccountCreated,
      };
    });

    return { ok: true, created: true, event, pendingAccountCreated };
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

export async function backfillPendingDiscordAccountsFromMembershipEvents({
  prisma,
  apply = false,
} = {}) {
  const unattachedEvents = await prisma.discordMembershipEvent.findMany({
    where: { accountId: null },
    orderBy: [{ occurredAt: "asc" }, { capturedAt: "asc" }],
    select: {
      providerAccountId: true,
      eventType: true,
      occurredAt: true,
      guildId: true,
      username: true,
      displayName: true,
      serverNickname: true,
    },
  });

  const groups = groupMembershipEventsByProvider(unattachedEvents);
  const providerAccountIds = [...groups.keys()];
  const existingIdentities = providerAccountIds.length
    ? await prisma.authIdentity.findMany({
        where: {
          provider: DISCORD_PROVIDER,
          providerAccountId: { in: providerAccountIds },
        },
        select: {
          providerAccountId: true,
          accountId: true,
        },
      })
    : [];
  const identitiesByProvider = new Map(
    existingIdentities.map((identity) => [identity.providerAccountId, identity]),
  );

  const plan = providerAccountIds.map((providerAccountId) =>
    buildBackfillCandidate({
      providerAccountId,
      events: groups.get(providerAccountId) ?? [],
      existingIdentity: identitiesByProvider.get(providerAccountId) ?? null,
    }),
  );

  const summary = {
    dryRun: !apply,
    providerCount: plan.length,
    unattachedEventCount: unattachedEvents.length,
    creatableAccountCount: plan.filter((candidate) => candidate.action === "create-account").length,
    relinkOnlyCount: plan.filter((candidate) => candidate.action === "link-existing-account")
      .length,
    skippedLeaveOnlyCount: plan.filter((candidate) => candidate.action === "skip-leave-only")
      .length,
    appliedAccountsCreated: 0,
    appliedEventsAttached: 0,
  };

  if (!apply) {
    return summary;
  }

  for (const candidate of plan) {
    if (candidate.action === "skip-leave-only") {
      continue;
    }

    if (candidate.action === "link-existing-account") {
      const updated = await prisma.discordMembershipEvent.updateMany({
        where: {
          providerAccountId: candidate.providerAccountId,
          accountId: null,
        },
        data: {
          accountId: candidate.accountId,
        },
      });
      summary.appliedEventsAttached += updated.count;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const created = await createPendingDiscordAccount({
        tx,
        providerAccountId: candidate.providerAccountId,
        username: candidate.username,
        displayName: candidate.displayName,
        metadata: buildDiscordMembershipJoinMetadata({
          guildId: candidate.guildId,
          occurredAt: candidate.joinedAt,
          username: candidate.username,
          displayName: candidate.displayName,
          serverNickname: candidate.serverNickname,
        }),
        lastGuildVerifiedAt: candidate.joinedAt,
        roleAssignmentReason: "Initial pending-user assignment during Discord membership backfill.",
        auditReason: "Created pending account from Discord membership event backfill.",
      });

      const updated = await tx.discordMembershipEvent.updateMany({
        where: {
          providerAccountId: candidate.providerAccountId,
          accountId: null,
        },
        data: {
          accountId: created.account.id,
        },
      });

      summary.appliedAccountsCreated += 1;
      summary.appliedEventsAttached += updated.count;
    });
  }

  summary.dryRun = false;
  return summary;
}

export async function listCurrentDiscordGuildMembers({
  config,
  fetchImpl = fetch,
  pageSize = 1000,
}) {
  const members = [];
  let after = "0";

  while (true) {
    const url = new URL(`${DISCORD_API_BASE}/guilds/${config.discord.approvedGuildId}/members`);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("after", after);

    const response = await fetchImpl(url, {
      headers: { Authorization: `Bot ${config.discord.botToken}` },
    });

    if (!response.ok) {
      throw new Error(
        `Discord current-member backfill failed to list guild members with ${response.status}. Verify the bot token and the GUILD_MEMBERS privileged intent.`,
      );
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error("Discord current-member backfill expected an array of guild members.");
    }

    const page = payload
      .map((member) => normalizeCurrentDiscordGuildMember(member, config.discord.approvedGuildId))
      .filter(Boolean);
    members.push(...page);

    if (payload.length < pageSize) {
      break;
    }

    const lastUserId = payload.at(-1)?.user?.id;
    if (!lastUserId || lastUserId === after) {
      break;
    }
    after = String(lastUserId);
  }

  return members;
}

export async function backfillCurrentDiscordGuildMembers({
  prisma,
  config,
  apply = false,
  listMembers = null,
  fetchImpl = fetch,
} = {}) {
  const members = listMembers
    ? await listMembers({ config, fetchImpl })
    : await listCurrentDiscordGuildMembers({ config, fetchImpl });

  const normalizedMembers = members
    .map((member) => normalizeCurrentDiscordGuildMember(member, config.discord.approvedGuildId))
    .filter(Boolean);
  const humanMembers = normalizedMembers.filter((member) => !member.isBot);
  const providerAccountIds = humanMembers.map((member) => member.providerAccountId);

  const existingIdentities = providerAccountIds.length
    ? await prisma.authIdentity.findMany({
        where: {
          provider: DISCORD_PROVIDER,
          providerAccountId: { in: providerAccountIds },
        },
        include: {
          account: {
            select: {
              id: true,
              status: true,
              archivedAt: true,
            },
          },
        },
      })
    : [];
  const identitiesByProvider = new Map(
    existingIdentities.map((identity) => [identity.providerAccountId, identity]),
  );

  const currentJoinEvents = providerAccountIds.length
    ? await prisma.discordMembershipEvent.findMany({
        where: {
          providerAccountId: { in: providerAccountIds },
          eventType: "Join",
        },
        select: {
          providerAccountId: true,
        },
      })
    : [];
  const providerIdsWithJoinEvents = new Set(
    currentJoinEvents.map((event) => event.providerAccountId),
  );

  const plan = humanMembers.map((member) =>
    buildCurrentGuildMemberBackfillCandidate({
      member,
      existingIdentity: identitiesByProvider.get(member.providerAccountId) ?? null,
      hasJoinEvent: providerIdsWithJoinEvents.has(member.providerAccountId),
    }),
  );

  const summary = {
    dryRun: !apply,
    guildMemberCount: normalizedMembers.length,
    skippedBotCount: normalizedMembers.length - humanMembers.length,
    providerCount: humanMembers.length,
    creatableAccountCount: plan.filter((candidate) => candidate.action === "create-account").length,
    refreshOnlyCount: plan.filter((candidate) => candidate.action === "refresh-existing").length,
    skippedArchivedCount: plan.filter((candidate) => candidate.action === "skip-archived").length,
    joinEventCreateCount: plan.filter((candidate) => candidate.needsJoinEvent).length,
    appliedAccountsCreated: 0,
    appliedAccountsRefreshed: 0,
    appliedJoinEventsCreated: 0,
    appliedEventsAttached: 0,
  };

  if (!apply) {
    return summary;
  }

  for (const candidate of plan) {
    if (candidate.action === "skip-archived") {
      continue;
    }

    const result = await prisma.$transaction(async (tx) =>
      applyCurrentGuildMemberBackfillCandidate({
        tx,
        candidate,
      }),
    );

    summary.appliedAccountsCreated += result.accountCreated ? 1 : 0;
    summary.appliedAccountsRefreshed += result.accountRefreshed ? 1 : 0;
    summary.appliedJoinEventsCreated += result.joinEventCreated ? 1 : 0;
    summary.appliedEventsAttached += result.eventsAttachedCount;
  }

  summary.dryRun = false;
  return summary;
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

function buildBackfillCandidate({ providerAccountId, events, existingIdentity }) {
  const joinEvents = events.filter((event) => event.eventType === "Join");
  const mostRecentEventWithIdentity = [...events]
    .reverse()
    .find((event) => event.username || event.displayName || event.serverNickname);
  const firstJoinEvent = joinEvents[0] ?? null;

  if (existingIdentity?.accountId) {
    return {
      action: "link-existing-account",
      providerAccountId,
      accountId: existingIdentity.accountId,
    };
  }

  if (!firstJoinEvent) {
    return {
      action: "skip-leave-only",
      providerAccountId,
    };
  }

  return {
    action: "create-account",
    providerAccountId,
    guildId: firstJoinEvent.guildId,
    joinedAt: firstJoinEvent.occurredAt,
    username: mostRecentEventWithIdentity?.username ?? null,
    displayName: mostRecentEventWithIdentity?.displayName ?? null,
    serverNickname: mostRecentEventWithIdentity?.serverNickname ?? null,
  };
}

function groupMembershipEventsByProvider(events) {
  const groups = new Map();
  for (const event of events) {
    const group = groups.get(event.providerAccountId) ?? [];
    group.push(event);
    groups.set(event.providerAccountId, group);
  }
  return groups;
}

function buildCurrentGuildMemberBackfillCandidate({ member, existingIdentity, hasJoinEvent }) {
  if (existingIdentity?.account?.status === "Archived" || existingIdentity?.account?.archivedAt) {
    return {
      action: "skip-archived",
      providerAccountId: member.providerAccountId,
      needsJoinEvent: false,
    };
  }

  if (existingIdentity?.accountId) {
    return {
      action: "refresh-existing",
      providerAccountId: member.providerAccountId,
      accountId: existingIdentity.accountId,
      identityId: existingIdentity.id,
      existingIdentity,
      member,
      needsJoinEvent: !hasJoinEvent && Boolean(member.joinedAt),
    };
  }

  return {
    action: "create-account",
    providerAccountId: member.providerAccountId,
    member,
    needsJoinEvent: Boolean(member.joinedAt),
  };
}

async function applyCurrentGuildMemberBackfillCandidate({ tx, candidate }) {
  if (candidate.action === "skip-archived") {
    return {
      accountCreated: false,
      accountRefreshed: false,
      joinEventCreated: false,
      eventsAttachedCount: 0,
    };
  }

  let accountId = candidate.accountId ?? null;
  let accountCreated = false;
  let accountRefreshed = false;

  if (candidate.action === "create-account") {
    const created = await createPendingDiscordAccount({
      tx,
      providerAccountId: candidate.member.providerAccountId,
      username: candidate.member.username,
      displayName: candidate.member.displayName,
      metadata: buildDiscordMembershipJoinMetadata({
        guildId: candidate.member.guildId,
        occurredAt: candidate.member.joinedAt,
        username: candidate.member.username,
        displayName: candidate.member.displayName,
        serverNickname: candidate.member.serverNickname,
        source: "discord-guild-roster-backfill",
      }),
      lastGuildVerifiedAt: new Date(),
      roleAssignmentReason: "Initial pending-user assignment during Discord guild roster backfill.",
      auditReason: "Created pending account from current Discord guild roster backfill.",
    });
    accountId = created.account.id;
    accountCreated = true;
  } else {
    const patch = buildDiscordIdentityPatchFromCurrentMember(
      candidate.existingIdentity,
      candidate.member,
    );
    if (Object.keys(patch).length) {
      await tx.authIdentity.update({
        where: { id: candidate.identityId },
        data: patch,
      });
      accountRefreshed = true;
    }
  }

  const linked = await linkDiscordMembershipEventsToAccount({
    tx,
    accountId,
    providerAccountId: candidate.member.providerAccountId,
  });

  const joinEventResult =
    candidate.needsJoinEvent && accountId
      ? await ensureDiscordGuildRosterJoinEvent({
          tx,
          accountId,
          providerAccountId: candidate.member.providerAccountId,
          guildId: candidate.member.guildId,
          joinedAt: candidate.member.joinedAt,
          username: candidate.member.username,
          displayName: candidate.member.displayName,
          serverNickname: candidate.member.serverNickname,
        })
      : { created: false };

  return {
    accountCreated,
    accountRefreshed,
    joinEventCreated: Boolean(joinEventResult.created),
    eventsAttachedCount: linked.count,
  };
}

function buildDiscordIdentityPatchFromCurrentMember(existingIdentity, member) {
  const patch = {
    lastGuildVerifiedAt: new Date(),
    unlinkedAt: null,
    metadata: mergeDiscordIdentityMetadataFromCurrentMember(existingIdentity?.metadata, member),
  };

  if (member.username) {
    patch.username = member.username;
  }

  if (member.displayName) {
    patch.displayName = member.displayName;
  }

  return patch;
}

async function ensureDiscordGuildRosterJoinEvent({
  tx,
  accountId,
  providerAccountId,
  guildId,
  joinedAt,
  username,
  displayName,
  serverNickname,
}) {
  if (!tx || !accountId || !providerAccountId || !guildId || !joinedAt) {
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

  const externalEventId = buildGuildRosterBackfillEventId({
    guildId,
    providerAccountId,
    occurredAt: joinedAt,
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
      source: "GuildRosterBackfill",
      username: username ?? null,
      displayName: displayName ?? null,
      serverNickname: serverNickname ?? null,
      occurredAt: joinedAt,
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
        guildId,
      },
      responsePayload: {
        source: "guild-roster-backfill",
        joinedAt: joinedAt.toISOString(),
      },
      createdAt: joinedAt,
    },
  });

  return { created: true, event };
}

export function buildGuildRosterBackfillEventId({ guildId, providerAccountId, occurredAt }) {
  return `guild-roster-backfill:${guildId}:${providerAccountId}:${occurredAt.toISOString()}`;
}

function normalizeCurrentDiscordGuildMember(member, fallbackGuildId = null) {
  const providerAccountId = normalizeText(member?.providerAccountId ?? member?.user?.id);
  if (!providerAccountId) {
    return null;
  }

  return {
    providerAccountId,
    guildId: normalizeText(member?.guildId ?? member?.guild_id ?? fallbackGuildId) || null,
    username: normalizeOptionalText(member?.username ?? member?.user?.username),
    displayName: normalizeOptionalText(
      member?.displayName ?? member?.user?.global_name ?? member?.nick,
    ),
    serverNickname: normalizeOptionalText(member?.serverNickname ?? member?.nick),
    joinedAt: parseDate(member?.joinedAt ?? member?.joined_at),
    isBot: Boolean(member?.isBot ?? member?.user?.bot),
  };
}

function buildDiscordIdentityPatchFromMembershipEvent(existingIdentity, event) {
  const patch = {};

  if (event.username && event.username !== existingIdentity?.username) {
    patch.username = event.username;
  }

  if (event.displayName && event.displayName !== existingIdentity?.displayName) {
    patch.displayName = event.displayName;
  }

  if (event.eventType === "Join") {
    patch.lastGuildVerifiedAt = event.occurredAt;
    patch.metadata = mergeDiscordIdentityMetadata(existingIdentity?.metadata, event);
  }

  return patch;
}

function mergeDiscordIdentityMetadata(existingMetadata, event) {
  const nextMetadata =
    existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
      ? { ...existingMetadata }
      : {};

  if (!nextMetadata.guild_id) {
    nextMetadata.guild_id = event.guildId;
  }

  if (event.eventType === "Join" && !nextMetadata.joined_at) {
    nextMetadata.joined_at = event.occurredAt.toISOString();
  }

  return nextMetadata;
}

function mergeDiscordIdentityMetadataFromCurrentMember(existingMetadata, member) {
  const nextMetadata =
    existingMetadata && typeof existingMetadata === "object" && !Array.isArray(existingMetadata)
      ? { ...existingMetadata }
      : {};

  if (!nextMetadata.guild_id && member.guildId) {
    nextMetadata.guild_id = member.guildId;
  }

  if (!nextMetadata.joined_at && member.joinedAt) {
    nextMetadata.joined_at = member.joinedAt.toISOString();
  }

  if (member.serverNickname) {
    nextMetadata.server_nickname = member.serverNickname;
  }

  if (member.username) {
    nextMetadata.username = member.username;
  }

  if (member.displayName) {
    nextMetadata.display_name = member.displayName;
  }

  nextMetadata.source = "discord-guild-roster-backfill";
  return nextMetadata;
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
