export const DISCORD_PROVIDER = "Discord";

const DEFAULT_PENDING_ROLE_REASON =
  "Initial pending-user assignment after approved Discord guild join.";
const DEFAULT_AUDIT_REASON = "Created pending account from approved Discord guild join.";

export async function createPendingDiscordAccount({
  tx,
  providerAccountId,
  username = null,
  displayName = null,
  metadata = {},
  lastGuildVerifiedAt = new Date(),
  roleAssignmentReason = DEFAULT_PENDING_ROLE_REASON,
  auditReason = DEFAULT_AUDIT_REASON,
}) {
  const resolvedDisplayName = normalizeOptionalText(displayName) ?? normalizeOptionalText(username);

  const account = await tx.account.create({
    data: {
      displayName: resolvedDisplayName,
      status: "Pending",
    },
  });

  const authIdentity = await tx.authIdentity.create({
    data: {
      accountId: account.id,
      provider: DISCORD_PROVIDER,
      providerAccountId,
      username: normalizeOptionalText(username),
      displayName: resolvedDisplayName,
      lastGuildVerifiedAt,
      guildMembershipRequired: true,
      isPrimary: true,
      metadata: metadata ?? {},
    },
  });

  const pendingRole = await tx.role.findFirst({
    where: { key: "pending-user", status: "Active" },
  });

  if (pendingRole) {
    await tx.roleAssignment.create({
      data: {
        accountId: account.id,
        roleId: pendingRole.id,
        scopeType: "Global",
        scopeIncludesDescendants: true,
        reason: roleAssignmentReason,
      },
    });
  }

  await tx.auditLog.create({
    data: {
      targetAccountId: account.id,
      module: "accounts",
      action: "create-pending-account",
      recordType: "Account",
      recordId: account.id,
      newValue: {
        status: "Pending",
        provider: DISCORD_PROVIDER,
      },
      reason: auditReason,
    },
  });

  return { account, authIdentity };
}

export function buildDiscordMembershipJoinMetadata({
  guildId,
  occurredAt,
  username = null,
  displayName = null,
  serverNickname = null,
  source = "discord-membership-event",
}) {
  const metadata = {
    guild_id: normalizeOptionalText(guildId),
    joined_at: occurredAt instanceof Date ? occurredAt.toISOString() : null,
    source: normalizeOptionalText(source),
  };

  const normalizedUsername = normalizeOptionalText(username);
  if (normalizedUsername) {
    metadata.username = normalizedUsername;
  }

  const normalizedDisplayName = normalizeOptionalText(displayName);
  if (normalizedDisplayName) {
    metadata.display_name = normalizedDisplayName;
  }

  const normalizedServerNickname = normalizeOptionalText(serverNickname);
  if (normalizedServerNickname) {
    metadata.server_nickname = normalizedServerNickname;
  }

  return metadata;
}

function normalizeOptionalText(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}
