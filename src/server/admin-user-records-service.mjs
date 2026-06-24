import {
  PERSONNEL_STATUS_OPTIONS,
  deriveGoodStanding,
  getPersonnelProfileById,
} from "./personnel-service.mjs";
import { canManageRoles } from "./role-management-service.mjs";

const ACCOUNT_STATUS_OPTIONS = ["Pending", "Active", "Locked", "Disabled", "Archived"];
const INCLUDED_PERSONNEL_STATUSES = new Set([
  "HonorableDischarge",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
]);
const BLOCKING_APPLICATION_STATUSES = new Set([
  "Submitted",
  "MoreInfoRequested",
  "RecruiterScreening",
  "RecruiterRecommended",
  "TargetUnitReview",
  "Accepted",
]);

export function shouldIncludeAdminUserRecord({
  accountStatus,
  applicationStatuses = [],
  personnelStatus = null,
}) {
  if (accountStatus === "Archived") {
    return false;
  }

  if (personnelStatus) {
    return INCLUDED_PERSONNEL_STATUSES.has(personnelStatus);
  }

  return !applicationStatuses.some((status) => BLOCKING_APPLICATION_STATUSES.has(status));
}

export async function listAdminUserRecords(prisma, actor) {
  if (!canManageRoles(actor)) {
    return permissionDenied();
  }

  const accounts = await prisma.account.findMany({
    where: { status: { not: "Archived" } },
    include: listAccountInclude(),
  });

  const items = accounts
    .filter((account) =>
      shouldIncludeAdminUserRecord({
        accountStatus: account.status,
        personnelStatus: account.personnelProfile?.status ?? null,
        applicationStatuses: (account.applications ?? []).map((application) => application.status),
      }),
    )
    .map(serializeListItem)
    .sort(compareUserRecordItems);

  return { ok: true, items };
}

export async function getAdminUserRecord(prisma, actor, accountId) {
  if (!canManageRoles(actor)) {
    return permissionDenied();
  }

  const normalizedAccountId = normalizeText(accountId);
  if (!normalizedAccountId) {
    return failure("validation_error", "Account ID is required.");
  }

  const account = await prisma.account.findUnique({
    where: { id: normalizedAccountId },
    include: detailAccountInclude(),
  });
  if (!account) {
    return failure("not_found", "Account was not found.");
  }

  const personnelProfile = account.personnelProfile?.id
    ? await getPersonnelProfileById(prisma, account.personnelProfile.id)
    : null;

  return {
    ok: true,
    record: {
      ...account,
      personnelProfile,
      latestApplication: account.applications?.[0] ?? null,
    },
    options: {
      accountStatuses: [...ACCOUNT_STATUS_OPTIONS],
      personnelStatuses: [...PERSONNEL_STATUS_OPTIONS],
    },
    permissions: {
      canUpdate: true,
    },
  };
}

export async function updateAdminUserRecord({ prisma, actor, accountId, body }) {
  if (!canManageRoles(actor)) {
    return permissionDenied();
  }

  const normalizedAccountId = normalizeText(accountId);
  if (!normalizedAccountId) {
    return failure("validation_error", "Account ID is required.");
  }

  const reason = normalizeText(body?.reason);
  if (!reason) {
    return failure("validation_error", "An audit reason is required for user-record updates.");
  }

  const account = await prisma.account.findUnique({
    where: { id: normalizedAccountId },
    include: {
      personnelProfile: {
        select: {
          id: true,
          status: true,
          goodStanding: true,
        },
      },
    },
  });
  if (!account) {
    return failure("not_found", "Account was not found.");
  }

  const nextAccountStatus = normalizeText(body?.accountStatus);
  if (!ACCOUNT_STATUS_OPTIONS.includes(nextAccountStatus)) {
    return failure("validation_error", "Selected account status is invalid.");
  }

  const hasPersonnelProfile = Boolean(account.personnelProfile?.id);
  const nextPersonnelStatus = normalizeText(body?.personnelStatus);
  if (hasPersonnelProfile && !PERSONNEL_STATUS_OPTIONS.includes(nextPersonnelStatus)) {
    return failure("validation_error", "Selected personnel status is invalid.");
  }
  if (!hasPersonnelProfile && nextPersonnelStatus) {
    return failure(
      "validation_error",
      "Personnel status is unavailable until a personnel profile exists.",
    );
  }

  const accountStatusChanged = account.status !== nextAccountStatus;
  const personnelStatusChanged =
    hasPersonnelProfile && account.personnelProfile.status !== nextPersonnelStatus;

  if (!accountStatusChanged && !personnelStatusChanged) {
    return failure("validation_error", "No user-record changes were submitted.");
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const audit = await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: account.id,
        targetPersonnelProfileId: account.personnelProfile?.id ?? null,
        module: "accounts",
        action: "update-admin-user-record",
        recordType: "Account",
        recordId: account.id,
        oldValue: {
          accountStatus: account.status,
          personnelStatus: account.personnelProfile?.status ?? null,
        },
        newValue: {
          accountStatus: nextAccountStatus,
          personnelStatus: hasPersonnelProfile ? nextPersonnelStatus : null,
        },
        reason,
      },
    });

    if (accountStatusChanged) {
      await tx.account.update({
        where: { id: account.id },
        data: buildAccountStatusPatch(account, nextAccountStatus, reason, now),
      });
    }

    if (personnelStatusChanged) {
      const nextGoodStanding = deriveGoodStanding(nextPersonnelStatus);

      await tx.personnelStatusHistory.create({
        data: {
          personnelProfileId: account.personnelProfile.id,
          oldStatus: account.personnelProfile.status,
          newStatus: nextPersonnelStatus,
          effectiveAt: now,
          changedByAccountId: actor.id,
          reason,
          auditLogId: audit.id,
        },
      });

      if (account.personnelProfile.goodStanding !== nextGoodStanding) {
        await tx.personnelStandingHistory.create({
          data: {
            personnelProfileId: account.personnelProfile.id,
            oldGoodStanding: account.personnelProfile.goodStanding,
            newGoodStanding: nextGoodStanding,
            effectiveAt: now,
            changedByAccountId: actor.id,
            reason,
            auditLogId: audit.id,
          },
        });
      }

      await tx.personnelProfile.update({
        where: { id: account.personnelProfile.id },
        data: {
          status: nextPersonnelStatus,
          goodStanding: nextGoodStanding,
        },
      });
    }
  });

  return getAdminUserRecord(prisma, actor, account.id);
}

export async function saveAdminUserRecordNote({ prisma, actor, accountId, noteBody }) {
  if (!canManageRoles(actor)) {
    return permissionDenied();
  }

  const normalizedAccountId = normalizeText(accountId);
  if (!normalizedAccountId) {
    return failure("validation_error", "Account ID is required.");
  }

  const body = normalizeText(noteBody);
  if (!body) {
    return failure("validation_error", "A note is required.");
  }

  const account = await prisma.account.findUnique({
    where: { id: normalizedAccountId },
    select: { id: true },
  });
  if (!account) {
    return failure("not_found", "Account was not found.");
  }

  await prisma.$transaction(async (tx) => {
    const note = await tx.accountAdministrativeNote.create({
      data: {
        accountId: account.id,
        body,
        authorAccountId: actor.id,
      },
    });

    const audit = await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: account.id,
        module: "accounts",
        action: "add-admin-user-record-note",
        recordType: "AccountAdministrativeNote",
        recordId: note.id,
        newValue: {
          body,
        },
        reason: "Admin user record note added.",
      },
    });

    await tx.accountAdministrativeNote.update({
      where: { id: note.id },
      data: { auditLogId: audit.id },
    });
  });

  return getAdminUserRecord(prisma, actor, account.id);
}

function listAccountInclude() {
  return {
    authIdentities: {
      where: { provider: "Discord", unlinkedAt: null },
      orderBy: { linkedAt: "asc" },
      select: {
        providerAccountId: true,
        username: true,
        displayName: true,
      },
    },
    personnelProfile: {
      select: {
        id: true,
        name: true,
        status: true,
      },
    },
    applications: {
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        createdAt: true,
      },
    },
  };
}

function detailAccountInclude() {
  return {
    authIdentities: {
      where: { provider: "Discord", unlinkedAt: null },
      orderBy: { linkedAt: "asc" },
      select: {
        id: true,
        providerAccountId: true,
        username: true,
        displayName: true,
      },
    },
    personnelProfile: {
      select: {
        id: true,
      },
    },
    applications: {
      orderBy: { createdAt: "desc" },
      take: 1,
      select: {
        id: true,
        status: true,
        submittedAt: true,
        createdAt: true,
      },
    },
    adminNotes: {
      orderBy: { createdAt: "asc" },
      include: {
        authorAccount: {
          select: {
            id: true,
            displayName: true,
            authIdentities: {
              where: { provider: "Discord", unlinkedAt: null },
              orderBy: { linkedAt: "asc" },
              select: {
                providerAccountId: true,
                username: true,
                displayName: true,
              },
            },
            personnelProfile: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    },
  };
}

function serializeListItem(account) {
  return {
    id: account.id,
    status: account.status,
    displayName: account.displayName,
    authIdentities: account.authIdentities ?? [],
    personnelProfile: account.personnelProfile ?? null,
    latestApplication: account.applications?.[0] ?? null,
  };
}

function buildAccountStatusPatch(account, nextStatus, reason, now) {
  const patch = {
    status: nextStatus,
    statusReason: reason,
  };

  if (nextStatus === "Active") {
    patch.activatedAt = account.activatedAt ?? now;
    patch.lockedAt = null;
    patch.disabledAt = null;
    patch.archivedAt = null;
    return patch;
  }

  if (nextStatus === "Locked") {
    patch.lockedAt = account.lockedAt ?? now;
    patch.disabledAt = null;
    patch.archivedAt = null;
    return patch;
  }

  if (nextStatus === "Disabled") {
    patch.lockedAt = null;
    patch.disabledAt = account.disabledAt ?? now;
    patch.archivedAt = null;
    return patch;
  }

  if (nextStatus === "Archived") {
    patch.lockedAt = null;
    patch.disabledAt = null;
    patch.archivedAt = account.archivedAt ?? now;
    return patch;
  }

  patch.lockedAt = null;
  patch.disabledAt = null;
  patch.archivedAt = null;
  return patch;
}

function compareUserRecordItems(left, right) {
  const leftName = userRecordSortName(left);
  const rightName = userRecordSortName(right);
  return (
    compareNamesByLastName(leftName, rightName) ||
    compareStrings(
      left.authIdentities?.[0]?.providerAccountId,
      right.authIdentities?.[0]?.providerAccountId,
    )
  );
}

function userRecordSortName(account) {
  return (
    account.personnelProfile?.name ??
    account.displayName ??
    account.authIdentities?.[0]?.displayName ??
    account.authIdentities?.[0]?.username ??
    ""
  );
}

function compareNamesByLastName(leftName, rightName) {
  const left = sortNameParts(leftName);
  const right = sortNameParts(rightName);
  return (
    left.last.localeCompare(right.last) ||
    left.first.localeCompare(right.first) ||
    left.full.localeCompare(right.full)
  );
}

function sortNameParts(fullName) {
  const tokens = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return {
    last: tokens.at(-1)?.toLowerCase() ?? "",
    first: tokens[0]?.toLowerCase() ?? "",
    full: tokens.join(" ").toLowerCase(),
  };
}

function compareStrings(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    sensitivity: "base",
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function permissionDenied() {
  return failure("permission_denied", "Role-management permission is required.");
}

function failure(code, message) {
  return { ok: false, code, message };
}
