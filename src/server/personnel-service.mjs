import { syncUnitScopedRoleAssignments } from "./role-management-service.mjs";
import { loadLiveRecruitingOpenings } from "./recruiting-openings.mjs";

const PERSONNEL_STATUS_OPTIONS = [
  "Applicant",
  "Recruit",
  "Active",
  "Reserve",
  "LeaveOfAbsence",
  "ExtendedLeaveOfAbsence",
  "AWOL",
  "HonorableDischarge",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
];
const DISCHARGED_PERSONNEL_STATUSES = new Set([
  "HonorableDischarge",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
]);
const RESTRICTED_STANDING_STATUSES = new Set([
  "AWOL",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
]);

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
  const profile = await prisma.personnelProfile.findUnique({
    where: { accountId },
    include: personnelProfileInclude(),
  });
  return applyDerivedStanding(profile);
}

export async function getPersonnelProfileById(prisma, personnelProfileId) {
  const profile = await prisma.personnelProfile.findUnique({
    where: { id: personnelProfileId },
    include: personnelProfileInclude(),
  });
  return applyDerivedStanding(profile);
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
  if (!status) {
    where.status = {
      notIn: [...DISCHARGED_PERSONNEL_STATUSES],
    };
  }
  if (status) {
    if (!PERSONNEL_STATUS_OPTIONS.includes(status)) {
      return failure("validation_error", "Selected personnel status is invalid.");
    }
    if (DISCHARGED_PERSONNEL_STATUSES.has(status)) {
      return { ok: true, items: [] };
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
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: rosterListInclude(),
  });

  return { ok: true, items: items.map(applyDerivedStanding) };
}

export async function getPersonnelLookupData(prisma) {
  const [units, ranks, billets, mos] = await Promise.all([
    prisma.unit.findMany({
      where: { status: "Active" },
      orderBy: [{ hierarchyBase: "desc" }, { name: "asc" }],
      select: { id: true, key: true, name: true, parentId: true },
    }),
    prisma.rank.findMany({
      where: { status: "Active" },
      orderBy: [{ precedence: "desc" }, { name: "asc" }],
      select: { id: true, key: true, abbreviation: true, name: true, precedence: true },
    }),
    prisma.billet.findMany({
      where: { status: "Active" },
      orderBy: [{ commandPrecedence: "desc" }, { name: "asc" }],
      select: { id: true, key: true, name: true, unitId: true, commandPrecedence: true },
    }),
    prisma.mOS.findMany({
      where: { status: "Active" },
      orderBy: [{ identifier: "asc" }, { name: "asc" }],
      select: { id: true, key: true, identifier: true, name: true },
    }),
  ]);

  return {
    units,
    ranks,
    billets,
    mos,
    statuses: [...PERSONNEL_STATUS_OPTIONS],
  };
}

export async function getPersonnelEditOptions(prisma, actor) {
  const [lookups, unitResult] = await Promise.all([
    getPersonnelLookupData(prisma),
    getScopedUnitFilters(prisma, actor),
  ]);

  if (!unitResult.ok) {
    return unitResult;
  }

  return {
    ok: true,
    options: {
      ...lookups,
      units: unitResult.units,
    },
  };
}

export async function getScopedUnitFilters(prisma, actor) {
  const scope = await resolvePersonnelScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }

  const allUnits = await prisma.unit.findMany({
    where: { status: "Active" },
    orderBy: [{ hierarchyBase: "desc" }, { name: "asc" }],
    select: { id: true, key: true, name: true },
  });

  const units = scope.unitIds
    ? allUnits.filter((unit) => scope.unitIds.includes(unit.id))
    : allUnits;

  return { ok: true, units };
}

export async function getStaffUnitOverview(prisma, actor, selectedUnitId = "") {
  if (!canViewScopedPersonnel(actor)) {
    return failure("permission_denied", "Scoped personnel view is required.");
  }

  const unitScope = await resolveStaffUnitTreeScope(prisma, actor);
  if (!unitScope.ok) {
    return unitScope;
  }

  const normalizedUnitId = normalizeOptionalText(selectedUnitId);
  const rootOptions = unitScope.rootUnits.map((unit) => ({
    id: unit.id,
    key: unit.key,
    name: unit.name,
    type: unit.type,
    hierarchyBase: unit.hierarchyBase,
  }));

  const selectedRoot =
    (normalizedUnitId
      ? unitScope.rootUnits.find((unit) => unit.id === normalizedUnitId)
      : unitScope.rootUnits[0]) ?? null;

  if (normalizedUnitId && !selectedRoot) {
    return failure("permission_denied", "Selected unit is outside your staff unit scope.");
  }

  if (!selectedRoot) {
    return {
      ok: true,
      data: {
        roots: [],
        selectedUnit: null,
        rosterGroups: [],
        strengthRows: [],
        permissions: { canEdit: false },
      },
    };
  }

  const treeUnitIds = new Set([
    selectedRoot.id,
    ...(unitScope.descendantMap.get(selectedRoot.id) ?? []),
  ]);
  const orderedUnits = orderUnitTree(
    selectedRoot.id,
    unitScope.unitsById,
    unitScope.childrenByParentId,
  );
  const [rosterItems, strengthRows] = await Promise.all([
    prisma.personnelProfile.findMany({
      where: {
        currentUnitId: { in: [...treeUnitIds] },
        status: { notIn: [...DISCHARGED_PERSONNEL_STATUSES] },
      },
      include: rosterListInclude(),
    }),
    buildUnitStrengthRows(prisma, selectedRoot.id, treeUnitIds),
  ]);

  const membersByUnitId = new Map();
  for (const item of rosterItems.map(applyDerivedStanding)) {
    const groupUnitId = resolveRosterGroupUnitId(
      item.currentUnitId,
      unitScope.unitsById,
      selectedRoot.id,
    );
    const members = membersByUnitId.get(groupUnitId) ?? [];
    members.push({
      ...item,
      teamLabel: deriveRosterTeamLabel(item.currentUnit),
    });
    membersByUnitId.set(groupUnitId, members);
  }

  const rosterGroups = orderedUnits
    .filter((unit) => unit.hierarchyBase >= 3000)
    .map((unit) => ({
      unit: {
        id: unit.id,
        key: unit.key,
        name: unit.name,
        type: unit.type,
        hierarchyBase: unit.hierarchyBase,
        depth: unit.depth,
      },
      members: sortUnitRosterMembers(membersByUnitId.get(unit.id) ?? []),
    }))
    .filter((group) => group.members.length > 0);

  return {
    ok: true,
    data: {
      roots: rootOptions,
      selectedUnit: {
        id: selectedRoot.id,
        key: selectedRoot.key,
        name: selectedRoot.name,
        type: selectedRoot.type,
        hierarchyBase: selectedRoot.hierarchyBase,
      },
      rosterGroups,
      strengthRows,
      permissions: {
        canEdit: canUpdateScopedPersonnel(actor) && unitScope.editableRootIds.has(selectedRoot.id),
      },
    },
  };
}

export async function updateUnitMOSSlots({ prisma, actor, unitId, mosId, authorizedSlots }) {
  if (!canUpdateScopedPersonnel(actor)) {
    return failure("permission_denied", "Scoped personnel update is required.");
  }

  const normalizedUnitId = normalizeOptionalText(unitId);
  const normalizedMosId = normalizeOptionalText(mosId);
  if (!normalizedUnitId || !normalizedMosId) {
    return failure("validation_error", "Unit and MOS are required.");
  }

  const parsedSlots =
    typeof authorizedSlots === "number"
      ? authorizedSlots
      : Number.parseInt(String(authorizedSlots), 10);
  if (!Number.isInteger(parsedSlots) || parsedSlots < 0) {
    return failure("validation_error", "Authorized slots must be a non-negative integer.");
  }

  const unitScope = await resolveStaffUnitTreeScope(prisma, actor);
  if (!unitScope.ok) {
    return unitScope;
  }
  if (!unitScope.editableRootIds.has(normalizedUnitId)) {
    return failure("permission_denied", "Selected unit is outside your editable scope.");
  }

  const mos = await prisma.mOS.findFirst({
    where: {
      id: normalizedMosId,
      unitId: normalizedUnitId,
      status: "Active",
    },
    select: {
      id: true,
      identifier: true,
      name: true,
      authorizedSlots: true,
      unit: { select: { id: true, key: true, name: true } },
    },
  });
  if (!mos) {
    return failure("validation_error", "Selected MOS does not belong to the selected unit.");
  }

  const updated = await prisma.mOS.update({
    where: { id: mos.id },
    data: { authorizedSlots: parsedSlots },
    select: {
      id: true,
      key: true,
      identifier: true,
      name: true,
      authorizedSlots: true,
      unitId: true,
    },
  });

  return { ok: true, row: updated };
}

export async function listPublicUnitOpenings(prisma) {
  const openings = await loadLiveRecruitingOpenings(prisma);
  return { ok: true, items: openings.groups };
}

export async function updatePersonnelProfile({ prisma, actor, personnelProfileId, body }) {
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
  const nextMOSId = normalizeNullableForeignKey(body.currentMOSId);
  const nextSecondaryMOSId = normalizeNullableForeignKey(body.currentSecondaryMOSId);
  const nextGoodStanding = deriveGoodStanding(nextStatus);

  const [nextUnit, nextRank, nextBillet, nextMOS, nextSecondaryMOS] = await Promise.all([
    fetchActiveUnit(prisma, nextUnitId),
    fetchActiveRank(prisma, nextRankId),
    fetchActiveBillet(prisma, nextBilletId),
    fetchActiveMOS(prisma, nextMOSId),
    fetchActiveMOS(prisma, nextSecondaryMOSId),
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
  if (nextMOSId && !nextMOS) {
    return failure("validation_error", "Selected MOS is invalid.");
  }
  if (nextSecondaryMOSId && !nextSecondaryMOS) {
    return failure("validation_error", "Selected secondary MOS is invalid.");
  }

  if (scope.unitIds && nextUnitId && !scope.unitIds.includes(nextUnitId)) {
    return failure("permission_denied", "Selected unit is outside your update scope.");
  }

  if (
    nextBillet &&
    nextBillet.unitId &&
    !(await unitOwnsOrContainsAssignment(prisma, nextBillet.unitId, nextUnitId))
  ) {
    return failure("validation_error", "Selected billet does not belong to the selected unit.");
  }

  if (
    nextBillet?.minimumRank &&
    (!nextRank || nextRank.precedence < nextBillet.minimumRank.precedence)
  ) {
    return failure(
      "validation_error",
      `Selected billet requires rank ${nextBillet.minimumRank.name}.`,
    );
  }

  const oldValue = serializePersonnelProfile(existing);
  const newValue = {
    name: nextName,
    status: nextStatus,
    currentUnitId: nextUnitId,
    currentRankId: nextRankId,
    currentBilletId: nextBilletId,
    currentMOSId: nextMOSId,
    currentSecondaryMOSId: nextSecondaryMOSId,
    goodStanding: nextGoodStanding,
  };

  const changed =
    existing.name !== nextName ||
    existing.status !== nextStatus ||
    existing.currentUnitId !== nextUnitId ||
    existing.currentRankId !== nextRankId ||
    existing.currentBilletId !== nextBilletId ||
    existing.currentMOSId !== nextMOSId ||
    existing.currentSecondaryMOSId !== nextSecondaryMOSId ||
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

    if (existing.currentUnitId !== nextUnitId) {
      await syncUnitScopedRoleAssignments({
        tx,
        accountId: existing.accountId,
        nextUnitId,
        actorId: actor.id,
        reason,
        now,
      });
    }

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
      modelName: "personnelMOSHistory",
      personnelProfileId: existing.id,
      currentId: existing.currentMOSId,
      nextId: nextMOSId,
      relationField: "mosId",
      actorId: actor.id,
      reason,
      auditLogId: audit.id,
      now,
      assignmentType: "Primary",
    });

    await syncAssignmentHistory({
      tx,
      modelName: "personnelMOSHistory",
      personnelProfileId: existing.id,
      currentId: existing.currentSecondaryMOSId,
      nextId: nextSecondaryMOSId,
      relationField: "mosId",
      actorId: actor.id,
      reason,
      auditLogId: audit.id,
      now,
      assignmentType: "Secondary",
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
        name: nextName,
        status: nextStatus,
        currentUnitId: nextUnitId,
        currentRankId: nextRankId,
        currentBilletId: nextBilletId,
        currentMOSId: nextMOSId,
        currentSecondaryMOSId: nextSecondaryMOSId,
        goodStanding: nextGoodStanding,
      },
    });

    const profile = await tx.personnelProfile.findUnique({
      where: { id: existing.id },
      include: personnelProfileInclude(),
    });
    return applyDerivedStanding(profile);
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
    currentMOS: true,
    currentSecondaryMOS: true,
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
    currentUnit: {
      include: {
        parent: unitParentInclude(),
      },
    },
    currentBillet: true,
    currentMOS: true,
    currentSecondaryMOS: true,
    qualifications: {
      where: { status: "Active" },
      orderBy: [{ grantedAt: "desc" }, { qualificationId: "asc" }],
      include: { qualification: true },
    },
    awardRecords: {
      orderBy: { awardedAt: "desc" },
      include: { award: true },
    },
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
    mosHistory: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
      include: { mos: true },
    },
    standingHistory: {
      orderBy: { effectiveAt: "desc" },
      take: 10,
    },
  };
}

function unitParentInclude(depth = 5) {
  if (depth <= 0) {
    return true;
  }

  return {
    include: {
      parent: unitParentInclude(depth - 1),
    },
  };
}

async function resolvePersonnelScope(prisma, actor) {
  if (!canViewScopedPersonnel(actor)) {
    return failure("permission_denied", "Scoped personnel view is required.");
  }

  if (hasGlobalScope(actor)) {
    return { ok: true, unitIds: null };
  }

  const assignments = (actor.roleAssignments ?? []).filter(
    (assignment) =>
      isActiveRoleAssignment(assignment) &&
      assignment.unitId &&
      grantsPersonnelScope(assignment.role),
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

async function resolveStaffUnitTreeScope(prisma, actor) {
  if (!canViewScopedPersonnel(actor)) {
    return failure("permission_denied", "Scoped personnel view is required.");
  }

  const units = await prisma.unit.findMany({
    where: { status: "Active" },
    orderBy: [{ hierarchyBase: "desc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      type: true,
      parentId: true,
      hierarchyBase: true,
    },
  });
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const childrenByParentId = buildChildrenByParentId(units);
  const descendantMap = buildDescendantMap(units);

  let rootIds;
  if (hasGlobalScope(actor)) {
    rootIds = units.filter((unit) => unit.hierarchyBase === 7000).map((unit) => unit.id);
  } else {
    const assignments = (actor.roleAssignments ?? []).filter(
      (assignment) =>
        isActiveRoleAssignment(assignment) &&
        assignment.unitId &&
        grantsPersonnelScope(assignment.role),
    );

    if (!assignments.length) {
      return failure("permission_denied", "No staff unit scope is assigned to this account.");
    }

    rootIds = assignments
      .map((assignment) => findNearestHierarchyRootId(assignment.unitId, unitsById))
      .filter(Boolean);
  }

  const uniqueRootIds = [...new Set(rootIds)];
  const rootUnits = uniqueRootIds
    .map((id) => unitsById.get(id))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));

  if (!rootUnits.length) {
    return failure("permission_denied", "No staff unit root is available for this account.");
  }

  return {
    ok: true,
    unitsById,
    childrenByParentId,
    descendantMap,
    rootUnits,
    editableRootIds: new Set(
      canUpdateScopedPersonnel(actor) ? rootUnits.map((unit) => unit.id) : [],
    ),
  };
}

function hasGlobalScope(actor) {
  return (actor.roleAssignments ?? []).some(
    (assignment) =>
      isActiveRoleAssignment(assignment) &&
      assignment.scopeType === "Global" &&
      grantsPersonnelScope(assignment.role),
  );
}

function buildDescendantMap(units) {
  const childrenByParentId = buildChildrenByParentId(units);
  const descendantMap = new Map();
  for (const unit of units) {
    descendantMap.set(unit.id, collectDescendants(unit.id, childrenByParentId));
  }

  return descendantMap;
}

function buildChildrenByParentId(units) {
  const childrenByParentId = new Map();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const children = childrenByParentId.get(unit.parentId) ?? [];
    children.push(unit);
    childrenByParentId.set(unit.parentId, children);
  }
  for (const children of childrenByParentId.values()) {
    children.sort((left, right) =>
      String(left.name ?? left.id).localeCompare(String(right.name ?? right.id)),
    );
  }
  return childrenByParentId;
}

function resolveRosterGroupUnitId(unitId, unitsById, fallbackUnitId) {
  let current = unitsById.get(unitId);
  while (current) {
    if (current.hierarchyBase >= 3000) {
      return current.id;
    }
    current = current.parentId ? unitsById.get(current.parentId) : null;
  }
  return fallbackUnitId;
}

function deriveRosterTeamLabel(unit) {
  if (!unit || unit.hierarchyBase !== 1000) {
    return "";
  }

  const firstSegment = String(unit.name ?? "")
    .split(",")[0]
    .trim();
  const nameMatch = /^([A-Z])(?:\b|[^A-Za-z])/.exec(firstSegment);
  if (nameMatch?.[1]) {
    return nameMatch[1].toUpperCase();
  }

  const keyMatch = /_([ab])t$/i.exec(String(unit.key ?? ""));
  return keyMatch?.[1]?.toUpperCase() ?? "";
}

function comparePersonnelNamesByLastName(leftName, rightName) {
  const left = personNameSortParts(leftName);
  const right = personNameSortParts(rightName);
  return (
    left.last.localeCompare(right.last) ||
    left.first.localeCompare(right.first) ||
    left.full.localeCompare(right.full)
  );
}

function personNameSortParts(fullName) {
  const tokens = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) {
    return { last: "", first: "", full: "" };
  }

  return {
    last: tokens.at(-1)?.toLowerCase() ?? "",
    first: tokens[0]?.toLowerCase() ?? "",
    full: tokens.join(" ").toLowerCase(),
  };
}

function sortUnitRosterMembers(items) {
  return [...items].sort((left, right) => {
    return (
      (right.currentBillet?.commandPrecedence ?? -1) -
        (left.currentBillet?.commandPrecedence ?? -1) ||
      (right.currentRank?.precedence ?? -1) - (left.currentRank?.precedence ?? -1) ||
      comparePersonnelNamesByLastName(left.name, right.name)
    );
  });
}

function collectDescendants(unitId, childrenByParentId) {
  const descendants = [];
  const stack = [...(childrenByParentId.get(unitId) ?? [])];
  while (stack.length) {
    const child = stack.pop();
    descendants.push(child.id);
    stack.push(...(childrenByParentId.get(child.id) ?? []));
  }
  return descendants;
}

async function buildUnitStrengthRows(prisma, rootUnitId, treeUnitIds) {
  const [mosRows, assignedProfiles] = await Promise.all([
    prisma.mOS.findMany({
      where: {
        unitId: rootUnitId,
        status: "Active",
      },
      orderBy: [{ identifier: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        identifier: true,
        name: true,
        authorizedSlots: true,
        unitId: true,
      },
    }),
    prisma.personnelProfile.findMany({
      where: {
        currentUnitId: { in: [...treeUnitIds] },
        status: { notIn: [...DISCHARGED_PERSONNEL_STATUSES] },
        currentMOSId: { not: null },
      },
      select: {
        currentMOSId: true,
      },
    }),
  ]);

  const assignedCounts = new Map();
  for (const profile of assignedProfiles) {
    assignedCounts.set(profile.currentMOSId, (assignedCounts.get(profile.currentMOSId) ?? 0) + 1);
  }

  return mosRows.map((row) => ({
    ...row,
    assigned: assignedCounts.get(row.id) ?? 0,
  }));
}

function orderUnitTree(rootUnitId, unitsById, childrenByParentId, depth = 0) {
  const root = unitsById.get(rootUnitId);
  if (!root) {
    return [];
  }

  const ordered = [{ ...root, depth }];
  for (const child of childrenByParentId.get(rootUnitId) ?? []) {
    ordered.push(...orderUnitTree(child.id, unitsById, childrenByParentId, depth + 1));
  }
  return ordered;
}

function findNearestHierarchyRootId(unitId, unitsById) {
  let current = unitsById.get(unitId);
  let fallback = current?.id ?? null;

  while (current) {
    if (current.hierarchyBase === 7000) {
      return current.id;
    }
    fallback = current.id;
    current = current.parentId ? unitsById.get(current.parentId) : null;
  }

  return fallback;
}

async function fetchActiveUnit(prisma, id) {
  if (!id) return null;
  return prisma.unit.findFirst({
    where: { id, status: "Active" },
    select: { id: true, parentId: true },
  });
}

async function fetchActiveRank(prisma, id) {
  if (!id) return null;
  return prisma.rank.findFirst({
    where: { id, status: "Active" },
    select: { id: true, key: true, name: true, precedence: true },
  });
}

async function fetchActiveBillet(prisma, id) {
  if (!id) return null;
  return prisma.billet.findFirst({
    where: { id, status: "Active" },
    select: {
      id: true,
      unitId: true,
      minimumRank: {
        select: { id: true, key: true, name: true, precedence: true },
      },
    },
  });
}

async function fetchActiveMOS(prisma, id) {
  if (!id) return null;
  return prisma.mOS.findFirst({
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
      ...(assignmentType ? { assignmentType } : {}),
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
    name: profile.name,
    status: profile.status,
    currentUnitId: profile.currentUnitId,
    currentRankId: profile.currentRankId,
    currentBilletId: profile.currentBilletId,
    currentMOSId: profile.currentMOSId,
    currentSecondaryMOSId: profile.currentSecondaryMOSId,
    goodStanding: profile.goodStanding,
  };
}

function applyDerivedStanding(profile) {
  if (!profile) {
    return profile;
  }

  return {
    ...profile,
    goodStanding: deriveGoodStanding(profile.status),
  };
}

function deriveGoodStanding(status) {
  return !RESTRICTED_STANDING_STATUSES.has(status);
}

async function unitOwnsOrContainsAssignment(prisma, ownerUnitId, assignedUnitId) {
  if (!ownerUnitId || !assignedUnitId) {
    return false;
  }

  if (ownerUnitId === assignedUnitId) {
    return true;
  }

  const units = await prisma.unit.findMany({
    select: { id: true, parentId: true },
  });
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  let current = unitsById.get(assignedUnitId);

  while (current?.parentId) {
    if (current.parentId === ownerUnitId) {
      return true;
    }
    current = unitsById.get(current.parentId);
  }

  return false;
}

function normalizeOptionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableForeignKey(value) {
  const normalized = normalizeOptionalText(value);
  return normalized || null;
}

function hasPermission(account, permissionKey) {
  return (account.roleAssignments ?? []).some(
    (assignment) =>
      isActiveRoleAssignment(assignment) &&
      (assignment.role?.permissions ?? []).some(
        (grant) => grant.permission?.status === "Active" && grant.permission?.key === permissionKey,
      ),
  );
}

function isActiveRoleAssignment(assignment) {
  return !assignment.endsAt && assignment.role?.status === "Active";
}

function grantsPersonnelScope(role) {
  return (role?.permissions ?? []).some(
    (grant) =>
      grant.permission?.status === "Active" &&
      ["personnel.view-scoped", "personnel.update-scoped"].includes(grant.permission?.key),
  );
}

function failure(code, message) {
  return { ok: false, code, message };
}
