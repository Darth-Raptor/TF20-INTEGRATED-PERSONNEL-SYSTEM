import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultBasePath = path.join(os.homedir(), "Downloads", "TASK FORCE ROSTER-PRIMARY ROSTER.csv");
const defaultOutputPath = path.join(projectRoot, ".private", "airtable-roster.json");
const defaultExclusionsPath = path.join(projectRoot, ".private", "roster-exclusions.json");

const options = parseArgs(process.argv.slice(2));
const basePath = path.resolve(options.base || options.input || defaultBasePath);
const outputPath = path.resolve(options.output || defaultOutputPath);
const overlayPaths = options.overlays.map((overlayPath) => path.resolve(overlayPath));
const exclusionsPath = path.resolve(options.exclude || defaultExclusionsPath);
const exclusions = loadExclusions(exclusionsPath);
const shouldWrite = options.write !== false;

if (!fs.existsSync(basePath)) {
  throw new Error(`Base roster CSV not found at ${basePath}`);
}

const baseRows = readCsvRecords(basePath);
const normalizedBaseRows = baseRows.map((row, index) => normalizeRosterRow(row, { sourcePath: basePath, index }));
const baseExcludedRows = normalizedBaseRows.filter((member) => findExclusion(member, exclusions));
const roster = normalizedBaseRows.filter((member) => !findExclusion(member, exclusions));
const overlayReport = applyOverlays(roster, overlayPaths, exclusions);
const summary = buildSummary(roster, {
  basePath,
  baseRows,
  baseExcludedRows,
  overlayPaths,
  overlayReport,
  exclusionsPath,
  exclusions,
});

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    baseCsv: basePath,
    overlayCsvs: overlayPaths,
    exclusions: exclusions.length ? exclusionsPath : null,
  },
  roster,
  summary,
};

if (shouldWrite) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}

console.log(
  JSON.stringify(
    {
      outputPath: shouldWrite ? outputPath : null,
      basePath,
      overlayPaths,
      generatedAt: payload.generatedAt,
      counts: summary.counts,
      missing: summary.missing,
      overlays: overlayReport.totals,
      exclusions: summary.exclusions,
    },
    null,
    2,
  ),
);

function parseArgs(args) {
  const parsed = {
    overlays: [],
    write: true,
  };

  for (const arg of args) {
    if (arg === "--no-write" || arg === "--write=false") {
      parsed.write = false;
      continue;
    }

    const separator = arg.indexOf("=");
    const key = separator === -1 ? arg : arg.slice(0, separator);
    const value = separator === -1 ? "true" : arg.slice(separator + 1);

    if (key === "--base" || key === "--input") parsed.base = value;
    if (key === "--output") parsed.output = value;
    if (key === "--overlay") parsed.overlays.push(value);
    if (key === "--exclude") parsed.exclude = value;
  }

  return parsed;
}

function loadExclusions(exclusionPath) {
  if (!fs.existsSync(exclusionPath)) return [];

  const payload = JSON.parse(fs.readFileSync(exclusionPath, "utf8"));
  const entries = Array.isArray(payload) ? payload : payload.members || payload.exclusions || [];
  return entries.map((entry) => ({
    ...entry,
    name: cleanText(entry.name),
    callsign: cleanText(entry.callsign),
    discordId: normalizeSnowflake(entry.discordId),
    steamId: normalizeSteamId(entry.steamId),
    reason: cleanText(entry.reason) || "Excluded from active roster import.",
  }));
}

function readCsvRecords(csvPath) {
  const text = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text).filter((row) => row.some((cell) => cleanText(cell)));
  if (!rows.length) return [];

  const headers = rows[0].map((header) => cleanText(header));
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });
    return record;
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else if (char === "\r") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      if (text[index + 1] === "\n") index += 1;
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function normalizeRosterRow(row, { sourcePath, index }) {
  const name = field(row, "displayAlias", "Display Alias", "Name", "NAME");
  const callsign = field(row, "CS", "CS (from NAME)", "Callsign", "Call Sign", "callsign");
  const discordName = field(
    row,
    "DISCORD NAME",
    "DISCORD NAME (from NAME)",
    "Discord Name",
    "Discord Username",
    "discordName",
  );
  const primaryMos = field(row, "PRIMARY MOS", "Primary MOS", "primaryMOS", "primaryMos", "specialty");

  return {
    airtableId: field(row, "airtableId", "Airtable ID", "Record ID") || `csv:${index + 1}:${slug(name || callsign || discordName || "member")}`,
    name,
    callsign,
    dateOfEnlistment: field(row, "DATE OF ENLISTMENT", "Date of Enlistment", "dateOfEnlistment"),
    discordName,
    discordDisplayName: field(row, "DISCORD DISPLAY NAME", "Discord Display Name", "discordDisplayName"),
    discordId: normalizeSnowflake(
      field(row, "DISCORD ID #", "DISCORD ID # (from NAME)", "DISCORD ID", "Discord ID", "discordId"),
    ),
    steamId: normalizeSteamId(
      field(row, "STEAM ID #", "STEAM ID # (from NAME)", "STEAM64", "Steam64", "steam64Id", "steamId"),
    ),
    steamProfile: field(row, "STEAM PROFILE LINK", "Steam Profile", "steamProfile"),
    timezone: field(row, "TIME ZONE", "Timezone", "timeZone", "timezone"),
    timeInService: field(row, "TIS", "Time In Service", "timeInService"),
    assignedTo: field(row, "ASSIGNED TO", "Assigned To", "assignedTo"),
    status: field(row, "STATUS", "Status", "status"),
    rank: field(row, "RANK", "Rank", "rank"),
    shop: stringList(field(row, "SHOP", "Shop", "shop")),
    source: path.basename(sourcePath),
    billet: field(row, "BILLET", "BILLET (NEW)", "Billet", "New Billet", "billet"),
    primaryMos,
    specialty: primaryMos,
    platoon: field(row, "PLATOON", "Platoon", "platoon"),
    squad: field(row, "SQUAD", "Squad", "squad"),
    fireTeam: field(row, "FIRE TEAM", "Fire Team", "fireTeam"),
    iet: stringList(field(row, "IET", "iet")),
    serverPermissions: stringList(field(row, "SERVER PERMISSIONS", "Server Permissions", "serverPermissions")),
  };
}

function applyOverlays(roster, overlayPaths, exclusions) {
  const report = {
    totals: {
      files: overlayPaths.length,
      rows: 0,
      rowsMerged: 0,
      membersUpdated: 0,
      unresolvedRows: 0,
      ambiguousRows: 0,
      excludedRows: 0,
    },
    files: [],
  };

  if (!overlayPaths.length) return report;

  const indexes = buildRosterIndexes(roster);

  for (const overlayPath of overlayPaths) {
    if (!fs.existsSync(overlayPath)) {
      throw new Error(`Overlay CSV not found at ${overlayPath}`);
    }

    const rows = readCsvRecords(overlayPath);
    const fileReport = {
      path: overlayPath,
      rows: rows.length,
      rowsMerged: 0,
      membersUpdated: 0,
      unresolvedRows: [],
      ambiguousRows: [],
      excludedRows: [],
    };

    for (const [index, row] of rows.entries()) {
      report.totals.rows += 1;
      const overlay = normalizeRosterRow(row, { sourcePath: overlayPath, index });
      if (!overlay.assignedTo) overlay.assignedTo = inferAssignedToFromFilename(overlayPath);
      const exclusion = findExclusion(overlay, exclusions);
      if (exclusion) {
        fileReport.excludedRows.push({
          ...summarizeOverlayRow(overlay, index),
          reason: exclusion.reason,
        });
        report.totals.excludedRows += 1;
        continue;
      }

      const match = findOverlayMatches(overlay, indexes);

      if (match.status === "unresolved") {
        fileReport.unresolvedRows.push(summarizeOverlayRow(overlay, index));
        report.totals.unresolvedRows += 1;
        continue;
      }

      if (match.status === "ambiguous") {
        fileReport.ambiguousRows.push(summarizeOverlayRow(overlay, index));
        report.totals.ambiguousRows += 1;
        continue;
      }

      let rowUpdated = false;
      for (const member of match.members) {
        const updated = mergeOverlayMember(member, overlay);
        if (updated.length) {
          rowUpdated = true;
          fileReport.membersUpdated += 1;
          report.totals.membersUpdated += 1;
        }
      }

      if (rowUpdated) {
        fileReport.rowsMerged += 1;
        report.totals.rowsMerged += 1;
      }
    }

    report.files.push(fileReport);
  }

  return report;
}

function buildRosterIndexes(roster) {
  const indexes = {
    discordId: new Map(),
    steamId: new Map(),
    name: new Map(),
    callsign: new Map(),
  };

  roster.forEach((member) => {
    addIndexValue(indexes.discordId, member.discordId, member);
    addIndexValue(indexes.steamId, member.steamId, member);
    addIndexValue(indexes.name, member.name, member);
    addIndexValue(indexes.callsign, member.callsign, member);
  });

  return indexes;
}

function addIndexValue(index, value, member) {
  const key = normalizeIdentity(value);
  if (!key) return;
  const list = index.get(key) || [];
  list.push(member);
  index.set(key, list);
}

function findOverlayMatches(overlay, indexes) {
  const directMatches = [
    ...lookupIndex(indexes.discordId, overlay.discordId),
    ...lookupIndex(indexes.steamId, overlay.steamId),
  ];
  if (directMatches.length === 1) return { status: "matched", members: uniqueMembers(directMatches) };
  if (directMatches.length > 1) return { status: "ambiguous", members: uniqueMembers(directMatches) };

  const refs = referenceValues(overlay.name, overlay.callsign, overlay.discordName);
  const matched = [];
  let ambiguous = false;

  for (const ref of refs) {
    const refMatches = [
      ...lookupIndex(indexes.name, ref),
      ...lookupIndex(indexes.callsign, ref),
    ];

    const unique = uniqueMembers(refMatches);
    if (unique.length > 1) ambiguous = true;
    if (unique.length === 1) matched.push(unique[0]);
  }

  const members = uniqueMembers(matched);
  if (ambiguous) return { status: "ambiguous", members };
  if (!members.length) return { status: "unresolved", members: [] };
  return { status: "matched", members };
}

function lookupIndex(index, value) {
  return index.get(normalizeIdentity(value)) || [];
}

function uniqueMembers(members) {
  return [...new Set(members)];
}

function referenceValues(...values) {
  const refs = new Set();
  for (const value of values) {
    const text = cleanText(value);
    if (!text) continue;
    refs.add(text);
    for (const part of text.split(/[;,]/)) {
      if (cleanText(part)) refs.add(cleanText(part));
    }
  }
  return [...refs];
}

function mergeOverlayMember(member, overlay) {
  const updated = [];
  const scalarFields = ["billet", "primaryMos", "specialty", "platoon", "squad", "fireTeam"];

  for (const key of scalarFields) {
    const value = cleanText(overlay[key]);
    if (value && member[key] !== value) {
      member[key] = value;
      updated.push(key);
    }
  }

  if (!member.assignedTo && cleanText(overlay.assignedTo)) {
    member.assignedTo = cleanText(overlay.assignedTo);
    updated.push("assignedTo");
  }

  const listFields = ["shop", "iet", "serverPermissions"];
  for (const key of listFields) {
    const values = overlay[key] || [];
    const merged = [...new Set([...(member[key] || []), ...values])];
    if (merged.length !== (member[key] || []).length) {
      member[key] = merged;
      updated.push(key);
    }
  }

  return updated;
}

function buildSummary(roster, { basePath, baseRows, baseExcludedRows, overlayPaths, overlayReport, exclusionsPath, exclusions }) {
  return {
    generatedAt: new Date().toISOString(),
    baseCsv: basePath,
    overlayCsvs: overlayPaths,
    exclusionsPath: exclusions.length ? exclusionsPath : null,
    counts: {
      primaryRoster: baseRows.length,
      baseRowsExcluded: baseExcludedRows.length,
      overlays: overlayPaths.length,
      roster: roster.length,
    },
    status: countBy(roster, "status"),
    assignedTo: countBy(roster, "assignedTo"),
    missing: {
      callsign: roster.filter((member) => !member.callsign).length,
      discordId: roster.filter((member) => !member.discordId).length,
      steamId: roster.filter((member) => !member.steamId).length,
      billet: roster.filter((member) => !member.billet).length,
      primaryMos: roster.filter((member) => !member.primaryMos).length,
    },
    exclusions: {
      configured: exclusions.length,
      baseRowsExcluded: baseExcludedRows.length,
      overlayRowsExcluded: overlayReport.totals.excludedRows,
    },
    overlays: overlayReport,
  };
}

function findExclusion(member, exclusions) {
  return exclusions.find((exclusion) => {
    if (exclusion.discordId && exclusion.discordId === member.discordId) return true;
    if (exclusion.steamId && exclusion.steamId === member.steamId) return true;
    if (exclusion.name && normalizeIdentity(exclusion.name) === normalizeIdentity(member.name)) return true;
    if (exclusion.callsign && normalizeIdentity(exclusion.callsign) === normalizeIdentity(member.callsign)) return true;
    return false;
  });
}

function summarizeOverlayRow(overlay, index) {
  return {
    rowNumber: index + 2,
    name: overlay.name || null,
    callsign: overlay.callsign || null,
    discordId: overlay.discordId || null,
    steamId: overlay.steamId || null,
    billet: overlay.billet || null,
    primaryMos: overlay.primaryMos || null,
  };
}

function inferAssignedToFromFilename(csvPath) {
  const name = path.basename(csvPath, path.extname(csvPath));
  return name
    .replace(/^.+[-_](?=[^-_]+$)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function field(row, ...aliases) {
  const wanted = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normalizeHeader(key))) return cleanText(value);
  }
  return "";
}

function normalizeHeader(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeIdentity(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeSnowflake(value) {
  return cleanText(value).replace(/\D/g, "");
}

function normalizeSteamId(value) {
  return cleanText(value).replace(/\D/g, "");
}

function stringList(value) {
  return cleanText(value)
    .split(/[;,]/)
    .map((item) => cleanText(item))
    .filter(Boolean);
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "Unassigned";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function slug(value) {
  return normalizeIdentity(value) || "member";
}

function cleanText(value) {
  return String(value ?? "").trim();
}
