import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "node:url";

import {
  expandUnitNamesWithAncestors,
  unitDefinitionForName,
  unitDefinitions,
  unitNameForKey,
} from "../src/server/services/unit-hierarchy.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultPreviewPath = path.join(projectRoot, ".private", "airtable-import-preview.json");

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split("=");
  if (key.startsWith("--")) {
    args.set(key, value ?? "true");
  }
}

const previewPath = path.resolve(args.get("--input") || defaultPreviewPath);
const commitMode = args.has("--commit");
const actorDiscordId = args.get("--actor-discord-id") || null;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured. Set it before running the Airtable importer.");
}

if (!fs.existsSync(previewPath)) {
  throw new Error(`Preview report not found at ${previewPath}`);
}

const preview = JSON.parse(fs.readFileSync(previewPath, "utf8"));
if (!preview?.summary?.validation?.ok) {
  throw new Error("Preview validation is not clean. Resolve preview issues before importing.");
}

const prisma = new PrismaClient();

try {
  const result = await importPreview(preview, { commitMode, actorDiscordId });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await prisma.$disconnect();
}

async function importPreview(previewReport, options) {
  const previewRecords = Array.isArray(previewReport.previewRecords) ? previewReport.previewRecords : [];
  const records = previewRecords.filter((record) => record.importAction === "upsert-user-and-profile");

  const roleNames = [...new Set(records.map((record) => record.suggestedPortalRole).filter(Boolean))];
  const unitNames = [...new Set(records.map((record) => record.inferredUnit).filter(Boolean))];
  const rankCodes = [...new Set(records.map((record) => record.mappedRank).filter(Boolean))];
  const billetKeys = [
    ...new Set(records.filter((record) => record.billet).map((record) => `${record.inferredUnit || ""}::${record.billet}`)),
  ];
  const staffCodes = [...new Set(records.flatMap((record) => record.shop || []).filter(Boolean))];

  const actorUser = actorDiscordId
    ? await prisma.user.findUnique({
        where: { discordId: actorDiscordId },
        select: { id: true, discordId: true },
      })
    : null;

  const roleMap = await loadRoleMap(roleNames);
  const rankMap = await ensureRanks(rankCodes, options.commitMode);
  const unitMap = await ensureUnits(unitNames, options.commitMode);
  const staffMap = await ensureStaffSections(staffCodes, options.commitMode);
  const billetCategory = await ensureBilletCategory(options.commitMode);
  const billetMap = await ensureBillets(records, billetCategory?.id || null, unitMap, options.commitMode);

  const totals = {
    records: records.length,
    usersCreated: 0,
    usersUpdated: 0,
    profilesCreated: 0,
    profilesUpdated: 0,
    rolesAssigned: 0,
    assignmentsEnded: 0,
    assignmentsCreated: 0,
    staffAssignmentsCreated: 0,
    auditLogsCreated: 0,
  };

  if (!options.commitMode) {
    return {
      mode: "dry-run",
      previewPath,
      actorUserId: actorUser?.id || null,
      totals,
      referenceSummary: {
        rolesResolved: [...roleMap.keys()].sort(),
        ranksResolved: [...rankMap.keys()].sort(),
        unitsResolved: [...unitMap.keys()].sort(),
        staffSectionsResolved: [...staffMap.keys()].sort(),
        billetsResolved: [...billetMap.keys()].sort(),
      },
      notes: [
        "Run again with --commit to write users, profiles, roles, assignments, and audit records.",
      ],
    };
  }

  const importBatchId = `airtable-import-${new Date().toISOString()}`;

  for (const record of records) {
    const role = roleMap.get(record.suggestedPortalRole);
    const rank = rankMap.get(record.mappedRank);
    const unit = unitMap.get(record.inferredUnit);
    const billet = record.billet ? billetMap.get(`${record.inferredUnit || ""}::${record.billet}`) : null;
    const userPayload = buildUserPayload(record);

    const existingUser = await prisma.user.findUnique({
      where: { discordId: record.discordId },
      select: { id: true, steam64Id: true },
    });

    const user = existingUser
      ? await prisma.user.update({
          where: { id: existingUser.id },
          data: userPayload,
        })
      : await prisma.user.create({
          data: userPayload,
        });

    totals[existingUser ? "usersUpdated" : "usersCreated"] += 1;

    const profileData = {
      currentRankId: rank?.id || null,
      currentStatus: record.mappedStatus,
      primaryUnitId: unit?.id || null,
      primaryBilletId: billet?.id || null,
      primaryMos: cleanText(record.primaryMos || record.specialty, 191) || null,
      dateJoined: parseDateOnly(record.dateOfEnlistment),
      dateAccepted: parseDateOnly(record.dateOfEnlistment),
      goodStanding: true,
    };

    const existingProfile = await prisma.personnelProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });

    const profile = existingProfile
      ? await prisma.personnelProfile.update({
          where: { userId: user.id },
          data: profileData,
        })
      : await prisma.personnelProfile.create({
          data: {
            userId: user.id,
            ...profileData,
          },
        });

    totals[existingProfile ? "profilesUpdated" : "profilesCreated"] += 1;

    if (role) {
      const roleLink = await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: role.id,
        },
      });

      if (roleLink) {
        totals.rolesAssigned += 1;
      }
    }

    if (unit) {
      const existingAssignment = await prisma.unitAssignment.findFirst({
        where: {
          profileId: profile.id,
          assignmentType: "Primary",
          endDate: null,
        },
        select: { id: true, unitId: true },
      });

      if (existingAssignment?.unitId !== unit.id) {
        if (existingAssignment) {
          await prisma.unitAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              endDate: new Date(),
              reason: `Closed by Airtable import batch ${importBatchId}.`,
            },
          });
          totals.assignmentsEnded += 1;
        }

        await prisma.unitAssignment.create({
          data: {
            profileId: profile.id,
            unitId: unit.id,
            assignmentType: "Primary",
            effectiveDate: new Date(),
            assignedByUserId: actorUser?.id || null,
            reason: `Imported from Airtable batch ${importBatchId}.`,
          },
        });
        totals.assignmentsCreated += 1;
      }
    }

    for (const staffCode of record.shop || []) {
      const staffSection = staffMap.get(staffCode);
      if (!staffSection) continue;

      const existingStaffAssignment = await prisma.staffAssignment.findFirst({
        where: {
          profileId: profile.id,
          staffSectionId: staffSection.id,
          endDate: null,
        },
        select: { id: true },
      });

      if (!existingStaffAssignment) {
        await prisma.staffAssignment.create({
          data: {
            profileId: profile.id,
            staffSectionId: staffSection.id,
            assignmentType: "StaffAssignment",
            effectiveDate: new Date(),
            assignedByUserId: actorUser?.id || null,
            reason: `Imported from Airtable batch ${importBatchId}.`,
          },
        });
        totals.staffAssignmentsCreated += 1;
      }
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: actorUser?.id || null,
        affectedProfileId: profile.id,
        module: "Airtable Import",
        action: existingProfile ? "Updated Current Member" : "Imported Current Member",
        newValue: {
          airtableId: record.airtableId,
          callsign: record.callsign,
          rank: record.mappedRank,
          status: record.mappedStatus,
          unit: record.inferredUnit,
          billet: record.billet,
          primaryMos: record.primaryMos || record.specialty || null,
          suggestedPortalRole: record.suggestedPortalRole,
          importBatchId,
        },
        reason: `Imported from validated Airtable preview batch ${importBatchId}.`,
        relatedRecordId: user.id,
        severity: "Info",
        systemGenerated: false,
      },
    });
    totals.auditLogsCreated += 1;
  }

  return {
    mode: "commit",
    previewPath,
    actorUserId: actorUser?.id || null,
    importBatchId,
    totals,
  };
}

function buildUserPayload(record) {
  const displayAlias = record.name || record.callsign || record.discordName || record.discordId;

  return {
    discordId: record.discordId,
    discordUsername: record.discordName || record.callsign || record.discordId,
    discordDisplayName: displayAlias,
    displayAlias,
    steam64Id: record.steamId || null,
    timezone: cleanText(record.timezone, 64) || null,
    accountStatus: record.mappedStatus,
  };
}

async function loadRoleMap(roleNames) {
  const roles = await prisma.role.findMany({
    where: { name: { in: roleNames } },
    select: { id: true, name: true },
  });

  const map = new Map(roles.map((role) => [role.name, role]));
  const missing = roleNames.filter((name) => !map.has(name));
  if (missing.length) {
    throw new Error(`Missing required seeded roles: ${missing.join(", ")}. Run db:seed first.`);
  }

  return map;
}

async function ensureRanks(rankCodes, commitMode) {
  const existing = await prisma.rank.findMany({
    where: { abbreviation: { in: rankCodes } },
    select: { id: true, abbreviation: true, name: true, payGrade: true },
  });
  const map = new Map(existing.map((rank) => [rank.abbreviation, rank]));

  for (const code of rankCodes) {
    if (map.has(code)) continue;
    if (!commitMode) {
      map.set(code, { id: `dry-rank-${code}`, abbreviation: code, name: code, payGrade: code });
      continue;
    }

    const created = await prisma.rank.create({
      data: buildRankData(code),
      select: { id: true, abbreviation: true, name: true, payGrade: true },
    });
    map.set(code, created);
  }

  return map;
}

async function ensureUnits(unitNames, commitMode) {
  const canonicalDefinitions = expandUnitNamesWithAncestors(unitNames);
  const canonicalNames = canonicalDefinitions.map((definition) => definition.name);
  const unknownUnitNames = unitNames.filter((name) => name && !unitDefinitionForName(name));
  const desiredUnitNames = [...new Set([...canonicalNames, ...unknownUnitNames])];

  const existing = await prisma.unit.findMany({
    where: { name: { in: desiredUnitNames } },
    select: { id: true, name: true, type: true, parentId: true, sortOrder: true },
  });
  const map = new Map(existing.map((unit) => [unit.name, unit]));

  for (const definition of unitDefinitions.filter((item) => canonicalDefinitions.some((candidate) => candidate.key === item.key))) {
    const parentName = definition.parentKey ? unitNameForKey(definition.parentKey) : null;
    const parent = parentName ? map.get(parentName) : null;
    const existingUnit = map.get(definition.name);

    if (existingUnit && !commitMode) continue;
    if (!commitMode) {
      map.set(definition.name, {
        id: `dry-unit-${definition.key}`,
        name: definition.name,
        type: definition.type,
        parentId: parent?.id || null,
        sortOrder: definition.sortOrder || 0,
      });
      continue;
    }

    const data = {
      name: definition.name,
      type: definition.type,
      parentId: parent?.id || null,
      sortOrder: definition.sortOrder || 0,
      isActive: true,
    };
    const record = existingUnit
      ? await prisma.unit.update({
          where: { id: existingUnit.id },
          data,
          select: { id: true, name: true, type: true, parentId: true, sortOrder: true },
        })
      : await prisma.unit.create({
          data,
          select: { id: true, name: true, type: true, parentId: true, sortOrder: true },
        });
    map.set(record.name, record);
  }

  for (const name of unknownUnitNames) {
    if (map.has(name)) continue;
    if (!commitMode) {
      map.set(name, { id: `dry-unit-${normalizeKey(name)}`, name, type: inferUnitType(name) });
      continue;
    }

    const created = await prisma.unit.create({
      data: {
        name,
        type: inferUnitType(name),
      },
      select: { id: true, name: true, type: true },
    });
    map.set(name, created);
  }

  return map;
}

async function ensureStaffSections(staffCodes, commitMode) {
  const existing = await prisma.staffSection.findMany({
    where: { code: { in: staffCodes } },
    select: { id: true, code: true, name: true },
  });
  const map = new Map(existing.map((section) => [section.code, section]));

  for (const code of staffCodes) {
    if (map.has(code)) continue;
    if (!commitMode) {
      map.set(code, { id: `dry-staff-${normalizeKey(code)}`, code, name: code });
      continue;
    }

    const created = await prisma.staffSection.create({
      data: {
        code,
        name: expandStaffCode(code),
      },
      select: { id: true, code: true, name: true },
    });
    map.set(code, created);
  }

  return map;
}

async function ensureBilletCategory(commitMode) {
  const existing = await prisma.billetCategory.findUnique({
    where: { name: "Imported Airtable Billets" },
    select: { id: true, name: true },
  });
  if (existing || !commitMode) {
    return existing || { id: "dry-billet-category", name: "Imported Airtable Billets" };
  }

  return prisma.billetCategory.create({
    data: { name: "Imported Airtable Billets" },
    select: { id: true, name: true },
  });
}

async function ensureBillets(records, categoryId, unitMap, commitMode) {
  const desired = records
    .filter((record) => record.billet)
    .map((record) => ({
      key: `${record.inferredUnit || ""}::${record.billet}`,
      unitId: unitMap.get(record.inferredUnit)?.id || null,
      name: record.billet,
    }));

  const unitIds = [...new Set(desired.map((item) => item.unitId).filter(Boolean))];
  const names = [...new Set(desired.map((item) => item.name))];

  const existing = await prisma.billet.findMany({
    where: {
      name: { in: names },
      OR: [{ unitId: { in: unitIds } }, { unitId: null }],
    },
    select: { id: true, name: true, unitId: true },
  });

  const map = new Map(existing.map((billet) => [`${billet.unitId || ""}::${billet.name}`, billet]));

  for (const item of desired) {
    const lookupKey = `${item.unitId || ""}::${item.name}`;
    if (map.has(lookupKey)) continue;
    if (!commitMode) {
      map.set(item.key, { id: `dry-billet-${normalizeKey(item.name)}`, name: item.name, unitId: item.unitId });
      continue;
    }

    const created = await prisma.billet.create({
      data: {
        categoryId,
        unitId: item.unitId,
        name: item.name,
      },
      select: { id: true, name: true, unitId: true },
    });
    map.set(lookupKey, created);
  }

  const normalizedMap = new Map();
  for (const item of desired) {
    const lookupKey = `${item.unitId || ""}::${item.name}`;
    const billet = map.get(lookupKey);
    if (billet) {
      normalizedMap.set(item.key, billet);
    }
  }
  return normalizedMap;
}

function buildRankData(code) {
  return {
    abbreviation: code,
    name: code,
    payGrade: code,
    category: inferRankCategory(code),
    sortOrder: rankSortOrder(code),
    isSelectable: true,
    isCommandRank: ["COL", "LTC", "MAJ", "CPT", "1LT", "2LT", "SGM", "CSM"].includes(code),
    isNcoRank: ["SGM", "CSM", "MSG", "SFC", "SSG", "SGT", "CPL"].includes(code),
    isWarrantRank: ["CW4", "CW3", "CW2"].includes(code),
    isOfficerRank: ["COL", "LTC", "MAJ", "CPT", "1LT", "2LT"].includes(code),
    isReserved: code === "RCT",
  };
}

function inferRankCategory(code) {
  if (["COL", "LTC", "MAJ", "CPT", "1LT", "2LT"].includes(code)) return "Officer";
  if (["CW4", "CW3", "CW2"].includes(code)) return "Warrant Officer";
  if (["SGM", "CSM", "MSG", "SFC", "SSG", "SGT", "CPL"].includes(code)) return "NCO";
  return "Enlisted";
}

function rankSortOrder(code) {
  const order = [
    "COL",
    "LTC",
    "MAJ",
    "CPT",
    "1LT",
    "2LT",
    "CW4",
    "CW3",
    "CW2",
    "SGM",
    "CSM",
    "MSG",
    "SFC",
    "SSG",
    "SGT",
    "CPL",
    "SPC",
    "PFC",
    "PV2",
    "PVT",
    "RCT",
  ];
  const index = order.indexOf(code);
  return index === -1 ? order.length + 1 : index + 1;
}

function inferUnitType(name) {
  if (name.includes("SFOD")) return "Troop";
  if (name.includes("SOAR")) return "Company";
  if (name.includes("Ranger")) return "Company";
  if (name.includes("Recruit")) return "TrainingPipeline";
  return "TaskForce";
}

function expandStaffCode(code) {
  const map = {
    J1: "J1 Personnel",
    J2: "J2 Intelligence",
    J3: "J3 Operations",
    J4: "J4 Logistics",
    J6: "J6 Systems",
    S1: "S1 Personnel",
    S2: "S2 Intelligence",
    S3: "S3 Operations",
    S4: "S4 Logistics",
    S6: "S6 Systems",
  };
  return map[code] || code;
}

function normalizeKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseDateOnly(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanText(value, maxLength = 1000) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}
