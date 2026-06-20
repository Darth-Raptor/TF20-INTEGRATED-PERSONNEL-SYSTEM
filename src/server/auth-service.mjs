import { buildAccessContext } from "./access.mjs";
import { createRandomId } from "./cookies.mjs";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const ACCOUNT_ACCESS_INCLUDE = {
  personnelProfile: true,
  roleAssignments: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
};

export async function buildDiscordAuthorizationUrl(config, state) {
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", config.discord.clientId);
  url.searchParams.set("redirect_uri", config.discord.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeDiscordCode(config, code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.discord.redirectUri,
  });

  const response = await fetch(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchDiscordUser(accessToken) {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Discord user fetch failed with ${response.status}`);
  }

  return response.json();
}

export async function verifyDiscordGuildMembership(config, userId) {
  const response = await fetch(
    `${DISCORD_API_BASE}/guilds/${config.discord.approvedGuildId}/members/${userId}`,
    {
      headers: { Authorization: `Bot ${config.discord.botToken}` },
    },
  );

  if (response.status === 404) {
    return { isMember: false, payload: null };
  }

  if (!response.ok) {
    throw new Error(`Discord guild verification failed with ${response.status}`);
  }

  return {
    isMember: true,
    payload: await response.json(),
  };
}

export async function resolveAuthenticatedAccount({ prisma, discordUser, guildPayload }) {
  const authIdentity = await prisma.authIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "Discord",
        providerAccountId: discordUser.id,
      },
    },
    include: {
      account: {
        include: ACCOUNT_ACCESS_INCLUDE,
      },
    },
  });

  if (authIdentity) {
    const updated = await prisma.$transaction(async (tx) => {
      const refreshedIdentity = await tx.authIdentity.update({
        where: { id: authIdentity.id },
        data: {
          username: discordUser.username,
          displayName: discordUser.global_name ?? discordUser.username,
          lastGuildVerifiedAt: new Date(),
          metadata: guildPayload ?? authIdentity.metadata ?? {},
        },
        include: {
          account: {
            include: ACCOUNT_ACCESS_INCLUDE,
          },
        },
      });

      await claimCurrentMemberAccount({
        tx,
        account: refreshedIdentity.account,
        authIdentity: refreshedIdentity,
      });

      return refreshedIdentity;
    });

    const refreshedAccount = await prisma.account.findUniqueOrThrow({
      where: { id: updated.accountId },
      include: ACCOUNT_ACCESS_INCLUDE,
    });

    return {
      account: refreshedAccount,
      authIdentity: updated,
      created: false,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        displayName: discordUser.global_name ?? discordUser.username,
        status: "Pending",
      },
    });

    const createdAuthIdentity = await tx.authIdentity.create({
      data: {
        accountId: account.id,
        provider: "Discord",
        providerAccountId: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name ?? discordUser.username,
        lastGuildVerifiedAt: new Date(),
        guildMembershipRequired: true,
        isPrimary: true,
        metadata: guildPayload ?? {},
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
          reason: "Initial pending-user assignment after approved-guild Discord login.",
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
          provider: "Discord",
        },
        reason: "Created pending account from approved Discord guild login.",
      },
    });

    return { account, authIdentity: createdAuthIdentity };
  });

  const refreshedAccount = await prisma.account.findUniqueOrThrow({
    where: { id: result.account.id },
    include: ACCOUNT_ACCESS_INCLUDE,
  });

  return {
    account: refreshedAccount,
    authIdentity: result.authIdentity,
    created: true,
  };
}

async function claimCurrentMemberAccount({ tx, account, authIdentity }) {
  if (account.status !== "Active" || !account.personnelProfile) {
    return false;
  }

  const alreadyClaimed = Boolean(account.claimedAt && account.personnelProfile.claimedAt);
  if (alreadyClaimed) {
    return false;
  }

  const now = new Date();
  const accountClaimedAt = account.claimedAt ?? now;
  const personnelProfileClaimedAt = account.personnelProfile.claimedAt ?? now;

  await tx.account.update({
    where: { id: account.id },
    data: {
      claimedAt: accountClaimedAt,
      displayName: account.displayName ?? authIdentity.displayName ?? authIdentity.username,
    },
  });

  await tx.personnelProfile.update({
    where: { id: account.personnelProfile.id },
    data: {
      claimedAt: personnelProfileClaimedAt,
    },
  });

  await tx.auditLog.create({
    data: {
      actorAccountId: account.id,
      targetAccountId: account.id,
      targetPersonnelProfileId: account.personnelProfile.id,
      module: "accounts",
      action: "claim-current-member-account",
      recordType: "Account",
      recordId: account.id,
      newValue: {
        accountClaimedAt,
        personnelProfileClaimedAt,
        provider: authIdentity.provider,
        providerAccountId: authIdentity.providerAccountId,
      },
      reason: "Current member claimed account through Discord authentication.",
    },
  });

  return true;
}

export function flattenPermissions(account) {
  return (account.roleAssignments ?? []).flatMap((assignment) => {
    if (assignment.endsAt || assignment.role?.status !== "Active") return [];
    return (assignment.role?.permissions ?? [])
      .map((grant) => grant.permission)
      .filter((permission) => permission?.status === "Active");
  });
}

function activeRoleKeys(account) {
  return Array.from(
    new Set(
      (account.roleAssignments ?? [])
        .filter((assignment) => !assignment.endsAt && assignment.role?.status === "Active")
        .map((assignment) => assignment.role?.key)
        .filter(Boolean),
    ),
  ).sort();
}

export async function createSession({ prisma, config, account, authIdentity }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  const recentAuthExpiresAt = new Date(now.getTime() + config.recentAuthWindowMinutes * 60 * 1000);
  const sessionId = createRandomId();

  const session = await prisma.session.create({
    data: {
      id: sessionId,
      accountId: account.id,
      data: {
        provider: authIdentity.provider,
        providerAccountId: authIdentity.providerAccountId,
      },
      expiresAt,
      lastAuthenticatedAt: now,
      recentAuthExpiresAt,
    },
  });

  await prisma.account.update({
    where: { id: account.id },
    data: {
      lastLoginAt: now,
    },
  });

  return session;
}

export async function logIntegration(prisma, payload) {
  await prisma.integrationLog.create({
    data: payload,
  });
}

export function buildSessionSummary({ account, session, authIdentity }) {
  const permissions = flattenPermissions(account);
  const access = buildAccessContext({ account, permissions });
  const roleKeys = activeRoleKeys(account);

  return {
    account: {
      id: account.id,
      displayName: account.displayName,
      email: account.email,
      timezone: account.timezone,
      status: account.status,
      claimedAt: account.claimedAt,
    },
    authIdentity: {
      id: authIdentity.id,
      provider: authIdentity.provider,
      username: authIdentity.username,
      displayName: authIdentity.displayName,
      lastGuildVerifiedAt: authIdentity.lastGuildVerifiedAt,
    },
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
      lastAuthenticatedAt: session.lastAuthenticatedAt,
      recentAuthExpiresAt: session.recentAuthExpiresAt,
    },
    gateState: access.gateState,
    visibleModules: access.visibleModules,
    roleKeys,
    permissions: Array.from(new Set(permissions.map((permission) => permission.key))).sort(),
  };
}
