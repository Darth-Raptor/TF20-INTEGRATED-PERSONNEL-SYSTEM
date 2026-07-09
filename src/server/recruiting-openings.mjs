const DISCHARGED_PERSONNEL_STATUSES = [
  "HonorableDischarge",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
];

export function deriveRecruitingBilletOpeningRows({
  rootUnits,
  allUnits,
  billetOpenings,
  activeBillets,
  assignedProfiles,
}) {
  const descendantMap = buildDescendantMap(allUnits);
  const rootTreeUnitIds = new Map(
    rootUnits.map((unit) => [unit.id, new Set([unit.id, ...(descendantMap.get(unit.id) ?? [])])]),
  );
  const rootIdByUnitId = new Map();
  for (const [rootUnitId, unitIds] of rootTreeUnitIds.entries()) {
    for (const unitId of unitIds) {
      rootIdByUnitId.set(unitId, rootUnitId);
    }
  }

  const activeBilletNamesByRootId = new Map();
  for (const billet of activeBillets) {
    if (!billet.unitId || !billet.name) continue;
    const rootUnitId = rootIdByUnitId.get(billet.unitId);
    if (!rootUnitId) continue;
    const names = activeBilletNamesByRootId.get(rootUnitId) ?? new Set();
    names.add(billet.name);
    activeBilletNamesByRootId.set(rootUnitId, names);
  }

  const openingsByKey = new Map(
    billetOpenings.map((row) => [openingKey(row.rootUnitId, row.billetName), row]),
  );
  const assignedCounts = new Map();

  for (const profile of assignedProfiles) {
    const rootUnitId = rootIdByUnitId.get(profile.currentUnitId);
    const billetName = profile.currentBillet?.name ?? "";
    if (!rootUnitId || !billetName) continue;

    const opening = openingsByKey.get(openingKey(rootUnitId, billetName));
    if (!opening) continue;
    assignedCounts.set(opening.id, (assignedCounts.get(opening.id) ?? 0) + 1);
  }

  const rows = billetOpenings
    .filter((row) => activeBilletNamesByRootId.get(row.rootUnitId)?.has(row.billetName))
    .map((row) => ({
      ...row,
      assigned: assignedCounts.get(row.id) ?? 0,
      isOpen: row.authorizedSlots > (assignedCounts.get(row.id) ?? 0),
    }))
    .sort(compareBilletRows);

  return {
    rows,
    assignedCounts,
  };
}

export function deriveLiveRecruitingBilletOpenings(source) {
  const derived = deriveRecruitingBilletOpeningRows(source);
  const billets = derived.rows.filter((row) => row.isOpen);
  const unitIdsWithOpenings = new Set(billets.map((row) => row.rootUnitId));
  const units = source.rootUnits
    .filter((unit) => unitIdsWithOpenings.has(unit.id))
    .sort(compareUnitsForOptions);

  return {
    units,
    billets,
    groups: units.map((unit) => ({
      unit: {
        id: unit.id,
        key: unit.key,
        name: unit.name,
      },
      billets: billets
        .filter((row) => row.rootUnitId === unit.id)
        .map((row) => ({
          id: row.id,
          billetName: row.billetName,
        })),
    })),
    assignedCounts: derived.assignedCounts,
  };
}

export async function loadRecruitingBilletOpenings(prisma) {
  const source = await loadRecruitingBilletOpeningSource(prisma);
  const derived = deriveRecruitingBilletOpeningRows(source);
  return {
    rootUnits: source.rootUnits,
    rows: derived.rows,
    assignedCounts: derived.assignedCounts,
  };
}

export async function loadLiveRecruitingBilletOpenings(prisma) {
  const source = await loadRecruitingBilletOpeningSource(prisma);
  return deriveLiveRecruitingBilletOpenings(source);
}

export function buildApplicantOpeningsOptions({
  openings,
  selectedUnits = [],
  selectedBillets = [],
}) {
  const openUnitsById = new Map(openings.units.map((unit) => [unit.id, unit]));
  const openBilletsById = new Map(openings.billets.map((row) => [row.id, row]));

  const units = [
    ...openings.units.map((unit) => ({
      id: unit.id,
      key: unit.key,
      name: unit.name,
      type: unit.type,
      hierarchyBase: unit.hierarchyBase,
      isStale: false,
    })),
    ...selectedUnits
      .filter((unit) => unit && !openUnitsById.has(unit.id))
      .map((unit) => ({
        id: unit.id,
        key: unit.key,
        name: unit.name,
        type: unit.type,
        hierarchyBase: unit.hierarchyBase,
        isStale: true,
      })),
  ].sort(compareUnitsForOptions);

  const billets = [
    ...openings.billets.map((row) => ({
      id: row.id,
      billetName: row.billetName,
      rootUnitId: row.rootUnitId,
      rootUnit: row.rootUnit,
      isStale: false,
    })),
    ...selectedBillets
      .filter((row) => row && !openBilletsById.has(row.id))
      .map((row) => ({
        id: row.id,
        billetName: row.billetName,
        rootUnitId: row.rootUnitId,
        rootUnit: row.rootUnit,
        isStale: true,
      })),
  ].sort(compareBilletOptions);

  return { units, billets };
}

async function loadRecruitingBilletOpeningSource(prisma) {
  const [rootUnits, allUnits, billetOpenings, activeBillets, assignedProfiles] = await Promise.all([
    prisma.unit.findMany({
      where: {
        status: "Active",
        recruitingOpen: true,
        hierarchyBase: 7000,
      },
      orderBy: [{ name: "asc" }],
      select: { id: true, key: true, name: true, parentId: true, type: true, hierarchyBase: true },
    }),
    prisma.unit.findMany({
      where: { status: "Active" },
      select: { id: true, parentId: true },
    }),
    prisma.billetOpening.findMany({
      orderBy: [{ billetName: "asc" }],
      select: {
        id: true,
        rootUnitId: true,
        billetName: true,
        authorizedSlots: true,
        rootUnit: {
          select: { id: true, key: true, name: true, type: true, hierarchyBase: true },
        },
      },
    }),
    prisma.billet.findMany({
      where: {
        status: "Active",
        unitId: { not: null },
      },
      select: {
        unitId: true,
        name: true,
      },
    }),
    prisma.personnelProfile.findMany({
      where: {
        status: { notIn: DISCHARGED_PERSONNEL_STATUSES },
        currentBilletId: { not: null },
        currentUnitId: { not: null },
      },
      select: {
        currentUnitId: true,
        currentBillet: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return {
    rootUnits,
    allUnits,
    billetOpenings,
    activeBillets,
    assignedProfiles,
  };
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
  const walk = (unitId) => {
    if (descendantMap.has(unitId)) {
      return descendantMap.get(unitId);
    }

    const directChildren = childrenByParentId.get(unitId) ?? [];
    const descendants = [];
    for (const childId of directChildren) {
      descendants.push(childId, ...walk(childId));
    }
    descendantMap.set(unitId, descendants);
    return descendants;
  };

  for (const unit of units) {
    walk(unit.id);
  }

  return descendantMap;
}

function openingKey(rootUnitId, billetName) {
  return `${rootUnitId}::${billetName}`;
}

function compareUnitsForOptions(left, right) {
  if (left.isStale !== right.isStale) {
    return left.isStale ? 1 : -1;
  }
  return String(left.name ?? "").localeCompare(String(right.name ?? ""));
}

function compareBilletRows(left, right) {
  const rootCompare = String(left.rootUnit?.name ?? "").localeCompare(
    String(right.rootUnit?.name ?? ""),
  );
  if (rootCompare !== 0) {
    return rootCompare;
  }
  return String(left.billetName ?? "").localeCompare(String(right.billetName ?? ""));
}

function compareBilletOptions(left, right) {
  if (left.isStale !== right.isStale) {
    return left.isStale ? 1 : -1;
  }
  return compareBilletRows(left, right);
}
