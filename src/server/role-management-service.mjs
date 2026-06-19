const UNIT_SCOPED_ROLE_KEYS = new Set(["unit-staff", "trainer"]);
const MEMBER_DEPENDENT_ROLE_KEYS = new Set(["recruiter", "trainer", "unit-staff", "command-staff"]);

export function canManageRoles(account) {
  return account?.status === "Active" && hasPermission(account, "access.roles.manage");
}

export async function listRoleManagementOptions(prisma, actor) {
  if (!canManageRoles(actor)) return permissionDenied();

  const [accounts, roles] = await Promise.all([
    prisma.account.findMany({
      where: { status: { not: "Archived" } },
      orderBy: [{ displayName: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        displayName: true,
        status: true,
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
            currentUnitId: true,
            currentUnit: { select: { id: true, key: true, name: true } },
          },
        },
      },
    }),
    prisma.role.findMany({
      where: { status: "Active" },
      orderBy: [{ precedence: "asc" }, { name: "asc" }],
      select: { id: true, key: true, name: true, description: true, precedence: true },
    }),
  ]);

  return { ok: true, accounts, roles };
}

export async function getRoleManagementAccount(prisma, actor, accountId) {
  if (!canManageRoles(actor)) return permissionDenied();

  const account = await findManagedAccount(prisma, accountId);
  if (!account) return failure("not_found", "Account was not found.");
  return { ok: true, account };
}

export async function assignAccountRole({ prisma, actor, accountId, roleId, reason }) {
  if (!canManageRoles(actor)) return permissionDenied();

  const normalizedReason = normalizeText(reason);
  if (!normalizedReason) return failure("validation_error", "A role-change reason is required.");

  const [account, role] = await Promise.all([
    findManagedAccount(prisma, accountId),
    prisma.role.findFirst({ where: { id: normalizeText(roleId), status: "Active" } }),
  ]);
  if (!account) return failure("not_found", "Account was not found.");
  if (!role) return failure("validation_error", "Selected role is invalid.");

  const duplicate = account.roleAssignments.some((assignment) => assignment.roleId === role.id);
  if (duplicate) return failure("validation_error", "This account already has that role.");

  const scope = assignmentScope(role.key, account.personnelProfile?.currentUnitId);
  if (!scope.ok) return scope;

  await prisma.$transaction(async (tx) => {
    if (MEMBER_DEPENDENT_ROLE_KEYS.has(role.key)) {
      await ensureMemberAssignment({ tx, actor, account, reason: normalizedReason });
    }

    const assignment = await tx.roleAssignment.create({
      data: {
        accountId: account.id,
        roleId: role.id,
        ...scope.data,
        grantedByAccountId: actor.id,
        reason: normalizedReason,
      },
    });

    await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: account.id,
        module: "access",
        action: "assign-role",
        recordType: "RoleAssignment",
        recordId: assignment.id,
        newValue: {
          roleId: role.id,
          roleKey: role.key,
          ...scope.data,
        },
        reason: normalizedReason,
      },
    });
  });

  return getRoleManagementAccount(prisma, actor, account.id);
}

export async function removeAccountRole({ prisma, actor, accountId, assignmentId, reason }) {
  if (!canManageRoles(actor)) return permissionDenied();

  const normalizedReason = normalizeText(reason);
  if (!normalizedReason) return failure("validation_error", "A role-change reason is required.");

  const assignment = await prisma.roleAssignment.findFirst({
    where: {
      id: normalizeText(assignmentId),
      accountId: normalizeText(accountId),
      endsAt: null,
    },
    include: { role: true, account: true, unit: true, staffSection: true },
  });
  if (!assignment || assignment.account.status === "Archived") {
    return failure("not_found", "Active role assignment was not found.");
  }

  if (assignment.role.key === "member") {
    const dependent = await prisma.roleAssignment.findFirst({
      where: {
        accountId: assignment.accountId,
        endsAt: null,
        role: { key: { in: [...MEMBER_DEPENDENT_ROLE_KEYS] }, status: "Active" },
      },
      include: { role: true },
    });
    if (dependent) {
      return failure(
        "invalid_transition",
        `Member cannot be removed while ${dependent.role.name} is active.`,
      );
    }
  }

  if (assignment.role.key === "system-admin" && assignment.account.status === "Active") {
    const activeAdminCount = await prisma.roleAssignment.count({
      where: {
        endsAt: null,
        role: { key: "system-admin", status: "Active" },
        account: { status: "Active" },
      },
    });
    if (activeAdminCount <= 1) {
      return failure("invalid_transition", "The final active System Admin cannot be removed.");
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.roleAssignment.update({
      where: { id: assignment.id },
      data: {
        endsAt: now,
        reason: appendEndedReason(assignment.reason, normalizedReason),
      },
    });

    await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: assignment.accountId,
        module: "access",
        action: "remove-role",
        recordType: "RoleAssignment",
        recordId: assignment.id,
        oldValue: serializeAssignment(assignment),
        newValue: { endsAt: now },
        reason: normalizedReason,
      },
    });
  });

  return getRoleManagementAccount(prisma, actor, assignment.accountId);
}

export async function syncUnitScopedRoleAssignments({
  tx,
  accountId,
  nextUnitId,
  actorId,
  reason,
  now = new Date(),
}) {
  const assignments = await tx.roleAssignment.findMany({
    where: {
      accountId,
      endsAt: null,
      role: { key: { in: [...UNIT_SCOPED_ROLE_KEYS] }, status: "Active" },
    },
    include: { role: true, unit: true, staffSection: true },
  });
  const roles = new Map(assignments.map((assignment) => [assignment.roleId, assignment.role]));

  for (const assignment of assignments) {
    await tx.roleAssignment.update({
      where: { id: assignment.id },
      data: {
        endsAt: now,
        reason: appendEndedReason(
          assignment.reason,
          `Scope changed with personnel unit: ${reason}`,
        ),
      },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: actorId,
        targetAccountId: accountId,
        module: "access",
        action: "end-role-scope",
        recordType: "RoleAssignment",
        recordId: assignment.id,
        oldValue: serializeAssignment(assignment),
        newValue: { endsAt: now },
        reason,
      },
    });
  }

  if (!nextUnitId) return;

  for (const role of roles.values()) {
    const replacement = await tx.roleAssignment.create({
      data: {
        accountId,
        roleId: role.id,
        scopeType: "Unit",
        scopeIncludesDescendants: true,
        unitId: nextUnitId,
        grantedByAccountId: actorId,
        reason: `Scope followed personnel unit change: ${reason}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorAccountId: actorId,
        targetAccountId: accountId,
        module: "access",
        action: "assign-role-scope",
        recordType: "RoleAssignment",
        recordId: replacement.id,
        newValue: {
          roleId: role.id,
          roleKey: role.key,
          scopeType: "Unit",
          scopeIncludesDescendants: true,
          unitId: nextUnitId,
        },
        reason,
      },
    });
  }
}

async function ensureMemberAssignment({ tx, actor, account, reason }) {
  if (account.roleAssignments.some((assignment) => assignment.role.key === "member")) return;

  const memberRole = await tx.role.findFirst({ where: { key: "member", status: "Active" } });
  if (!memberRole) throw new Error("Active Member role is not configured.");
  const assignment = await tx.roleAssignment.create({
    data: {
      accountId: account.id,
      roleId: memberRole.id,
      scopeType: "Global",
      scopeIncludesDescendants: true,
      grantedByAccountId: actor.id,
      reason: `Automatically added with dependent role: ${reason}`,
    },
  });
  await tx.auditLog.create({
    data: {
      actorAccountId: actor.id,
      targetAccountId: account.id,
      module: "access",
      action: "assign-dependent-member-role",
      recordType: "RoleAssignment",
      recordId: assignment.id,
      newValue: { roleId: memberRole.id, roleKey: memberRole.key, scopeType: "Global" },
      reason,
    },
  });
}

function assignmentScope(roleKey, currentUnitId) {
  if (!UNIT_SCOPED_ROLE_KEYS.has(roleKey)) {
    return {
      ok: true,
      data: {
        scopeType: "Global",
        scopeIncludesDescendants: true,
        unitId: null,
        staffSectionId: null,
      },
    };
  }
  if (!currentUnitId) {
    return failure("validation_error", `${roleKey} requires a current personnel unit.`);
  }
  return {
    ok: true,
    data: {
      scopeType: "Unit",
      scopeIncludesDescendants: true,
      unitId: currentUnitId,
      staffSectionId: null,
    },
  };
}

async function findManagedAccount(prisma, accountId) {
  return prisma.account.findFirst({
    where: { id: normalizeText(accountId), status: { not: "Archived" } },
    include: {
      authIdentities: {
        where: { provider: "Discord", unlinkedAt: null },
        orderBy: { linkedAt: "asc" },
      },
      personnelProfile: { include: { currentUnit: true } },
      roleAssignments: {
        where: { endsAt: null },
        orderBy: { startsAt: "asc" },
        include: { role: true, unit: true, staffSection: true },
      },
    },
  });
}

function serializeAssignment(assignment) {
  return {
    roleId: assignment.roleId,
    roleKey: assignment.role?.key,
    scopeType: assignment.scopeType,
    scopeIncludesDescendants: assignment.scopeIncludesDescendants,
    unitId: assignment.unitId,
    staffSectionId: assignment.staffSectionId,
  };
}

function appendEndedReason(originalReason, removalReason) {
  return [normalizeText(originalReason), `Ended: ${removalReason}`].filter(Boolean).join("\n");
}

function hasPermission(account, permissionKey) {
  return (account?.roleAssignments ?? []).some(
    (assignment) =>
      !assignment.endsAt &&
      assignment.role?.status === "Active" &&
      (assignment.role.permissions ?? []).some(
        (grant) => grant.permission?.status === "Active" && grant.permission.key === permissionKey,
      ),
  );
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
