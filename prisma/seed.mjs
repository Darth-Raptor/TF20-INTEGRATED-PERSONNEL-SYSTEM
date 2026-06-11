import { PrismaClient } from "@prisma/client";
import { catalogSource } from "./catalog-source.mjs";
import { pathToFileURL } from "node:url";

async function main() {
  const prisma = new PrismaClient();
  const mode = parseMode(process.argv.slice(2));
  validateCatalogSource(catalogSource);
  try {
    const summary = await syncCatalogs(prisma, catalogSource, { mode });
    console.log(
      `${mode === "bootstrap" ? "Catalog bootstrap" : "Catalog sync"} complete: ${JSON.stringify(summary)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

export async function syncCatalogs(prismaClient, source, options = {}) {
  const mode = options.mode ?? "sync";
  const summary = {
    mode,
    roles: source.roles.length,
    permissions: source.permissions.length,
    units: source.units.length,
    ranks: source.ranks.length,
    billets: source.billets.length,
    staffSections: source.staffSections.length,
    mos: source.mos.length,
    trainingCourses: source.trainingCourses.length,
    qualifications: source.qualifications.length,
    awards: source.awards.length,
  };

  await prismaClient.$transaction(async (tx) => {
    await syncPermissions(tx, source.permissions);
    await syncRoles(tx, source.roles);
    await syncUnits(tx, source.units);
    await syncRanks(tx, source.ranks);
    await syncStaffSections(tx, source.staffSections);
    await syncMOS(tx, source.mos);
    await syncBillets(tx, source.billets);
    await syncTrainingCourses(tx, source.trainingCourses);
    await syncQualifications(tx, source.qualifications);
    await syncAwards(tx, source.awards);
    await archiveNonSourceCatalogs(tx, source);
  });

  return summary;
}

async function syncPermissions(tx, permissions) {
  for (const permission of permissions) {
    await tx.permission.upsert({
      where: { key: permission.key },
      update: {
        module: permission.module,
        action: permission.action,
        name: permission.name,
        description: permission.description ?? null,
        sensitiveCategory: permission.sensitiveCategory ?? null,
        requiresRecentAuth: permission.requiresRecentAuth,
        status: permission.status,
      },
      create: {
        key: permission.key,
        module: permission.module,
        action: permission.action,
        name: permission.name,
        description: permission.description ?? null,
        sensitiveCategory: permission.sensitiveCategory ?? null,
        requiresRecentAuth: permission.requiresRecentAuth,
        status: permission.status,
      },
    });
  }
}

async function syncRoles(tx, roles) {
  for (const role of roles) {
    await tx.role.upsert({
      where: { key: role.key },
      update: {
        name: role.name,
        description: role.description ?? null,
        precedence: role.precedence ?? 0,
        status: role.status,
      },
      create: {
        key: role.key,
        name: role.name,
        description: role.description ?? null,
        precedence: role.precedence ?? 0,
        status: role.status,
      },
    });
  }

  for (const role of roles) {
    const persistedRole = await tx.role.findUniqueOrThrow({ where: { key: role.key } });
    const desiredPermissionIds = [];
    for (const permissionKey of role.permissionKeys ?? []) {
      const permission = await tx.permission.findUniqueOrThrow({ where: { key: permissionKey } });
      desiredPermissionIds.push(permission.id);
      await tx.permissionGrant.upsert({
        where: {
          roleId_permissionId: {
            roleId: persistedRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: persistedRole.id,
          permissionId: permission.id,
        },
      });
    }

    await tx.permissionGrant.deleteMany({
      where: {
        roleId: persistedRole.id,
        permissionId: {
          notIn: desiredPermissionIds.length ? desiredPermissionIds : [""],
        },
      },
    });
  }
}

async function syncUnits(tx, units) {
  for (const unit of units) {
    await tx.unit.upsert({
      where: { key: unit.key },
      update: {
        name: unit.name,
        type: unit.type,
        status: unit.status,
        hierarchyBase: unit.hierarchyBase ?? 0,
        recruitingOpen: unit.recruitingOpen ?? unit.status === "Active",
      },
      create: {
        key: unit.key,
        name: unit.name,
        type: unit.type,
        status: unit.status,
        hierarchyBase: unit.hierarchyBase ?? 0,
        recruitingOpen: unit.recruitingOpen ?? unit.status === "Active",
      },
    });
  }

  for (const unit of units) {
    const parent = unit.parentKey
      ? await tx.unit.findUniqueOrThrow({ where: { key: unit.parentKey } })
      : null;
    await tx.unit.update({
      where: { key: unit.key },
      data: {
        parentId: parent?.id ?? null,
      },
    });
  }
}

async function syncRanks(tx, ranks) {
  for (const rank of ranks) {
    await tx.rank.upsert({
      where: { key: rank.key },
      update: {
        name: rank.name,
        abbreviation: rank.abbreviation ?? null,
        grade: rank.grade ?? null,
        precedence: rank.precedence ?? 0,
        status: rank.status,
      },
      create: {
        key: rank.key,
        name: rank.name,
        abbreviation: rank.abbreviation ?? null,
        grade: rank.grade ?? null,
        precedence: rank.precedence ?? 0,
        status: rank.status,
      },
    });
  }
}

async function syncStaffSections(tx, staffSections) {
  for (const staffSection of staffSections) {
    await tx.staffSection.upsert({
      where: { key: staffSection.key },
      update: {
        identifier: staffSection.identifier ?? null,
        name: staffSection.name,
        function: staffSection.function ?? null,
        status: staffSection.status,
      },
      create: {
        key: staffSection.key,
        identifier: staffSection.identifier ?? null,
        name: staffSection.name,
        function: staffSection.function ?? null,
        status: staffSection.status,
      },
    });
  }
}

async function syncMOS(tx, mosEntries) {
  for (const mos of mosEntries) {
    const unit = mos.unitKey
      ? await tx.unit.findUniqueOrThrow({ where: { key: mos.unitKey } })
      : null;
    await tx.mOS.upsert({
      where: { key: mos.key },
      update: {
        identifier: mos.identifier,
        name: mos.name,
        unitId: unit?.id ?? null,
        status: mos.status,
        recruitingOpen: mos.recruitingOpen ?? mos.status === "Active",
      },
      create: {
        key: mos.key,
        identifier: mos.identifier,
        name: mos.name,
        unitId: unit?.id ?? null,
        status: mos.status,
        recruitingOpen: mos.recruitingOpen ?? mos.status === "Active",
      },
    });
  }
}

async function syncBillets(tx, billets) {
  for (const billet of billets) {
    const unit = billet.unitKey
      ? await tx.unit.findUniqueOrThrow({ where: { key: billet.unitKey } })
      : null;
    const minimumRank = billet.minimumRankKey
      ? await tx.rank.findUniqueOrThrow({ where: { key: billet.minimumRankKey } })
      : null;
    await tx.billet.upsert({
      where: { key: billet.key },
      update: {
        unitId: unit?.id ?? null,
        minimumRankId: minimumRank?.id ?? null,
        name: billet.name,
        category: billet.category ?? null,
        commandPrecedence: billet.commandPrecedence ?? 0,
        status: billet.status,
      },
      create: {
        key: billet.key,
        unitId: unit?.id ?? null,
        minimumRankId: minimumRank?.id ?? null,
        name: billet.name,
        category: billet.category ?? null,
        commandPrecedence: billet.commandPrecedence ?? 0,
        status: billet.status,
      },
    });
  }
}

async function syncTrainingCourses(tx, trainingCourses) {
  for (const course of trainingCourses) {
    await tx.trainingCourse.upsert({
      where: { key: course.key ?? undefined },
      update: {
        name: course.name,
        category: course.category ?? null,
        description: course.description ?? null,
        status: course.status,
      },
      create: {
        key: course.key ?? null,
        name: course.name,
        category: course.category ?? null,
        description: course.description ?? null,
        status: course.status,
      },
    });
  }
}

async function syncQualifications(tx, qualifications) {
  for (const qualification of qualifications) {
    await tx.qualification.upsert({
      where: { key: qualification.key },
      update: {
        name: qualification.name,
        category: qualification.category ?? null,
        expiresAfterDays: qualification.expiresAfterDays ?? null,
        status: qualification.status,
      },
      create: {
        key: qualification.key,
        name: qualification.name,
        category: qualification.category ?? null,
        expiresAfterDays: qualification.expiresAfterDays ?? null,
        status: qualification.status,
      },
    });
  }
}

async function syncAwards(tx, awards) {
  for (const award of awards) {
    await tx.award.upsert({
      where: { key: award.key ?? undefined },
      update: {
        abbreviation: award.abbreviation ?? null,
        name: award.name,
        type: award.type ?? null,
        category: award.category ?? null,
        status: award.status,
      },
      create: {
        key: award.key ?? null,
        abbreviation: award.abbreviation ?? null,
        name: award.name,
        type: award.type ?? null,
        category: award.category ?? null,
        status: award.status,
      },
    });
  }
}

async function archiveNonSourceCatalogs(tx, source) {
  await archiveRowsNotInSource(
    tx.role,
    "key",
    source.roles.map((role) => role.key),
  );
  await archiveRowsNotInSource(
    tx.permission,
    "key",
    source.permissions.map((permission) => permission.key),
  );
  await archiveRowsNotInSource(
    tx.unit,
    "key",
    source.units.map((unit) => unit.key),
  );
  await archiveRowsNotInSource(
    tx.rank,
    "key",
    source.ranks.map((rank) => rank.key),
  );
  await archiveRowsNotInSource(
    tx.billet,
    "key",
    source.billets.map((billet) => billet.key),
  );
  await archiveRowsNotInSource(
    tx.staffSection,
    "key",
    source.staffSections.map((staffSection) => staffSection.key),
  );
  await archiveRowsNotInSource(
    tx.mOS,
    "key",
    source.mos.map((mos) => mos.key),
  );
  await archiveRowsNotInSource(
    tx.trainingCourse,
    "key",
    source.trainingCourses.map((course) => course.key).filter(Boolean),
    { includeNull: true },
  );
  await archiveRowsNotInSource(
    tx.qualification,
    "key",
    source.qualifications.map((qualification) => qualification.key),
  );
  await archiveRowsNotInSource(
    tx.award,
    "key",
    source.awards.map((award) => award.key).filter(Boolean),
    { includeNull: true },
  );
}

async function archiveRowsNotInSource(model, fieldName, sourceValues, options = {}) {
  const sourceSet = [...new Set(sourceValues.filter(Boolean))];
  const filters = [];

  if (sourceSet.length) {
    filters.push({ [fieldName]: { notIn: sourceSet } });
  }
  if (options.includeNull) {
    filters.push({ [fieldName]: null });
  }

  if (!filters.length) {
    return;
  }

  await model.updateMany({
    where: {
      status: { not: "Archived" },
      OR: filters,
    },
    data: {
      status: "Archived",
    },
  });
}

export function validateCatalogSource(source) {
  const requiredFamilies = [
    "roles",
    "permissions",
    "units",
    "ranks",
    "billets",
    "staffSections",
    "mos",
    "trainingCourses",
    "qualifications",
    "awards",
  ];

  for (const family of requiredFamilies) {
    if (!Array.isArray(source[family])) {
      throw new Error(`Catalog source is missing required family array ${family}.`);
    }
  }

  assertUnique(source.roles, "roles", "key");
  assertUnique(source.permissions, "permissions", "key");
  assertUnique(source.units, "units", "key");
  assertUnique(source.ranks, "ranks", "key");
  assertUnique(source.billets, "billets", "key");
  assertUnique(source.staffSections, "staffSections", "key");
  assertUnique(source.mos, "mos", "key");
  assertUnique(source.trainingCourses, "trainingCourses", "key");
  assertUnique(source.qualifications, "qualifications", "key");
  assertUnique(source.awards, "awards", "key");

  const unitKeys = new Set(source.units.map((unit) => unit.key));
  const rankKeys = new Set(source.ranks.map((rank) => rank.key));
  const permissionKeys = new Set(source.permissions.map((permission) => permission.key));

  for (const unit of source.units) {
    if (unit.parentKey && !unitKeys.has(unit.parentKey)) {
      throw new Error(
        `Catalog source unit ${unit.key} references missing parentKey ${unit.parentKey}.`,
      );
    }
  }

  for (const role of source.roles) {
    for (const permissionKey of role.permissionKeys ?? []) {
      if (!permissionKeys.has(permissionKey)) {
        throw new Error(
          `Catalog source role ${role.key} references missing permission ${permissionKey}.`,
        );
      }
    }
  }

  for (const billet of source.billets) {
    if (billet.unitKey && !unitKeys.has(billet.unitKey)) {
      throw new Error(
        `Catalog source billet ${billet.key} references missing unitKey ${billet.unitKey}.`,
      );
    }
    if (billet.minimumRankKey && !rankKeys.has(billet.minimumRankKey)) {
      throw new Error(
        `Catalog source billet ${billet.key} references missing minimumRankKey ${billet.minimumRankKey}.`,
      );
    }
  }

  for (const mos of source.mos) {
    if (mos.unitKey && !unitKeys.has(mos.unitKey)) {
      throw new Error(`Catalog source MOS ${mos.key} references missing unitKey ${mos.unitKey}.`);
    }
  }
}

function parseMode(argv) {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const value = modeArg?.split("=")[1] ?? "bootstrap";
  if (value !== "bootstrap" && value !== "sync") {
    throw new Error(`Unsupported seed mode ${value}. Use bootstrap or sync.`);
  }
  return value;
}

function assertUnique(items, familyName, fieldName) {
  const seen = new Set();
  for (const item of items) {
    const value = item?.[fieldName];
    if (value == null) continue;
    if (seen.has(value)) {
      throw new Error(`Catalog source family ${familyName} has duplicate ${fieldName} ${value}.`);
    }
    seen.add(value);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
