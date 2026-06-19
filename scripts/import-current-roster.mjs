import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

const DEFAULT_FILE_PATH = path.join(
  process.cwd(),
  "phase two review files",
  "current_roster_import.csv",
);
const REQUIRED_HEADERS = [
  "DISCORD ID #",
  "DISCORD NAME",
  "firstname",
  "lastname",
  "PersonnelStatus",
  "rank_key",
  "unit_key",
  "billet_key",
  "MOS",
  "joinedAt",
  "promotedat",
  "ROLES",
  "qualifications",
  "award_key",
];
const PERSONNEL_STATUS_OPTIONS = new Set([
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
]);
const UNIT_SCOPED_ROLE_KEYS = new Set(["unit-staff", "trainer"]);
const IMPORT_REASON = "One-time current roster import.";
const WAIVER_NOTE_TYPE = "rank-waiver-required";
const WAIVER_NOTE_PREFIX = "Current roster import rank waiver required:";

export function parseRosterCsv(text) {
  const matrix = parseCsvMatrix(text);
  if (!matrix.length) {
    return { headers: [], rows: [] };
  }

  const headers = matrix[0].map((header) => header.trim());
  const rows = matrix.slice(1).map((cells, index) => {
    const values = Object.fromEntries(
      headers.map((header, cellIndex) => [header, (cells[cellIndex] ?? "").trim()]),
    );
    return normalizeRosterRow(values, index + 2);
  });

  return { headers, rows };
}

export function normalizeRosterRow(row, rowNumber) {
  const mosKeys = splitKeys(row.MOS);
  return {
    rowNumber,
    discordId: normalizeText(row["DISCORD ID #"]),
    discordName: normalizeText(row["DISCORD NAME"]),
    firstName: normalizeText(row.firstname),
    lastName: normalizeText(row.lastname),
    personnelStatus: normalizeText(row.PersonnelStatus),
    rankKey: normalizeText(row.rank_key),
    unitKey: normalizeText(row.unit_key),
    billetKey: normalizeText(row.billet_key),
    primaryMOSKey: mosKeys[0] ?? "",
    secondaryMOSKey: mosKeys[1] ?? "",
    mosKeys,
    joinedAt: normalizeText(row.joinedAt),
    promotedAt: normalizeText(row.promotedat),
    roleKeys: splitKeys(row.ROLES),
    qualificationKeys: splitKeys(row.qualifications),
    awardKeys: splitKeys(row.award_key),
  };
}

export function splitKeys(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function roleScopeForImport(roleKey, unitId) {
  if (UNIT_SCOPED_ROLE_KEYS.has(roleKey)) {
    return {
      scopeType: "Unit",
      scopeIncludesDescendants: true,
      unitId,
      staffSectionId: null,
    };
  }

  return {
    scopeType: "Global",
    scopeIncludesDescendants: true,
    unitId: null,
    staffSectionId: null,
  };
}

export function unitOwnsOrContainsAssignment(ownerUnitId, assignedUnitId, unitsById) {
  if (!ownerUnitId || !assignedUnitId) {
    return false;
  }

  if (ownerUnitId === assignedUnitId) {
    return true;
  }

  let current = unitsById.get(assignedUnitId);
  while (current?.parentId) {
    if (current.parentId === ownerUnitId) {
      return true;
    }
    current = unitsById.get(current.parentId);
  }

  return false;
}

export async function importCurrentRoster({
  prisma,
  filePath = DEFAULT_FILE_PATH,
  apply = false,
  now = new Date(),
} = {}) {
  if (!prisma) {
    throw new Error("A Prisma client is required.");
  }

  const fileContents = fs.readFileSync(filePath, "utf8");
  const { headers, rows } = parseRosterCsv(fileContents);
  const context = await loadImportContext(prisma);
  const validation = validateRosterImport({ headers, rows, context });
  const rowPlans = await buildRowPlans({ prisma, rows, context });
  const summary = buildSummary({ rows, rowPlans, validation, apply });

  if (validation.errors.length) {
    return {
      ok: false,
      apply,
      code: "validation_error",
      message: "Current roster import validation failed.",
      summary,
      errors: validation.errors,
      warnings: validation.warnings,
      rows: rowPlans,
    };
  }

  if (!apply) {
    return {
      ok: true,
      apply: false,
      summary,
      errors: [],
      warnings: validation.warnings,
      rows: rowPlans,
    };
  }

  const appliedRows = await prisma.$transaction(async (tx) => {
    const txContext = await loadImportContext(tx);
    const txValidation = validateRosterImport({ headers, rows, context: txContext });
    if (txValidation.errors.length) {
      throw new Error(formatImportReport({ errors: txValidation.errors, warnings: [] }));
    }

    const results = [];
    for (const row of rows) {
      results.push(await applyRosterRow({ tx, row, context: txContext, now }));
    }
    return results;
  });

  return {
    ok: true,
    apply: true,
    summary: buildSummary({
      rows,
      rowPlans: appliedRows,
      validation,
      apply: true,
    }),
    errors: [],
    warnings: validation.warnings,
    rows: appliedRows,
  };
}

export function validateRosterImport({ headers, rows, context }) {
  const errors = [];
  const warnings = [];
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  for (const header of missingHeaders) {
    errors.push({ rowNumber: 1, field: "headers", message: `Missing required header ${header}.` });
  }

  const seenDiscordIds = new Set();
  for (const row of rows) {
    requireValue(errors, row, "DISCORD ID #", row.discordId);
    requireValue(errors, row, "DISCORD NAME", row.discordName);
    requireValue(errors, row, "firstname", row.firstName);
    requireValue(errors, row, "lastname", row.lastName);
    requireValue(errors, row, "PersonnelStatus", row.personnelStatus);
    requireValue(errors, row, "rank_key", row.rankKey);
    requireValue(errors, row, "unit_key", row.unitKey);
    requireValue(errors, row, "billet_key", row.billetKey);
    requireValue(errors, row, "MOS", row.primaryMOSKey);
    requireValue(errors, row, "joinedAt", row.joinedAt);
    requireValue(errors, row, "promotedat", row.promotedAt);

    if (seenDiscordIds.has(row.discordId)) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "DISCORD ID #",
        message: `Duplicate Discord ID ${row.discordId}.`,
      });
    }
    seenDiscordIds.add(row.discordId);

    if (row.mosKeys.length > 2) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "MOS",
        message: "Only primary and secondary MOS are supported.",
      });
    }

    if (row.personnelStatus && !PERSONNEL_STATUS_OPTIONS.has(row.personnelStatus)) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "PersonnelStatus",
        message: `Unknown personnel status ${row.personnelStatus}.`,
      });
    }

    validateCatalogKey(errors, row, "rank_key", row.rankKey, context.ranksByKey);
    validateCatalogKey(errors, row, "unit_key", row.unitKey, context.unitsByKey);
    validateCatalogKey(errors, row, "billet_key", row.billetKey, context.billetsByKey);
    for (const mosKey of row.mosKeys) {
      validateCatalogKey(errors, row, "MOS", mosKey, context.mosByKey);
    }
    for (const roleKey of row.roleKeys) {
      validateCatalogKey(errors, row, "ROLES", roleKey, context.rolesByKey);
    }
    for (const qualificationKey of row.qualificationKeys) {
      validateCatalogKey(
        errors,
        row,
        "qualifications",
        qualificationKey,
        context.qualificationsByKey,
      );
    }
    for (const awardKey of row.awardKeys) {
      validateCatalogKey(errors, row, "award_key", awardKey, context.awardsByKey);
    }

    const joinedAt = parseImportDate(row.joinedAt);
    const promotedAt = parseImportDate(row.promotedAt);
    if (!joinedAt) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "joinedAt",
        message: `Invalid date ${row.joinedAt}.`,
      });
    }
    if (!promotedAt) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "promotedat",
        message: `Invalid date ${row.promotedAt}.`,
      });
    }

    const unit = context.unitsByKey.get(row.unitKey);
    const billet = context.billetsByKey.get(row.billetKey);
    if (
      unit &&
      billet?.unitId &&
      !unitOwnsOrContainsAssignment(billet.unitId, unit.id, context.unitsById)
    ) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "billet_key",
        message: `${row.billetKey} belongs to a unit outside ${row.unitKey}.`,
      });
    }

    const rank = context.ranksByKey.get(row.rankKey);
    const minimumRank = billet?.minimumRankId ? context.ranksById.get(billet.minimumRankId) : null;
    if (rank && minimumRank && rank.precedence < minimumRank.precedence) {
      warnings.push({
        rowNumber: row.rowNumber,
        field: "rank_key",
        code: "rank-waiver-required",
        message: `${displayName(row)} has rank ${row.rankKey}, below billet minimum ${minimumRank.key}.`,
      });
    }
  }

  return { errors, warnings };
}

async function buildRowPlans({ prisma, rows, context }) {
  const discordIds = rows.map((row) => row.discordId).filter(Boolean);
  const identities = await prisma.authIdentity.findMany({
    where: {
      provider: "Discord",
      providerAccountId: { in: discordIds.length ? discordIds : [""] },
    },
    include: {
      account: {
        include: {
          personnelProfile: true,
          roleAssignments: {
            where: { endsAt: null },
            include: { role: true },
          },
        },
      },
    },
  });
  const identityByDiscordId = new Map(
    identities.map((identity) => [identity.providerAccountId, identity]),
  );

  return rows.map((row) => {
    const identity = identityByDiscordId.get(row.discordId);
    const account = identity?.account ?? null;
    const profile = account?.personnelProfile ?? null;
    const activeRoleKeys = new Set(
      (account?.roleAssignments ?? []).map((assignment) => assignment.role.key),
    );
    const csvRoleKeys = new Set(row.roleKeys);
    const existingRolesNotInCsv = [...activeRoleKeys].filter(
      (roleKey) => !csvRoleKeys.has(roleKey),
    );
    const waiver = rankWaiverForRow(row, context);

    return {
      rowNumber: row.rowNumber,
      discordId: row.discordId,
      name: displayName(row),
      accountAction: account ? "update" : "create",
      profileAction: profile ? "update" : "create",
      primaryMOSKey: row.primaryMOSKey,
      secondaryMOSKey: row.secondaryMOSKey || null,
      rankWaiverRequired: Boolean(waiver),
      existingRolesNotInCsv,
    };
  });
}

async function applyRosterRow({ tx, row, context, now }) {
  const joinedAt = parseImportDate(row.joinedAt);
  const promotedAt = parseImportDate(row.promotedAt);
  const rank = context.ranksByKey.get(row.rankKey);
  const unit = context.unitsByKey.get(row.unitKey);
  const billet = context.billetsByKey.get(row.billetKey);
  const primaryMOS = context.mosByKey.get(row.primaryMOSKey);
  const secondaryMOS = row.secondaryMOSKey ? context.mosByKey.get(row.secondaryMOSKey) : null;
  const identity = await tx.authIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "Discord",
        providerAccountId: row.discordId,
      },
    },
    include: {
      account: {
        include: {
          personnelProfile: true,
          roleAssignments: {
            where: { endsAt: null },
            include: { role: true },
          },
        },
      },
    },
  });
  const accountAction = identity ? "update" : "create";
  let account = identity?.account ?? null;

  if (account) {
    account = await tx.account.update({
      where: { id: account.id },
      data: {
        status: "Active",
        activatedAt: account.activatedAt ?? now,
        statusReason: "Confirmed active by current roster import.",
        displayName: account.displayName || row.discordName,
      },
    });
    await tx.authIdentity.update({
      where: { id: identity.id },
      data: {
        username: row.discordName,
        displayName: row.discordName,
      },
    });
  } else {
    account = await tx.account.create({
      data: {
        displayName: row.discordName,
        status: "Active",
        activatedAt: now,
        statusReason: "Created by current roster import.",
        authIdentities: {
          create: {
            provider: "Discord",
            providerAccountId: row.discordId,
            username: row.discordName,
            displayName: row.discordName,
            guildMembershipRequired: true,
            isPrimary: true,
            metadata: {
              importedFrom: "current_roster_import.csv",
            },
          },
        },
      },
    });
  }

  const existingProfile = await tx.personnelProfile.findUnique({
    where: { accountId: account.id },
  });
  const profileAction = existingProfile ? "update" : "create";
  const profileData = {
    name: displayName(row),
    status: row.personnelStatus,
    currentRankId: rank.id,
    currentUnitId: unit.id,
    currentBilletId: billet.id,
    currentMOSId: primaryMOS.id,
    currentSecondaryMOSId: secondaryMOS?.id ?? null,
    goodStanding: true,
    joinedAt,
    acceptedAt: joinedAt,
  };

  const profile = existingProfile
    ? await tx.personnelProfile.update({
        where: { id: existingProfile.id },
        data: profileData,
      })
    : await tx.personnelProfile.create({
        data: {
          accountId: account.id,
          ...profileData,
        },
      });

  await tx.auditLog.create({
    data: {
      targetAccountId: account.id,
      targetPersonnelProfileId: profile.id,
      module: "personnel",
      action: "current-roster-import",
      recordType: "PersonnelProfile",
      recordId: profile.id,
      newValue: {
        discordId: row.discordId,
        rankKey: row.rankKey,
        unitKey: row.unitKey,
        billetKey: row.billetKey,
        primaryMOSKey: row.primaryMOSKey,
        secondaryMOSKey: row.secondaryMOSKey || null,
        roleKeys: row.roleKeys,
        qualificationKeys: row.qualificationKeys,
        awardKeys: row.awardKeys,
      },
      reason: IMPORT_REASON,
    },
  });

  await ensureStatusHistory({ tx, profile, status: row.personnelStatus, effectiveAt: joinedAt });
  await ensureAssignmentHistory({
    tx,
    modelName: "personnelRankHistory",
    personnelProfileId: profile.id,
    relationField: "rankId",
    nextId: rank.id,
    effectiveAt: promotedAt,
    assignmentType: null,
  });
  await ensureAssignmentHistory({
    tx,
    modelName: "personnelUnitAssignment",
    personnelProfileId: profile.id,
    relationField: "unitId",
    nextId: unit.id,
    effectiveAt: joinedAt,
    assignmentType: "Primary",
  });
  await ensureAssignmentHistory({
    tx,
    modelName: "personnelBilletAssignment",
    personnelProfileId: profile.id,
    relationField: "billetId",
    nextId: billet.id,
    effectiveAt: joinedAt,
    assignmentType: "Primary",
  });
  await ensureAssignmentHistory({
    tx,
    modelName: "personnelMOSHistory",
    personnelProfileId: profile.id,
    relationField: "mosId",
    nextId: primaryMOS.id,
    effectiveAt: joinedAt,
    assignmentType: "Primary",
  });
  await ensureAssignmentHistory({
    tx,
    modelName: "personnelMOSHistory",
    personnelProfileId: profile.id,
    relationField: "mosId",
    nextId: secondaryMOS?.id ?? null,
    effectiveAt: joinedAt,
    assignmentType: "Secondary",
  });

  await ensureRoleAssignments({
    tx,
    accountId: account.id,
    unitId: unit.id,
    roleKeys: row.roleKeys,
    context,
  });
  await ensureQualifications({
    tx,
    profileId: profile.id,
    qualificationKeys: row.qualificationKeys,
    context,
    joinedAt,
  });
  await ensureAwardRecords({
    tx,
    profileId: profile.id,
    awardKeys: row.awardKeys,
    context,
    awardedAt: joinedAt,
  });
  const waiver = rankWaiverForRow(row, context);
  if (waiver) {
    await ensureRankWaiverNote({ tx, profileId: profile.id, row, waiver });
  }

  const refreshedRoles = await tx.roleAssignment.findMany({
    where: { accountId: account.id, endsAt: null },
    include: { role: true },
  });
  const csvRoleKeys = new Set(row.roleKeys);
  const existingRolesNotInCsv = refreshedRoles
    .map((assignment) => assignment.role.key)
    .filter((roleKey) => !csvRoleKeys.has(roleKey));

  return {
    rowNumber: row.rowNumber,
    discordId: row.discordId,
    name: displayName(row),
    accountAction,
    profileAction,
    primaryMOSKey: row.primaryMOSKey,
    secondaryMOSKey: row.secondaryMOSKey || null,
    rankWaiverRequired: Boolean(waiver),
    existingRolesNotInCsv,
  };
}

async function ensureStatusHistory({ tx, profile, status, effectiveAt }) {
  const existing = await tx.personnelStatusHistory.findFirst({
    where: {
      personnelProfileId: profile.id,
      newStatus: status,
      effectiveAt,
      reason: IMPORT_REASON,
    },
  });

  if (existing) return;

  await tx.personnelStatusHistory.create({
    data: {
      personnelProfileId: profile.id,
      oldStatus: null,
      newStatus: status,
      effectiveAt,
      reason: IMPORT_REASON,
    },
  });
}

async function ensureAssignmentHistory({
  tx,
  modelName,
  personnelProfileId,
  relationField,
  nextId,
  effectiveAt,
  assignmentType,
}) {
  const openWhere = {
    personnelProfileId,
    endedAt: null,
    ...(assignmentType ? { assignmentType } : {}),
  };
  const openRows = await tx[modelName].findMany({ where: openWhere });

  if (!nextId) {
    if (openRows.length) {
      await tx[modelName].updateMany({
        where: openWhere,
        data: { endedAt: effectiveAt },
      });
    }
    return;
  }

  const matchingOpen = openRows.find((entry) => entry[relationField] === nextId);
  if (matchingOpen) {
    if (matchingOpen.effectiveAt.getTime() !== effectiveAt.getTime()) {
      await tx[modelName].update({
        where: { id: matchingOpen.id },
        data: { effectiveAt, reason: IMPORT_REASON },
      });
    }
    return;
  }

  if (openRows.length) {
    await tx[modelName].updateMany({
      where: openWhere,
      data: { endedAt: effectiveAt },
    });
  }

  const existingImported = await tx[modelName].findFirst({
    where: {
      personnelProfileId,
      [relationField]: nextId,
      effectiveAt,
      reason: IMPORT_REASON,
      ...(assignmentType ? { assignmentType } : {}),
    },
  });
  if (existingImported) {
    await tx[modelName].update({
      where: { id: existingImported.id },
      data: { endedAt: null },
    });
    return;
  }

  await tx[modelName].create({
    data: {
      personnelProfileId,
      [relationField]: nextId,
      effectiveAt,
      reason: IMPORT_REASON,
      ...(assignmentType ? { assignmentType } : {}),
    },
  });
}

async function ensureRoleAssignments({ tx, accountId, unitId, roleKeys, context }) {
  for (const roleKey of roleKeys) {
    const role = context.rolesByKey.get(roleKey);
    const scope = roleScopeForImport(roleKey, unitId);
    const existing = await tx.roleAssignment.findFirst({
      where: {
        accountId,
        roleId: role.id,
        endsAt: null,
        scopeType: scope.scopeType,
        unitId: scope.unitId,
        staffSectionId: scope.staffSectionId,
      },
    });

    if (existing) continue;

    await tx.roleAssignment.create({
      data: {
        accountId,
        roleId: role.id,
        ...scope,
        reason: IMPORT_REASON,
      },
    });
  }
}

async function ensureQualifications({ tx, profileId, qualificationKeys, context, joinedAt }) {
  for (const qualificationKey of qualificationKeys) {
    const qualification = context.qualificationsByKey.get(qualificationKey);
    await tx.personnelQualification.upsert({
      where: {
        personnelProfileId_qualificationId: {
          personnelProfileId: profileId,
          qualificationId: qualification.id,
        },
      },
      update: {
        status: "Active",
        grantedAt: joinedAt,
        evidence: "Imported from current roster CSV.",
        notes: IMPORT_REASON,
      },
      create: {
        personnelProfileId: profileId,
        qualificationId: qualification.id,
        status: "Active",
        grantedAt: joinedAt,
        evidence: "Imported from current roster CSV.",
        notes: IMPORT_REASON,
      },
    });
  }
}

async function ensureAwardRecords({ tx, profileId, awardKeys, context, awardedAt }) {
  for (const awardKey of awardKeys) {
    const award = context.awardsByKey.get(awardKey);
    const existing = await tx.awardRecord.findFirst({
      where: {
        personnelProfileId: profileId,
        awardId: award.id,
        citation: "Imported from current roster CSV.",
      },
    });
    if (existing) continue;

    await tx.awardRecord.create({
      data: {
        personnelProfileId: profileId,
        awardId: award.id,
        awardedAt,
        citation: "Imported from current roster CSV.",
        visibility: "Staff",
      },
    });
  }
}

async function ensureRankWaiverNote({ tx, profileId, row, waiver }) {
  const body = `${WAIVER_NOTE_PREFIX} ${displayName(row)} holds ${row.rankKey} in ${row.billetKey}; billet minimum is ${waiver.minimumRankKey}.`;
  const existing = await tx.administrativeNote.findFirst({
    where: {
      personnelProfileId: profileId,
      noteType: WAIVER_NOTE_TYPE,
      body,
    },
  });
  if (existing) return;

  await tx.administrativeNote.create({
    data: {
      personnelProfileId: profileId,
      noteType: WAIVER_NOTE_TYPE,
      body,
      visibility: "Staff",
    },
  });
}

async function loadImportContext(prisma) {
  const [ranks, units, billets, mos, roles, qualifications, awards] = await Promise.all([
    prisma.rank.findMany({ where: { status: "Active" } }),
    prisma.unit.findMany({ where: { status: "Active" } }),
    prisma.billet.findMany({ where: { status: "Active" } }),
    prisma.mOS.findMany({ where: { status: "Active" } }),
    prisma.role.findMany({ where: { status: "Active" } }),
    prisma.qualification.findMany({ where: { status: "Active" } }),
    prisma.award.findMany({ where: { status: "Active" } }),
  ]);

  return {
    ranksByKey: mapBy(ranks, "key"),
    ranksById: mapBy(ranks, "id"),
    unitsByKey: mapBy(units, "key"),
    unitsById: mapBy(units, "id"),
    billetsByKey: mapBy(billets, "key"),
    mosByKey: mapBy(mos, "key"),
    rolesByKey: mapBy(roles, "key"),
    qualificationsByKey: mapBy(qualifications, "key"),
    awardsByKey: mapBy(awards, "key"),
  };
}

function rankWaiverForRow(row, context) {
  const rank = context.ranksByKey.get(row.rankKey);
  const billet = context.billetsByKey.get(row.billetKey);
  const minimumRank = billet?.minimumRankId ? context.ranksById.get(billet.minimumRankId) : null;
  if (!rank || !minimumRank || rank.precedence >= minimumRank.precedence) {
    return null;
  }

  return {
    rankKey: rank.key,
    minimumRankKey: minimumRank.key,
    billetKey: billet.key,
  };
}

function buildSummary({ rows, rowPlans, validation, apply }) {
  return {
    mode: apply ? "apply" : "dry-run",
    totalRows: rows.length,
    accountsToCreate: rowPlans.filter((row) => row.accountAction === "create").length,
    accountsToUpdate: rowPlans.filter((row) => row.accountAction === "update").length,
    profilesToCreate: rowPlans.filter((row) => row.profileAction === "create").length,
    profilesToUpdate: rowPlans.filter((row) => row.profileAction === "update").length,
    secondaryMOSRows: rowPlans.filter((row) => row.secondaryMOSKey).length,
    rankWaiverNotes: validation.warnings.filter(
      (warning) => warning.code === "rank-waiver-required",
    ).length,
    errors: validation.errors.length,
    warnings: validation.warnings.length,
  };
}

function parseCsvMatrix(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

function parseImportDate(value) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateCatalogKey(errors, row, field, value, map) {
  if (!value || map.has(value)) {
    return;
  }

  errors.push({
    rowNumber: row.rowNumber,
    field,
    message: `Unknown active catalog key ${value}.`,
  });
}

function requireValue(errors, row, field, value) {
  if (value) return;

  errors.push({
    rowNumber: row.rowNumber,
    field,
    message: `${field} is required.`,
  });
}

function mapBy(items, field) {
  return new Map(items.map((item) => [item[field], item]));
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function displayName(row) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
}

function formatImportReport({ errors, warnings }) {
  const lines = [];
  if (errors.length) {
    lines.push("Current roster import errors:");
    for (const error of errors) {
      lines.push(`- Row ${error.rowNumber} ${error.field}: ${error.message}`);
    }
  }
  if (warnings.length) {
    if (lines.length) lines.push("");
    lines.push("Current roster import warnings:");
    for (const warning of warnings) {
      lines.push(`- Row ${warning.rowNumber} ${warning.field}: ${warning.message}`);
    }
  }
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = {
    apply: false,
    filePath: DEFAULT_FILE_PATH,
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg.startsWith("--file=")) {
      options.filePath = path.resolve(arg.slice("--file=".length));
    } else {
      throw new Error(`Unsupported argument ${arg}. Use --dry-run, --apply, or --file=PATH.`);
    }
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  try {
    const result = await importCurrentRoster({ prisma, ...options });
    console.log(JSON.stringify(result.summary, null, 2));
    if (result.errors.length || result.warnings.length) {
      console.log(formatImportReport(result));
    }

    if (!result.ok) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
