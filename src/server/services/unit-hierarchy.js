const activeMemberStatuses = new Set(["Recruit", "ProbationaryMember", "Active", "Reserve", "LeaveOfAbsence"]);

export const unitDefinitions = [
  {
    key: "tf20",
    name: "Task Force 20",
    type: "TaskForce",
    sortOrder: 10,
    aliases: ["TF20"],
  },
  {
    key: "tf20-hhc",
    name: "Task Force 20 HHC",
    type: "Headquarters",
    parentKey: "tf20",
    sortOrder: 10,
    aliases: ["HHC", "TF20 HHC"],
  },
  {
    key: "aco",
    name: "A Co, 1/75th Ranger Regiment",
    type: "Company",
    parentKey: "tf20",
    sortOrder: 20,
    aliases: ["A Co 1/75th RR", "ACo 1/75th RR", "A Company 1/75th Ranger Regiment"],
  },
  {
    key: "aco-1plt",
    name: "1st Platoon, A Co 1/75th RR",
    type: "Platoon",
    parentKey: "aco",
    sortOrder: 10,
    aliases: ["1st Platoon"],
  },
  {
    key: "aco-1plt-1sq",
    name: "1st Squad, 1st Platoon, A Co 1/75th RR",
    type: "Squad",
    parentKey: "aco-1plt",
    sortOrder: 10,
    aliases: ["1st Squad"],
  },
  {
    key: "aco-1plt-1sq-a",
    name: "A Team, 1st Squad, 1st Platoon, A Co 1/75th RR",
    type: "Team",
    parentKey: "aco-1plt-1sq",
    sortOrder: 10,
    aliases: ["Alpha Team, 1st Squad", "A Team 1st Squad"],
  },
  {
    key: "aco-1plt-1sq-b",
    name: "B Team, 1st Squad, 1st Platoon, A Co 1/75th RR",
    type: "Team",
    parentKey: "aco-1plt-1sq",
    sortOrder: 20,
    aliases: ["Bravo Team, 1st Squad", "B Team 1st Squad"],
  },
  {
    key: "aco-1plt-2sq",
    name: "2nd Squad, 1st Platoon, A Co 1/75th RR",
    type: "Squad",
    parentKey: "aco-1plt",
    sortOrder: 20,
    aliases: ["2nd Squad"],
  },
  {
    key: "aco-1plt-2sq-a",
    name: "A Team, 2nd Squad, 1st Platoon, A Co 1/75th RR",
    type: "Team",
    parentKey: "aco-1plt-2sq",
    sortOrder: 10,
    aliases: ["Alpha Team, 2nd Squad", "A Team 2nd Squad"],
  },
  {
    key: "aco-1plt-2sq-b",
    name: "B Team, 2nd Squad, 1st Platoon, A Co 1/75th RR",
    type: "Team",
    parentKey: "aco-1plt-2sq",
    sortOrder: 20,
    aliases: ["Bravo Team, 2nd Squad", "B Team 2nd Squad"],
  },
  {
    key: "sfod",
    name: "1 Troop, A Squadron, 1st SFOD-Delta",
    type: "Troop",
    parentKey: "tf20",
    sortOrder: 30,
    aliases: ["1st SFOD-D", "1 Troop SFOD-D", "1st SFOD-Delta"],
  },
  {
    key: "sfod-a",
    name: "A Team, 1 Troop, A Squadron, 1st SFOD-Delta",
    type: "Team",
    parentKey: "sfod",
    sortOrder: 10,
    aliases: ["SFOD A Team", "A Team SFOD-D"],
  },
  {
    key: "sfod-b",
    name: "B Team, 1 Troop, A Squadron, 1st SFOD-Delta",
    type: "Team",
    parentKey: "sfod",
    sortOrder: 20,
    aliases: ["SFOD B Team", "B Team SFOD-D"],
  },
  {
    key: "soar",
    name: "B Co, 2/160th SOAR",
    type: "Company",
    parentKey: "tf20",
    sortOrder: 40,
    aliases: ["B Company 2/160th SOAR", "160th SOAR"],
  },
  {
    key: "recruit-pipeline",
    name: "Recruit Holding / Training Pipeline",
    type: "TrainingPipeline",
    parentKey: "tf20",
    sortOrder: 90,
    aliases: ["Recruit Holding", "Training Pipeline"],
  },
];

export const standardBilletDefinitions = [
  { unitKey: "tf20-hhc", name: "Commanding Officer", category: "Command Staff Billets" },
  { unitKey: "tf20-hhc", name: "Executive Officer", category: "Command Staff Billets" },
  { unitKey: "tf20-hhc", name: "Noncommissioned Officer in Charge", category: "Command Staff Billets" },
  { unitKey: "aco", name: "Commanding Officer", category: "Staff Billets" },
  { unitKey: "aco", name: "Executive Officer", category: "Staff Billets" },
  { unitKey: "aco-1plt", name: "Platoon Leader", category: "Staff Billets" },
  { unitKey: "aco-1plt", name: "Platoon Sergeant", category: "Staff Billets" },
  { unitKey: "aco-1plt-1sq", name: "Squad Leader", category: "Staff Billets" },
  { unitKey: "aco-1plt-2sq", name: "Squad Leader", category: "Staff Billets" },
  { unitKey: "aco-1plt-1sq-a", name: "Team Leader", category: "Staff Billets" },
  { unitKey: "aco-1plt-1sq-b", name: "Team Leader", category: "Staff Billets" },
  { unitKey: "aco-1plt-2sq-a", name: "Team Leader", category: "Staff Billets" },
  { unitKey: "aco-1plt-2sq-b", name: "Team Leader", category: "Staff Billets" },
  { unitKey: "sfod-a", name: "Team Leader", category: "Staff Billets" },
  { unitKey: "sfod-a", name: "Assistant Team Leader", category: "Staff Billets" },
  { unitKey: "sfod-b", name: "Team Leader", category: "Staff Billets" },
  { unitKey: "sfod-b", name: "Assistant Team Leader", category: "Staff Billets" },
  { unitKey: "soar", name: "Commanding Officer", category: "Staff Billets" },
  { unitKey: "soar", name: "Executive Officer", category: "Staff Billets" },
  { unitKey: "soar", name: "Aviator", category: "Staff Billets" },
  { unitKey: "soar", name: "Aircrew Member", category: "Staff Billets" },
];

const definitionsByKey = new Map(unitDefinitions.map((definition) => [definition.key, definition]));
const unitKeysByAlias = new Map();

for (const definition of unitDefinitions) {
  for (const value of [definition.name, ...(definition.aliases || [])]) {
    unitKeysByAlias.set(normalizeOrgKey(value), definition.key);
  }
}

const commandBillets = new Set(["co", "commandingofficer", "commander", "xo", "executiveofficer", "ncoic"]);
const platoonStaffBillets = new Set(["pl", "platoonleader", "psg", "platoonsergeant"]);
const squadStaffBillets = new Set(["sl", "squadleader"]);
const teamStaffBillets = new Set(["tl", "teamleader", "atl", "assistantteamleader", "assistantteamlead"]);
const staffSectionKeys = new Set(["s1", "s2", "s3", "s4", "s6", "j1", "j2", "j3", "j4", "j6", "staff"]);
const canonicalBilletNames = new Map(
  [
    ["co", "Commanding Officer"],
    ["commandingofficer", "Commanding Officer"],
    ["commander", "Commanding Officer"],
    ["xo", "Executive Officer"],
    ["executiveofficer", "Executive Officer"],
    ["ncoic", "Noncommissioned Officer in Charge"],
    ["noncommissionedofficerincharge", "Noncommissioned Officer in Charge"],
    ["noncommissionedofficeric", "Noncommissioned Officer in Charge"],
    ["pl", "Platoon Leader"],
    ["1stplatoonleader", "Platoon Leader"],
    ["platoonleader", "Platoon Leader"],
    ["psg", "Platoon Sergeant"],
    ["1stplatoonsergeant", "Platoon Sergeant"],
    ["platoonsergeant", "Platoon Sergeant"],
    ["sl", "Squad Leader"],
    ["1stsquadleader", "Squad Leader"],
    ["2ndsquadleader", "Squad Leader"],
    ["squadleader", "Squad Leader"],
    ["tl", "Team Leader"],
    ["ateamleader", "Team Leader"],
    ["bteamleader", "Team Leader"],
    ["teamleader", "Team Leader"],
    ["atl", "Assistant Team Leader"],
    ["aassistantteamleader", "Assistant Team Leader"],
    ["bassistantteamleader", "Assistant Team Leader"],
    ["assistantteamleader", "Assistant Team Leader"],
    ["assistantteamlead", "Assistant Team Leader"],
    ["rto", "Radio Telephone Operator"],
    ["radiotelephoneoperator", "Radio Telephone Operator"],
    ["jtac", "Joint Terminal Attack Controller"],
    ["jointterminalattackcontroller", "Joint Terminal Attack Controller"],
    ["rifleman", "Rifleman"],
    ["autorifleman", "Automatic Rifleman"],
    ["automaticrifleman", "Automatic Rifleman"],
    ["grenadier", "Grenadier"],
    ["medic", "Medic"],
    ["engineer", "Engineer"],
    ["aviator", "Aviator"],
    ["aircrew", "Aircrew Member"],
    ["aircrewman", "Aircrew Member"],
    ["aircrewmember", "Aircrew Member"],
    ["assaulterbreacher", "Assaulter / Breacher"],
    ["heavyweaponsoperator", "Heavy Weapons Operator"],
  ].map(([key, value]) => [key, value]),
);

export function normalizeOrgKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function canonicalBilletName(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const key = normalizeOrgKey(text);
  const mapped = canonicalBilletNames.get(key);
  if (mapped) return mapped;

  return text
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .split(/(\s+|-|\/)/)
    .map((part) => {
      if (!/[a-z0-9]/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("")
    .replace(/\s+\/\s+/g, " / ");
}

export function unitDefinitionForKey(key) {
  return definitionsByKey.get(key) || null;
}

export function unitDefinitionForName(name) {
  const key = unitKeysByAlias.get(normalizeOrgKey(name));
  return key ? unitDefinitionForKey(key) : null;
}

export function unitNameForKey(key) {
  return unitDefinitionForKey(key)?.name || null;
}

export function expandUnitNamesWithAncestors(unitNames) {
  const keys = new Set();

  for (const name of unitNames.filter(Boolean)) {
    const definition = unitDefinitionForName(name);
    if (!definition) continue;
    let current = definition;
    while (current) {
      keys.add(current.key);
      current = current.parentKey ? unitDefinitionForKey(current.parentKey) : null;
    }
  }

  return unitDefinitions.filter((definition) => keys.has(definition.key));
}

export function inferUnitNameForRosterRecord({ rawAssignedTo, billet, platoon, squad, fireTeam, shop } = {}) {
  const shopValues = normalizeList(shop);
  const text = [rawAssignedTo, billet, platoon, squad, fireTeam, ...shopValues].map(normalizeOrgKey).join(" ");

  if (!text.trim()) return null;

  if (text.includes("sfod") || text.includes("delta")) {
    const team = normalizeTeamValue(fireTeam) || parseTeamFromText(text);
    if (team === "a") return unitNameForKey("sfod-a");
    if (team === "b") return unitNameForKey("sfod-b");
    return unitNameForKey("sfod");
  }

  if (text.includes("160th") || text.includes("soar") || text.includes("aviation")) {
    return unitNameForKey("soar");
  }

  if (text.includes("75th") || text.includes("ranger")) {
    const platoonValue = normalizePlatoonValue(platoon);
    const squadValue = normalizeSquadValue(squad);
    const teamValue = normalizeTeamValue(fireTeam);

    if (platoonValue === "1") {
      if (squadValue && teamValue) return unitNameForKey(`aco-1plt-${squadValue}sq-${teamValue}`);
      if (squadValue) return unitNameForKey(`aco-1plt-${squadValue}sq`);
      return unitNameForKey("aco-1plt");
    }

    return unitNameForKey("aco");
  }

  if (text.includes("recruit")) return unitNameForKey("recruit-pipeline");
  if (text.includes("command") || text.includes("headquarters") || text.includes("hhc")) return unitNameForKey("tf20-hhc");

  if ([...staffSectionKeys].some((key) => text.includes(key))) return unitNameForKey("tf20-hhc");

  return null;
}

export function isCurrentMemberStatus(status) {
  return activeMemberStatuses.has(status);
}

export function isCommandStaffBillet({ unitName, billetName } = {}) {
  const unit = unitDefinitionForName(unitName);
  if (!unit || !["tf20", "tf20-hhc"].includes(unit.key)) return false;
  return commandBillets.has(normalizeOrgKey(billetName));
}

export function getStaffScopeUnitName({ unitName, billetName } = {}) {
  const unit = unitDefinitionForName(unitName);
  const billet = normalizeOrgKey(billetName);

  if (!unit || !billet) return null;
  if (isCommandStaffBillet({ unitName, billetName })) return unitNameForKey("tf20");
  if (commandBillets.has(billet)) return unit.name;
  if (platoonStaffBillets.has(billet)) return findAncestorUnitName(unit.key, "Platoon");
  if (squadStaffBillets.has(billet)) return findAncestorUnitName(unit.key, "Squad");
  if (teamStaffBillets.has(billet)) return findAncestorUnitName(unit.key, "Team");

  return null;
}

export function getCommandDashboardBucketName(unitName) {
  const unit = unitDefinitionForName(unitName);
  if (!unit) return null;

  let current = unit;
  while (current) {
    if (["aco", "sfod", "soar"].includes(current.key)) {
      return current.name;
    }
    current = current.parentKey ? unitDefinitionForKey(current.parentKey) : null;
  }

  return null;
}

export function suggestPortalRoleForRosterRecord({ mappedStatus, rawAssignedTo, unitName, billet, shop } = {}) {
  if (!isCurrentMemberStatus(mappedStatus)) return "Applicant";

  const shopValues = normalizeList(shop);
  const text = [rawAssignedTo, billet, unitName, ...shopValues].map(normalizeOrgKey).join(" ");

  if (text.includes("system") || text.includes("s6") || text.includes("j6")) return "System Admin";
  if (isCommandStaffBillet({ unitName, billetName: billet })) return "Command Staff";
  if (text.includes("recruit")) return "Recruiter";
  if (shopValues.some((value) => staffSectionKeys.has(normalizeOrgKey(value)))) return "Staff";
  if (getStaffScopeUnitName({ unitName, billetName: billet })) return "Staff";

  return "Member";
}

function findAncestorUnitName(unitKey, type) {
  let current = unitDefinitionForKey(unitKey);

  while (current) {
    if (current.type === type) return current.name;
    current = current.parentKey ? unitDefinitionForKey(current.parentKey) : null;
  }

  return null;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  return [String(value).trim()].filter(Boolean);
}

function normalizePlatoonValue(value) {
  const key = normalizeOrgKey(value);
  if (["1", "1st", "first"].includes(key)) return "1";
  return "";
}

function normalizeSquadValue(value) {
  const key = normalizeOrgKey(value);
  if (["1", "1st", "first"].includes(key)) return "1";
  if (["2", "2nd", "second"].includes(key)) return "2";
  return "";
}

function normalizeTeamValue(value) {
  const key = normalizeOrgKey(value);
  if (["a", "alpha"].includes(key)) return "a";
  if (["b", "bravo"].includes(key)) return "b";
  return "";
}

function parseTeamFromText(text) {
  if (/\ba(team|teamleader|assistantteamleader)?\b/.test(text)) return "a";
  if (/\bb(team|teamleader|assistantteamleader)?\b/.test(text)) return "b";
  if (text.includes("alphateam")) return "a";
  if (text.includes("bravoteam")) return "b";
  return "";
}
