import { getDb, isDbConfigured } from "../db.js";
import { getStaffScopeUnitName, isCommandStaffBillet } from "./unit-hierarchy.js";

const sessionUserInclude = {
  roles: {
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
  profile: {
    include: {
      currentRank: true,
      primaryUnit: true,
      primaryBillet: true,
    },
  },
};

const userAdminInclude = {
  roles: {
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

function ensureDb() {
  if (!isDbConfigured()) {
    const error = new Error("Database is not configured.");
    error.statusCode = 503;
    throw error;
  }

  return getDb();
}

function normalizeRoleName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function roleNamesFor(user) {
  const roles = user.roles?.map(({ role }) => normalizeRoleName(role.name)).filter(Boolean) || [];
  if (roles.length) return roles;
  return user.accountStatus === "Applicant" ? ["applicant"] : ["member"];
}

function permissionsFor(user) {
  const permissions = new Set();
  for (const { role } of user.roles || []) {
    for (const { permission } of role.permissions || []) {
      permissions.add(permission.key);
    }
  }
  return [...permissions].sort();
}

export function toSessionUser(user) {
  if (!user) return null;
  const profileUnitName = user.profile?.primaryUnit?.name || "";
  const profileBilletName = user.profile?.primaryBillet?.name || "";
  const scopedUnitName = getStaffScopeUnitName({
    unitName: profileUnitName,
    billetName: profileBilletName,
  });
  const commandBillet = isCommandStaffBillet({
    unitName: profileUnitName,
    billetName: profileBilletName,
  });

  return {
    id: user.id,
    discordId: user.discordId,
    username: user.discordUsername,
    displayName: user.discordDisplayName || user.discordUsername,
    alias: user.displayAlias,
    steam64Id: user.steam64Id,
    steamUsername: user.steamUsername,
    steamProfileUrl: user.steamProfileUrl,
    steamAvatarUrl: user.steamAvatarUrl,
    steamLinkedAt: user.steamLinkedAt,
    steamLastSyncedAt: user.steamLastSyncedAt,
    timezone: user.timezone,
    accountStatus: user.accountStatus,
    accountLocked: user.accountLocked,
    accountDisabled: user.accountDisabled,
    roles: roleNamesFor(user),
    permissions: permissionsFor(user),
    access: {
      personnelScope: commandBillet ? "all" : scopedUnitName ? "scoped" : "self",
      personnelScopeUnit: commandBillet ? "Task Force 20" : scopedUnitName,
    },
    profile: user.profile
      ? {
          id: user.profile.id,
          status: user.profile.currentStatus,
          rank: user.profile.currentRank
            ? {
                id: user.profile.currentRank.id,
                abbreviation: user.profile.currentRank.abbreviation,
                name: user.profile.currentRank.name,
                payGrade: user.profile.currentRank.payGrade,
              }
            : null,
          unit: user.profile.primaryUnit
            ? {
                id: user.profile.primaryUnit.id,
                name: user.profile.primaryUnit.name,
                type: user.profile.primaryUnit.type,
              }
            : null,
          billet: user.profile.primaryBillet
            ? {
                id: user.profile.primaryBillet.id,
                name: user.profile.primaryBillet.name,
              }
            : null,
          primaryMos: user.profile.primaryMos,
        }
      : null,
  };
}

function toAdminUser(user) {
  return {
    id: user.id,
    discordId: user.discordId,
    username: user.discordUsername,
    displayName: user.discordDisplayName || user.discordUsername,
    alias: user.displayAlias,
    steam64Id: user.steam64Id,
    steamUsername: user.steamUsername,
    steamProfileUrl: user.steamProfileUrl,
    steamAvatarUrl: user.steamAvatarUrl,
    steamLinkedAt: user.steamLinkedAt,
    steamLastSyncedAt: user.steamLastSyncedAt,
    timezone: user.timezone,
    accountStatus: user.accountStatus,
    accountLocked: user.accountLocked,
    accountDisabled: user.accountDisabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    roles: user.roles.map(({ role }) => ({
      id: role.id,
      name: role.name,
      slug: normalizeRoleName(role.name),
      permissions: role.permissions.map(({ permission }) => permission.key).sort(),
    })),
  };
}

export async function upsertDiscordUser(profile) {
  if (!isDbConfigured()) {
    return {
      id: `discord:${profile.id}`,
      discordId: profile.id,
      username: profile.username,
      displayName: profile.global_name || profile.displayName || profile.username,
      accountStatus: "Applicant",
      roles: ["applicant"],
      permissions: [],
    };
  }

  const db = getDb();
  const user = await db.user.upsert({
    where: {
      discordId: profile.id,
    },
    create: {
      discordId: profile.id,
      discordUsername: profile.username,
      discordDisplayName: profile.global_name || profile.displayName || profile.username,
      accountStatus: "Applicant",
      lastLoginAt: new Date(),
    },
    update: {
      discordUsername: profile.username,
      discordDisplayName: profile.global_name || profile.displayName || profile.username,
      lastLoginAt: new Date(),
    },
    include: sessionUserInclude,
  });

  return toSessionUser(user);
}

export async function getSessionUserById(id) {
  if (!isDbConfigured() || !id || id.startsWith("discord:")) return null;

  const user = await getDb().user.findUnique({
    where: { id },
    include: sessionUserInclude,
  });

  return toSessionUser(user);
}

export async function listPortalUsers() {
  const db = ensureDb();
  const users = await db.user.findMany({
    orderBy: [{ lastLoginAt: "desc" }, { createdAt: "desc" }],
    include: userAdminInclude,
  });

  return users.map(toAdminUser);
}

export async function listPortalRoles() {
  const db = ensureDb();
  const roles = await db.role.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    slug: normalizeRoleName(role.name),
    description: role.description,
    permissions: role.permissions.map(({ permission }) => permission.key).sort(),
  }));
}

export async function updatePortalUserRoles({ actorUserId, userId, roleNames, reason, ipSessionMetadata }) {
  const db = ensureDb();
  const requestedRoleNames = [...new Set(roleNames.map((name) => String(name).trim()).filter(Boolean))];

  const [targetUser, requestedRoles] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      include: userAdminInclude,
    }),
    db.role.findMany({
      where: { name: { in: requestedRoleNames } },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    }),
  ]);

  if (!targetUser) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  const foundRoleNames = new Set(requestedRoles.map((role) => role.name));
  const unknownRoles = requestedRoleNames.filter((name) => !foundRoleNames.has(name));
  if (unknownRoles.length) {
    const error = new Error(`Unknown role: ${unknownRoles.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const currentRoleNames = targetUser.roles.map(({ role }) => role.name).sort();
  const nextRoleNames = requestedRoles.map((role) => role.name).sort();
  const removingOwnSystemAdmin =
    actorUserId === userId &&
    currentRoleNames.includes("System Admin") &&
    !nextRoleNames.includes("System Admin");

  if (removingOwnSystemAdmin) {
    const error = new Error("You cannot remove System Admin from your own account.");
    error.statusCode = 400;
    throw error;
  }

  const updatedUser = await db.$transaction(async (tx) => {
    await tx.userRole.deleteMany({
      where: requestedRoles.length
        ? {
            userId,
            roleId: {
              notIn: requestedRoles.map((role) => role.id),
            },
          }
        : { userId },
    });

    for (const role of requestedRoles) {
      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: role.id,
        },
      });
    }

    if (currentRoleNames.join("|") !== nextRoleNames.join("|")) {
      await tx.auditLog.create({
        data: {
          actorUserId,
          module: "Access Control",
          action: "Updated User Roles",
          oldValue: { roles: currentRoleNames },
          newValue: { roles: nextRoleNames },
          reason: reason || "Updated from portal user administration.",
          relatedRecordId: userId,
          severity: "Info",
          systemGenerated: false,
          ipSessionMetadata,
        },
      });
    }

    return tx.user.findUnique({
      where: { id: userId },
      include: userAdminInclude,
    });
  });

  return toAdminUser(updatedUser);
}
