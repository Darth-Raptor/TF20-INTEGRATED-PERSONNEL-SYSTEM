import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultInputPath = path.join(projectRoot, ".private", "airtable-roster.json");
const defaultOutputPath = path.join(projectRoot, ".private", "airtable-import-preview.json");

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split("=");
  if (key.startsWith("--")) {
    args.set(key, value ?? "true");
  }
}

const inputPath = path.resolve(args.get("--input") || defaultInputPath);
const outputPath = path.resolve(args.get("--output") || defaultOutputPath);
const shouldWrite = args.get("--write") !== "false";

if (!fs.existsSync(inputPath)) {
  throw new Error(`Input roster export not found at ${inputPath}`);
}

const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const roster = Array.isArray(payload.roster) ? payload.roster : [];

const report = buildPreviewReport(roster, payload);

if (shouldWrite) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
}

console.log(
  JSON.stringify(
    {
      inputPath,
      outputPath: shouldWrite ? outputPath : null,
      generatedAt: report.generatedAt,
      totals: report.summary.totals,
      validation: report.summary.validation,
      unresolvedCounts: report.summary.unresolvedCounts,
    },
    null,
    2,
  ),
);

function buildPreviewReport(rosterRows, payloadRoot) {
  const normalizedMembers = rosterRows.map(normalizeRosterMember);

  const duplicateDiscordIds = findDuplicates(normalizedMembers, "discordId");
  const duplicateSteamIds = findDuplicates(normalizedMembers, "steamId");
  const duplicateCallsigns = findDuplicates(normalizedMembers, "callsign");

  const missingDiscordForCurrentMembers = normalizedMembers.filter(
    (member) => member.isCurrentMember && !member.discordId,
  );
  const missingSteamForCurrentMembers = normalizedMembers.filter(
    (member) => member.isCurrentMember && !member.steamId,
  );
  const unmappedStatuses = normalizedMembers.filter((member) => !member.mappedStatus);
  const unmappedRanks = normalizedMembers.filter((member) => !member.mappedRank);
  const unmappedUnits = normalizedMembers.filter((member) => !member.inferredUnit);
  const unmappedBillets = normalizedMembers.filter((member) => !member.billet);

  const warnings = [];
  if (duplicateDiscordIds.length) warnings.push(`Duplicate Discord IDs: ${duplicateDiscordIds.length}`);
  if (duplicateSteamIds.length) warnings.push(`Duplicate Steam IDs: ${duplicateSteamIds.length}`);
  if (duplicateCallsigns.length) warnings.push(`Duplicate callsigns: ${duplicateCallsigns.length}`);
  if (missingDiscordForCurrentMembers.length) {
    warnings.push(`Current-member records missing Discord IDs: ${missingDiscordForCurrentMembers.length}`);
  }
  if (unmappedStatuses.length) warnings.push(`Records with unmapped status values: ${unmappedStatuses.length}`);
  if (unmappedRanks.length) warnings.push(`Records with unmapped rank values: ${unmappedRanks.length}`);
  if (unmappedUnits.length) warnings.push(`Records with unresolved unit mapping: ${unmappedUnits.length}`);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      inputPath,
      exportGeneratedAt: payloadRoot.generatedAt || null,
      baseId: payloadRoot.baseId || payloadRoot.summary?.baseId || null,
    },
    summary: {
      totals: {
        rosterRecords: normalizedMembers.length,
        currentMembers: normalizedMembers.filter((member) => member.isCurrentMember).length,
        pendingOrFormerMembers: normalizedMembers.filter((member) => !member.isCurrentMember).length,
      },
      validation: {
        ok: warnings.length === 0,
        warningCount: warnings.length,
        warnings,
      },
      unresolvedCounts: {
        duplicateDiscordIds: duplicateDiscordIds.length,
        duplicateSteamIds: duplicateSteamIds.length,
        duplicateCallsigns: duplicateCallsigns.length,
        missingDiscordForCurrentMembers: missingDiscordForCurrentMembers.length,
        missingSteamForCurrentMembers: missingSteamForCurrentMembers.length,
        unmappedStatuses: unmappedStatuses.length,
        unmappedRanks: unmappedRanks.length,
        unmappedUnits: unmappedUnits.length,
        missingBillets: unmappedBillets.length,
      },
      countsByMappedStatus: countBy(normalizedMembers, "mappedStatus", "Unmapped"),
      countsByInferredUnit: countBy(normalizedMembers, "inferredUnit", "Unmapped"),
      countsBySuggestedRole: countBy(normalizedMembers, "suggestedPortalRole", "Unassigned"),
    },
    referenceValues: {
      rawStatuses: distinctValues(normalizedMembers, "rawStatus"),
      rawRanks: distinctValues(normalizedMembers, "rawRank"),
      rawAssignedTo: distinctValues(normalizedMembers, "rawAssignedTo"),
      rawShops: [...new Set(normalizedMembers.flatMap((member) => member.shop))].sort(),
    },
    issues: {
      duplicateDiscordIds,
      duplicateSteamIds,
      duplicateCallsigns,
      missingDiscordForCurrentMembers: summarizeMembers(missingDiscordForCurrentMembers),
      missingSteamForCurrentMembers: summarizeMembers(missingSteamForCurrentMembers),
      unmappedStatuses: summarizeMembers(unmappedStatuses, ["rawStatus"]),
      unmappedRanks: summarizeMembers(unmappedRanks, ["rawRank"]),
      unmappedUnits: summarizeMembers(unmappedUnits, ["rawAssignedTo", "platoon", "squad"]),
      missingBillets: summarizeMembers(unmappedBillets, ["rawAssignedTo"]),
    },
    previewRecords: normalizedMembers.map((member) => ({
      airtableId: member.airtableId,
      name: member.name,
      callsign: member.callsign,
      discordName: member.discordName || null,
      discordId: member.discordId || null,
      steamId: member.steamId || null,
      dateOfEnlistment: member.dateOfEnlistment || null,
      rawStatus: member.rawStatus,
      mappedStatus: member.mappedStatus,
      rawRank: member.rawRank,
      mappedRank: member.mappedRank,
      rawAssignedTo: member.rawAssignedTo,
      inferredUnit: member.inferredUnit,
      billet: member.billet || null,
      specialty: member.specialty || null,
      shop: member.shop,
      suggestedPortalRole: member.suggestedPortalRole,
      importAction: member.importAction,
      validationFlags: member.validationFlags,
    })),
  };
}

function normalizeRosterMember(row) {
  const rawStatus = cleanText(row.status);
  const rawRank = cleanText(row.rank).toUpperCase();
  const rawAssignedTo = cleanText(row.assignedTo);
  const callsign = cleanText(row.callsign);
  const discordId = normalizeSnowflake(row.discordId);
  const steamId = normalizeSteamId(row.steamId);
  const mappedStatus = mapStatus(rawStatus);
  const mappedRank = mapRank(rawRank);
  const inferredUnit = inferUnit({ rawAssignedTo, billet: row.billet, platoon: row.platoon, squad: row.squad, shop: row.shop });
  const shop = normalizeStringList(row.shop);
  const isCurrentMember = isCurrentStatus(mappedStatus);
  const suggestedPortalRole = suggestPortalRole({ mappedStatus, rawAssignedTo, billet: row.billet, shop });

  const validationFlags = [];
  if (!mappedStatus) validationFlags.push("unmapped-status");
  if (!mappedRank) validationFlags.push("unmapped-rank");
  if (!inferredUnit) validationFlags.push("unmapped-unit");
  if (!cleanText(row.billet)) validationFlags.push("missing-billet");
  if (isCurrentMember && !discordId) validationFlags.push("missing-discord-id");
  if (isCurrentMember && !steamId) validationFlags.push("missing-steam-id");

  return {
    airtableId: row.airtableId,
    name: cleanText(row.name),
    callsign,
    dateOfEnlistment: cleanText(row.dateOfEnlistment),
    discordName: cleanText(row.discordName),
    discordId,
    steamId,
    rawStatus,
    mappedStatus,
    rawRank,
    mappedRank,
    rawAssignedTo,
    inferredUnit,
    billet: cleanText(row.billet),
    specialty: cleanText(row.specialty),
    platoon: cleanText(row.platoon),
    squad: cleanText(row.squad),
    shop,
    isCurrentMember,
    suggestedPortalRole,
    importAction: discordId ? "upsert-user-and-profile" : "manual-link-required",
    validationFlags,
  };
}

function mapStatus(rawStatus) {
  const value = normalizeKey(rawStatus);
  if (!value) return null;

  const statusMap = {
    active: "Active",
    reserve: "Reserve",
    reserves: "Reserve",
    loa: "LeaveOfAbsence",
    leaveofabsence: "LeaveOfAbsence",
    leave_absence: "LeaveOfAbsence",
    probationarymember: "ProbationaryMember",
    probationary: "ProbationaryMember",
    recruit: "Recruit",
    applicant: "Applicant",
    inactive: "Inactive",
    discharged: "Discharged",
    retired: "Inactive",
    banneddonotrehire: "BannedDoNotRehire",
    banned: "BannedDoNotRehire",
    donotrehire: "BannedDoNotRehire",
  };

  return statusMap[value] || null;
}

function mapRank(rawRank) {
  const value = normalizeKey(rawRank);
  if (!value) return null;

  const rankMap = {
    col: "COL",
    ltc: "LTC",
    maj: "MAJ",
    cpt: "CPT",
    "1lt": "1LT",
    "2lt": "2LT",
    cw4: "CW4",
    cw3: "CW3",
    cw2: "CW2",
    sgm: "SGM",
    csm: "CSM",
    msg: "MSG",
    sfc: "SFC",
    ssg: "SSG",
    sgt: "SGT",
    cpl: "CPL",
    spc: "SPC",
    pfc: "PFC",
    pv2: "PV2",
    pvt: "PVT",
    rct: "RCT",
  };

  return rankMap[value] || null;
}

function inferUnit({ rawAssignedTo, billet, platoon, squad, shop }) {
  const text = [rawAssignedTo, billet, platoon, squad, ...normalizeStringList(shop)].map(normalizeKey).join(" ");

  if (!text) return null;
  if (text.includes("sfod") || text.includes("delta")) return "1 Troop, A Squadron, 1st SFOD-Delta";
  if (text.includes("160th") || text.includes("soar") || text.includes("aviation")) return "B Co, 2/160th SOAR";
  if (text.includes("75th") || text.includes("ranger")) return "A Co, 1/75th Ranger Regiment";
  if (text.includes("recruit")) return "Recruit Holding / Training Pipeline";
  if (text.includes("command") || text.includes("headquarters") || text.includes("hhc")) return "Task Force 20";
  if (text.includes("s1") || text.includes("s2") || text.includes("s3") || text.includes("s4") || text.includes("s6")) {
    return "Task Force 20";
  }

  return null;
}

function suggestPortalRole({ mappedStatus, rawAssignedTo, billet, shop }) {
  if (!isCurrentStatus(mappedStatus)) return "Applicant";

  const text = [rawAssignedTo, billet, ...shop].map(normalizeKey).join(" ");

  if (text.includes("system") || text.includes("s6") || text.includes("j6")) return "System Admin";
  if (text.includes("command") || text.includes("commander") || text.includes("xo") || text.includes("1sg")) {
    return "Command Staff";
  }
  if (text.includes("recruit")) return "Recruiter";
  if (
    text.includes("s1") ||
    text.includes("s2") ||
    text.includes("s3") ||
    text.includes("s4") ||
    text.includes("j1") ||
    text.includes("j2") ||
    text.includes("j3") ||
    text.includes("j4") ||
    text.includes("staff")
  ) {
    return "Staff";
  }
  return "Member";
}

function isCurrentStatus(status) {
  return ["Recruit", "ProbationaryMember", "Active", "Reserve", "LeaveOfAbsence"].includes(status);
}

function findDuplicates(rows, key) {
  const groups = new Map();

  for (const row of rows) {
    const value = cleanText(row[key]);
    if (!value) continue;
    const list = groups.get(value) || [];
    list.push(row);
    groups.set(value, list);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([value, list]) => ({
      value,
      count: list.length,
      members: summarizeMembers(list),
    }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function summarizeMembers(rows, extraKeys = []) {
  return rows.map((row) => {
    const summary = {
      airtableId: row.airtableId,
      name: row.name,
      callsign: row.callsign || null,
      discordId: row.discordId || null,
      steamId: row.steamId || null,
      mappedStatus: row.mappedStatus || null,
      inferredUnit: row.inferredUnit || null,
      billet: row.billet || null,
    };

    for (const key of extraKeys) {
      summary[key] = row[key] || null;
    }

    return summary;
  });
}

function countBy(rows, key, fallback) {
  return rows.reduce((counts, row) => {
    const value = row[key] || fallback;
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function distinctValues(rows, key) {
  return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort();
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeSnowflake(value) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits || "";
}

function normalizeSteamId(value) {
  const digits = cleanText(value).replace(/\D/g, "");
  return digits || "";
}

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  return [cleanText(value)].filter(Boolean);
}
