const PERSONNEL_STATUS_OPTIONS = [
  "Recruit",
  "Probationary",
  "Active",
  "Reserve",
  "LeaveOfAbsence",
  "Inactive",
  "Separated",
  "Discharged",
  "DoNotRehire",
];

export function canViewOwnPersonnel(account) {
  return account.status === "Active" && hasPermission(account, "personnel.view-self");
}

export function canViewScopedPersonnel(account) {
  return account.status === "Active" && hasPermission(account, "personnel.view-scoped");
}

export function canUpdateScopedPersonnel(account) {
  return account.status === "Active" && hasPermission(account, "personnel.update-scoped");
}

export async function getOwnPersonnelProfile(prisma, accountId) {
  return prisma.personnelProfile.findUnique({
    where: { accountId },
    include: personnelProfileInclude(),
  });
}

export async function getPersonnelProfileById(prisma, personnelProfileId) {
  return prisma.personnelProfile.findUnique({
    where: { id: personnelProfileId },
    include: personnelProfileInclude(),
  });
}

export async function listScopedPersonnel(prisma, actor, filters = {}) {
  const scope = await resolvePersonnelScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }

  const where = {};
  if (scope.unitIds) {
    where.currentUnitId = { in: scope.unitIds };
  }

  const status = normalizeOptionalText(filters.status);
  if (status) {
    if (!PERSONNEL_STATUS_OPTIONS.includes(status)) {
      return failure("validation_error", "Selected personnel status is invalid.");
    }
    where.status = status;
  }

  const unitId = normalizeOptionalText(filters.unitId);
  if (unitId) {
    if (scope.unitIds && !scope.unitIds.includes(unitId)) {
      return failure("permission_denied", "Selected unit is outside your personnel scope.");
    }
    where.currentUnitId = unitId;
  }

  const items = await prisma.personnelProfile.findMany({
    where,
    orderBy: [{ status: "asc" }, { callsign: "asc" }],
    include: rosterListInclude(),
  });

  return { ok: true, items };
}

export async function getPersonnelLookupData(prisma) {
  const [units, ranks, billets, specialties] = await Promise.all([
    prisma.unit.findMany({
      where: { status: "Active" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true, parentId: true },
    }),
    prisma.rank.findMany({
      where: { status: "Active" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.billet.findMany({
      where: { status: "Active" },
      orderBy: [{ name: "asc" }],
      select: { id: true, code: true, name: true, unitId: true },
    }),
    prisma.specialty.findMany({
      where: { status: "Active" },
      orderBy: [{ code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  return {
    units,
    ranks,
    billets,
    specialties,
    statuses: [...PERSONNEL_STATUS_OPTIONS],
  };
}

export async function getScopedUnitFilters(prisma, actor) {
  const scope = await resolvePersonnelScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }

  const allUnits = await prisma.unit.findMany({
    where: { status: "Active" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true },
  });

  const units = scope.unitIds
    ? allUnits.filter((unit) => scope.unitIds.includes(unit.id))
    : allUnits;

  return { ok: true, units };
}

export async function updatePersonnelProfile({
  prisma,
  actor,
  personnelProfileId,
  body,
}) {
  if (!canUpdateScopedPersonnel(actor)) {
    return failure("permission_denied", "Personnel update permission is required.");
  }

  const reason = normalizeOptionalText(body.reason);
  if (!reason) {
    return failure("validation_error", "An audit reason is required for personnel updates.");
  }

  const existing = await prisma.personnelProfile.findUnique({
    where: { id: personnelProfileId },
    include: personnelProfileInclude(),
  });

  if (!existing) {
    return failure("not_found", "Personnel profile was not found.");
  }

  const scope = await resolvePersonnelScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }

  if (scope.unitIds && existing.currentUnitId && !scope.unitIds.includes(existing.currentUnitId)) {
    return failure("permission_denied", "This personnel profile is outside your update scope.");
  }

  const nextName = normalizeOptionalText(body.name);
  if (!nextName) {
    return failure("validation_error", "Name is required.");
  }

  const nextStatus = normalizeOptionalText(body.status);
  if (!PERSONNEL_STATUS_OPTIONS.includes(nextStatus)) {
    return failure("validation_error", "Selected personnel status is invalid.");
  }

  const nextUnitId = normalizeNullableForeignKey(body.currentUnitId);
  const nextRankId = normalizeNullableForeignKey(body.currentRankId);
  const nextBilletId = normalizeNullableForeignKey(body.currentBilletId);
  const nextSpecialtyId = normalizeNullableForeignKey(body.currentSpecialtyId);
  const nextGoodStanding = parseBooleanLike(body.goodStanding);

  if (nextGoodStanding === null) {
    return failure("validation_error", "Good standing selection is required.");
  }

  const [nextUnit, nextRank, nextBillet, nextSpecialty] = await Promise.all([
    fetchActiveUnit(prisma, nextUnitId),
    fetchActiveRank(prisma, nextRankId),
    fetchActiveBillet(prisma, nextBilletId),
    fetchActiveSpecialty(prisma, nextSpecialtyId),
  ]);

  if (nextUnitId && !nextUnit) {
    return failure("validation_error", "Selected unit is invalid.");
  }
  if (nextRankId && !nextRank) {
    return failure("validation_error", "Selected rank is invalid.");
  }
  if (nextBilletId && !nextBillet) {
    return failure("validation_error", "Selected billet is invalid.");
  }
  if (nextSpecialtyId && !nextSpecialty) {
    return failure("validation_error", "Selected specialty is invalid.");
  }

  if (scope.unitIds && nextUnitId && !scope.unitIds.includes(nextUnitId)) {
    return failure("permission_denied", "Selected unit is outside your update scope.");
  }

  if (nextBillet && nextBillet.unitId && nextUnitId !== nextBillet.unitId) {
    return failure("validation_error", "Selected billet does not belong to the selected unit.");
  }

  const oldValue = serializePersonnelProfile(existing);
  const newValue = {
    name: nextName,
    status: nextStatus,
    currentUnitId: nextUnitId,
    currentRankId: nextRankId,
    currentBilletId: nextBilletId,
    currentSpecialtyId: nextSpecialtyId,
    goodStanding: nextGoodStanding,
  };

  const changed =
    existing.callsign !== nextName ||
    existing.status !== nextStatus ||
    existing.currentUnitId !== nextUnitId ||
    existing.currentRankId !== nextRankId ||
    existing.currentBilletId !== nextBilletId ||
    existing.currentSpecialtyId !== nextSpecialtyId ||
    existing.goodStanding !== nextGoodStanding;

  if (!changed) {
    return failure("validation_error", "No personnel changes were submitted.");
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const audit = await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: existing.accountId,
        targetPersonnelProfileId: existing.id,
        module: "personnel",
        action: "update-profile",
        recordType: "PersonnelProfile",
        recordId: existing.id,
        oldValue,
        newValue,
        reason,
      },
    });

    if (existing.status !== nextStatus) {
      await tx.personnelStatusHistory.create({
        data: {
          personnelProfileId: existing.id,
          oldStatus: existing.status,
          newStatus: nextStatus,
          effectiveAt: now,
          changedByAccountId: actor.id,
          reason,
          auditLogId: audit.id,
        },
      });
    }

    await syncAssignmentHistory({
      tx,
      modelName: "personnelRankHistory",
      personnelProfileId: existing.id,
      currentId: existing.currentRankId,
      nextId: nextRankId,
      relationField: "rankId",
      actorId: actor.id,
      reason,
      auditLogId: audit.id,
      now,
      assignmentType: null,
    });

    await syncAssignmentHistory({
      tx,
      modelName: "personnelUnitAssignment",
      personnelProfileId: existing.id,
      currentId: existing.currentUnitId,
      nextId: nextUnitId,
      relationField: "unitId",
      actorId: actor.id,
      reason,
      auditLogId: audit.id,
      now,
      assignmentType: "Primary",
    });

    await syncAssignmentHistory({
      tx,
      modelName: "personnelBilletAssignment",
      personnelProfileId: existing.id,
      currentId: existing.currentBilletId,
      nextId: nextBilletId,
      relationField: "billetId",
      actorId: actor.id,
      reason,
      auditLogId: audit.id,
      now,
      assignmentType: "Primary",
    });

    await syncAssignmentHistory({
      tx,
      modelName: "personnelSpecialtyHistory",
      personnelProfileId: existing.id,
      currentId: existing.currentSpecialtyId,
      nextId: nextSpecialtyId,
      relationField: "specialtyId",
      actorId: actor.id,
      reason,
      auditLogId: audit.id,
      now,
      assignmentType: null,
    });

    if (existing.goodStanding !== nextGoodStanding) {
      await tx.personnelStandingHistory.create({
        data: {
          personnelProfileId: existing.id,
          oldGoodStanding: existing.goodStanding,
          newGoodStanding: nextGoodStanding,
          effectiveAt: now,
          changedByAccountId: actor.id,
          reason,
          auditLogId: audit.id,
        },
      });
    }

    await tx.personnelProfile.update({
      where: { id: existing.id },
      data: {
        callsign: nextName,
        status: nextStatus,
        currentUnitId: nextUnitId,
        currentRankId: nextRankId,
        currentBilletId: nextBilletId,
        currentSpecialtyId: nextSpecialtyId,
        goodStanding: nextGoodStanding,
      },
    });

    return tx.personnelProfile.findUnique({
      where: { id: existing.id },
      include: personnelProfileInclude(),
    });
  });

  return { ok: true, profile: updated };
}

function rosterListInclude() {
  return {
    account: {
      include: {
        authIdentities: true,
      },
    },
    currentRank: true,
    currentUnit: true,
    currentBillet: true,
    currentSpecialty: true,
  };
}

function personnelProfileInclude() {
  return {
    account: {
      include: {
        authIdentities: true,
      },
    },
    currentRank: true,
    currentUnit: true,
    currentBillet: true,
    currentSpecialty: true,
    statusHistory: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
    },
    rankHistory: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
      include: { rank: true },
    },
    unitAssignments: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
      include: { unit: true },
    },
    billetAssignments: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
      include: { billet: true },
    },
    specialtyHistory: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
      include: { specialty: true },
    },
    standingHistory: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
    },
  };
}

async function resolvePersonnelScope(prisma, actor) {
  if (hasGlobalScope(actor)) {
    return { ok: true, unitIds: null };
  }

  const assignments = (actor.roleAssignments ?? []).filter(
    (assignment) => !assignment.endsAt && assignment.unitId,
  );

  if (!assignments.length) {
    return failure("permission_denied", "No personnel scope is assigned to this account.");
  }

  const units = await prisma.unit.findMany({
    select: { id: true, parentId: true },
  });
  const descendantMap = buildDescendantMap(units);
  const scopedUnitIds = new Set();

  for (const assignment of assignments) {
    scopedUnitIds.add(assignment.unitId);
    if (assignment.scopeIncludesDescendants) {
      for (const descendantId of descendantMap.get(assignment.unitId) ?? []) {
        scopedUnitIds.add(descendantId);
      }
    }
  }

  return { ok: true, unitIds: [...scopedUnitIds] };
}

function hasGlobalScope(actor) {
  return (actor.roleAssignments ?? []).some(
    (assignment) => !assignment.endsAt && assignment.scopeType === "Global",
  );
}

function buildDescendantMap(units) {
  const childrenByParentId = new Map();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const children = childrenByParentId.get(unit.parentId) ?? [];
    children.push(unit.id);
    childrenByParentId.set(unit.parentId, children);
  }

  const descendantMap = new Map();
  for (const unit of units) {
    descendantMap.set(unit.id, collectDescendants(unit.id, childrenByParentId));
  }

  return descendantMap;
}

function collectDescendants(unitId, childrenByParentId) {
  const descendants = [];
  const stack = [...(childrenByParentId.get(unitId) ?? [])];
  while (stack.length) {
    const childId = stack.pop();
    descendants.push(childId);
    stack.push(...(childrenByParentId.get(childId) ?? []));
  }
  return descendants;
}

async function fetchActiveUnit(prisma, id) {
  if (!id) return null;
  return prisma.unit.findFirst({
    where: { id, status: "Active" },
    select: { id: true },
  });
}

async function fetchActiveRank(prisma, id) {
  if (!id) return null;
  return prisma.rank.findFirst({
    where: { id, status: "Active" },
    select: { id: true },
  });
}

async function fetchActiveBillet(prisma, id) {
  if (!id) return null;
  return prisma.billet.findFirst({
    where: { id, status: "Active" },
    select: { id: true, unitId: true },
  });
}

async function fetchActiveSpecialty(prisma, id) {
  if (!id) return null;
  return prisma.specialty.findFirst({
    where: { id, status: "Active" },
    select: { id: true },
  });
}

async function syncAssignmentHistory({
  tx,
  modelName,
  personnelProfileId,
  currentId,
  nextId,
  relationField,
  actorId,
  reason,
  auditLogId,
  now,
  assignmentType,
}) {
  if (currentId === nextId) {
    return;
  }

  await tx[modelName].updateMany({
    where: {
      personnelProfileId,
      endedAt: null,
    },
    data: {
      endedAt: now,
    },
  });

  if (!nextId) {
    return;
  }

  await tx[modelName].create({
    data: {
      personnelProfileId,
      [relationField]: nextId,
      effectiveAt: now,
      changedByAccountId: actorId,
      reason,
      auditLogId,
      ...(assignmentType ? { assignmentType } : {}),
    },
  });
}

function serializePersonnelProfile(profile) {
  return {
    name: profile.callsign,
    status: profile.status,
    currentUnitId: profile.currentUnitId,
    currentRankId: profile.currentRankId,
    currentBilletId: profile.currentBilletId,
    currentSpecialtyId: profile.currentSpecialtyId,
    goodStanding: profile.goodStanding,
  };
}

function normalizeOptionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableForeignKey(value) {
  const normalized = normalizeOptionalText(value);
  return normalized || null;
}

function parseBooleanLike(value) {
  if (value === true || value === "true" || value === "1" || value === 1 || value === "on") {
    return true;
  }
  if (value === false || value === "false" || value === "0" || value === 0) {
    return false;
  }
  return null;
}

function hasPermission(account, permissionKey) {
  return (account.roleAssignments ?? []).some((assignment) =>
    !assignment.endsAt &&
    (assignment.role?.permissions ?? []).some((grant) => grant.permission?.key === permissionKey),
  );
}

function failure(code, message) {
  return { ok: false, code, message };
}
