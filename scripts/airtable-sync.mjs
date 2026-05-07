import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dns.setDefaultResultOrder("ipv4first");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mapPath = path.join(projectRoot, "config", "airtable-map.json");
const airtableMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));

const defaultTokenFile =
  "/Volumes/HOWMedia/DOCUMENTS/Other/Personal/TASK FORCE 20 WEBSITE/AIRTABLE TOKEN.rtf";

const args = new Set(process.argv.slice(2));
const exportPrivate = args.has("--export-private");
const verbose = args.has("--verbose");

const token = loadToken();
const headers = { Authorization: `Bearer ${token}` };

const [rosterRecords, sfodRecords, rangerRecords, soarRecords, applicationRecords] =
  await Promise.all([
    fetchAllRecords(airtableMap.tables.taskForceRoster.id, {
      view: airtableMap.tables.taskForceRoster.primaryView,
    }),
    fetchAllRecords(airtableMap.tables.sfod.id),
    fetchAllRecords(airtableMap.tables.rangers.id),
    fetchAllRecords(airtableMap.tables.soar.id),
    fetchAllRecords(airtableMap.tables.applications.id),
  ]);

const unitAssignments = new Map();
addUnitAssignments(unitAssignments, "1 Troop, A Squadron, 1st SFOD-Delta", sfodRecords, {
  billet: "BILLET",
  link: "NAME",
  assignedTo: "ASSIGNED TO",
  primaryMos: "PRIMARY MOS",
});
addUnitAssignments(unitAssignments, "A Co 1/75th RR", rangerRecords, {
  billet: "BILLET",
  link: "NAME",
  platoon: "PLATOON",
  primaryMos: "PRIMARY MOS",
  iet: "IET",
  fireTeam: "FIRE TEAM",
  squad: "SQUAD",
  serverPermissions: "SERVER PERMISSIONS",
});
addUnitAssignments(unitAssignments, "B Co 2/160th SOAR", soarRecords, {
  billet: "BILLET",
  link: "NAME",
  platoon: "PLATOON",
  primaryMos: "PRIMARY MOS",
  iet: "IET",
  fireTeam: "FIRE TEAM",
  squad: "SQUAD",
});

const roster = rosterRecords.map((record) => normalizeRosterRecord(record, unitAssignments));
const summary = buildSummary(roster, {
  rosterRecords,
  sfodRecords,
  rangerRecords,
  soarRecords,
  applicationRecords,
});

if (exportPrivate) {
  const outputDir = path.join(projectRoot, ".private");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "airtable-roster.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseId: airtableMap.baseId,
        roster,
        summary,
      },
      null,
      2,
    ),
  );
  console.log(`Private Airtable roster export written to ${outputPath}`);
} else {
  console.log(JSON.stringify(summary, null, 2));
  if (!verbose) {
    console.log("Run with --export-private to write full roster data to .private/airtable-roster.json.");
  }
}

function loadToken() {
  if (process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN.trim();

  const tokenFile = process.env.AIRTABLE_TOKEN_FILE || defaultTokenFile;
  const tokenText = fs.readFileSync(tokenFile, "utf8");
  const tokenMatch = tokenText.match(/pat[A-Za-z0-9]+\.[A-Za-z0-9]+/);
  if (!tokenMatch) {
    throw new Error("No Airtable personal access token found. Set AIRTABLE_TOKEN or AIRTABLE_TOKEN_FILE.");
  }
  return tokenMatch[0];
}

async function fetchAllRecords(tableId, options = {}) {
  const records = [];
  let offset = "";
  do {
    const url = new URL(`https://api.airtable.com/v0/${airtableMap.baseId}/${tableId}`);
    url.searchParams.set("pageSize", "100");
    if (options.view) url.searchParams.set("view", options.view);
    if (offset) url.searchParams.set("offset", offset);

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Airtable request failed for ${tableId}: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    records.push(...data.records);
    offset = data.offset || "";
  } while (offset);
  return records;
}

function addUnitAssignments(assignments, element, records, fieldMap) {
  for (const record of records) {
    const linkedMembers = arrayValue(record.fields[fieldMap.link]);
    for (const memberId of linkedMembers) {
      assignments.set(memberId, {
        element,
        billet: record.fields[fieldMap.billet] || "",
        assignedTo: record.fields[fieldMap.assignedTo] || "",
        platoon: record.fields[fieldMap.platoon] || "",
        primaryMos: record.fields[fieldMap.primaryMos] || "",
        iet: arrayValue(record.fields[fieldMap.iet]),
        fireTeam: record.fields[fieldMap.fireTeam] || "",
        squad: record.fields[fieldMap.squad] || "",
        serverPermissions: arrayValue(record.fields[fieldMap.serverPermissions]),
      });
    }
  }
}

function normalizeRosterRecord(record, assignments) {
  const fields = record.fields || {};
  const unit = assignments.get(record.id) || {};
  return {
    airtableId: record.id,
    name: fields.Name || "",
    rank: fields.RANK || "",
    callsign: fields.CS || "",
    dateOfEnlistment: fields["DATE OF ENLISTMENT"] || "",
    discordName: fields["DISCORD NAME"] || "",
    discordId: fields["DISCORD ID #"] || "",
    steamId: fields["STEAM ID #"] || "",
    steamProfile: fields["STEAM PROFILE LINK"] || "",
    timeInService: fields.TIS || "",
    assignedTo: fields["ASSIGNED TO"] || unit.element || "",
    status: fields.STATUS || "",
    shop: arrayValue(fields.SHOP),
    source: fields.SOURCE || "",
    recruiterIds: arrayValue(fields.RECRUITER),
    billet: unit.billet || "",
    primaryMos: unit.primaryMos || "",
    specialty: unit.primaryMos || "",
    platoon: unit.platoon || unit.assignedTo || "",
    squad: unit.squad || "",
    fireTeam: unit.fireTeam || "",
    iet: unit.iet || [],
    serverPermissions: unit.serverPermissions || [],
  };
}

function buildSummary(roster, raw) {
  return {
    baseId: airtableMap.baseId,
    generatedAt: new Date().toISOString(),
    counts: {
      primaryRoster: raw.rosterRecords.length,
      sfodBillets: raw.sfodRecords.length,
      rangerBillets: raw.rangerRecords.length,
      soarBillets: raw.soarRecords.length,
      applications: raw.applicationRecords.length,
    },
    status: countBy(roster, "status"),
    assignedTo: countBy(roster, "assignedTo"),
    missing: {
      callsign: roster.filter((member) => !member.callsign).length,
      discordId: roster.filter((member) => !member.discordId).length,
      steamId: roster.filter((member) => !member.steamId).length,
      billet: roster.filter((member) => !member.billet).length,
      specialty: roster.filter((member) => !member.specialty).length,
    },
  };
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] || "Unassigned";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function arrayValue(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
