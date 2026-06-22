const DISCHARGED_PERSONNEL_STATUSES = [
  "HonorableDischarge",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
];

export function deriveLiveRecruitingOpenings({ rootUnits, allUnits, mosRows, assignedProfiles }) {
  const descendantMap = buildDescendantMap(allUnits);
  const rootTreeUnitIds = new Map(
    rootUnits.map((unit) => [unit.id, new Set([unit.id, ...(descendantMap.get(unit.id) ?? [])])]),
  );
  const mosById = new Map(mosRows.map((row) => [row.id, row]));
  const assignedCounts = new Map();

  for (const profile of assignedProfiles) {
    const mos = mosById.get(profile.currentMOSId);
    if (!mos) continue;
    const treeUnitIds = rootTreeUnitIds.get(mos.unitId);
    if (!treeUnitIds?.has(profile.currentUnitId)) continue;
    assignedCounts.set(mos.id, (assignedCounts.get(mos.id) ?? 0) + 1);
  }

  const mos = mosRows.filter((row) => row.authorizedSlots > (assignedCounts.get(row.id) ?? 0));
  const unitIdsWithOpenings = new Set(mos.map((row) => row.unitId));
  const units = rootUnits.filter((unit) => unitIdsWithOpenings.has(unit.id));

  return {
    units,
    mos,
    groups: units.map((unit) => ({
      unit: {
        id: unit.id,
        key: unit.key,
        name: unit.name,
      },
      mos: mos
        .filter((row) => row.unitId === unit.id)
        .map((row) => ({
          id: row.id,
          key: row.key,
          identifier: row.identifier,
          name: row.name,
        })),
    })),
    assignedCounts,
  };
}

export async function loadLiveRecruitingOpenings(prisma) {
  const [rootUnits, allUnits, mosRows, assignedProfiles] = await Promise.all([
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
    prisma.mOS.findMany({
      where: {
        status: "Active",
        recruitingOpen: true,
        unit: {
          status: "Active",
          recruitingOpen: true,
          hierarchyBase: 7000,
        },
      },
      orderBy: [{ identifier: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        identifier: true,
        name: true,
        unitId: true,
        authorizedSlots: true,
        unit: { select: { id: true, key: true, name: true } },
      },
    }),
    prisma.personnelProfile.findMany({
      where: {
        status: { notIn: DISCHARGED_PERSONNEL_STATUSES },
        currentMOSId: { not: null },
        currentUnitId: { not: null },
      },
      select: {
        currentMOSId: true,
        currentUnitId: true,
      },
    }),
  ]);

  return deriveLiveRecruitingOpenings({
    rootUnits,
    allUnits,
    mosRows,
    assignedProfiles,
  });
}

export function buildApplicantOpeningsOptions({ openings, selectedUnits = [], selectedMos = [] }) {
  const openUnitsById = new Map(openings.units.map((unit) => [unit.id, unit]));
  const openMosById = new Map(openings.mos.map((row) => [row.id, row]));

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

  const mos = [
    ...openings.mos.map((row) => ({
      id: row.id,
      key: row.key,
      identifier: row.identifier,
      name: row.name,
      unitId: row.unitId,
      unit: row.unit,
      isStale: false,
    })),
    ...selectedMos
      .filter((row) => row && !openMosById.has(row.id))
      .map((row) => ({
        id: row.id,
        key: row.key,
        identifier: row.identifier,
        name: row.name,
        unitId: row.unitId,
        unit: row.unit,
        isStale: true,
      })),
  ].sort(compareMosForOptions);

  return { units, mos };
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

function compareUnitsForOptions(left, right) {
  if (left.isStale !== right.isStale) {
    return left.isStale ? 1 : -1;
  }
  return String(left.name ?? "").localeCompare(String(right.name ?? ""));
}

function compareMosForOptions(left, right) {
  if (left.isStale !== right.isStale) {
    return left.isStale ? 1 : -1;
  }
  const identifierCompare = String(left.identifier ?? "").localeCompare(
    String(right.identifier ?? ""),
  );
  if (identifierCompare !== 0) {
    return identifierCompare;
  }
  return String(left.name ?? "").localeCompare(String(right.name ?? ""));
}
