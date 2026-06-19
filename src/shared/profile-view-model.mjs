import {
  awardDisplayLabel,
  billetDisplayLabel,
  mosDisplayLabel,
  personDisplayName,
  personnelStatusLabel,
  rankDisplayLabel,
  standingDisplayLabel,
} from "./display-labels.mjs";

const MONTH_LABELS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const ASSIGNMENT_UNIT_TYPES = new Set(["Platoon", "Squad", "Team"]);

export function buildPersonnelProfileViewModel(profile, summary = {}, now = new Date()) {
  const enlistmentDate = profile?.joinedAt ?? profile?.acceptedAt ?? null;
  const rankEffectiveAt = resolveCurrentRankEffectiveAt(profile);
  const { unit } = resolveUnitDisplay(profile?.currentUnit);
  const awards = splitAwardRecords(profile?.awardRecords ?? []);

  return {
    profileFields: [
      ["RANK", rankLabel(profile)],
      ["NAME", profileName(profile, summary)],
      ["TIS", formatWholeMonthDuration(enlistmentDate, now)],
      ["TIG", formatWholeMonthDuration(rankEffectiveAt, now)],
      ["UNIT", unit],
      ["ASSIGNMENT", billetDisplayLabel(profile?.currentBillet)],
      ["PRIMARY MOS", mosLabel(profile?.currentMOS)],
      ["SECONDARY MOS", secondaryMosLabel(profile?.currentSecondaryMOS)],
    ],
    administrativeStatus: [
      ["STATUS", profile?.status ? personnelStatusLabel(profile.status) : "Not recorded"],
      ["STANDING", standingDisplayLabel(profile?.goodStanding)],
    ],
    qualifications: activeQualificationLabels(profile?.qualifications ?? []),
    awards: awards.awards,
    ribbons: awards.ribbons,
    achievements: [],
  };
}

export function formatCompactDate(value) {
  const date = parseDate(value);
  if (!date) return "Not recorded";

  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${day}${MONTH_LABELS[date.getUTCMonth()]}${date.getUTCFullYear()}`;
}

export function wholeMonthsBetween(startValue, endValue = new Date()) {
  const start = parseDate(startValue);
  const end = parseDate(endValue);
  if (!start || !end || end < start) return null;

  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());

  if (end.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

export function formatWholeMonthDuration(startValue, endValue = new Date()) {
  const months = wholeMonthsBetween(startValue, endValue);
  if (months === null) return "Not recorded";
  return `${months} ${months === 1 ? "Month" : "Months"}`;
}

export function resolveUnitDisplay(currentUnit) {
  const chain = unitChain(currentUnit);
  if (!chain.length) {
    return { unit: "Unassigned", assignment: "Unassigned" };
  }

  const assignmentStartIndex = chain.findIndex((unit) => ASSIGNMENT_UNIT_TYPES.has(unit.type));
  const unitNode =
    assignmentStartIndex > 0
      ? chain[assignmentStartIndex - 1]
      : ([...chain].reverse().find((unit) => !ASSIGNMENT_UNIT_TYPES.has(unit.type)) ??
        chain.at(-1));

  const assignmentNodes = assignmentStartIndex >= 0 ? chain.slice(assignmentStartIndex) : [];

  return {
    unit: unitNode?.name ?? "Unassigned",
    assignment: assignmentNodes.length
      ? assignmentNodes.map((unit) => shortUnitName(unit.name)).join(", ")
      : "Unassigned",
  };
}

export function splitAwardRecords(records) {
  return (records ?? []).reduce(
    (result, record) => {
      const label = awardLabel(record);
      if (!label) return result;

      const type = String(record?.award?.type ?? "").toLowerCase();
      if (type === "ribbon") {
        result.ribbons.push(label);
      } else {
        result.awards.push(label);
      }

      return result;
    },
    { awards: [], ribbons: [] },
  );
}

function activeQualificationLabels(qualifications) {
  return qualifications
    .filter((entry) => !entry.status || entry.status === "Active")
    .map((entry) => entry.qualification?.name ?? entry.name)
    .filter(Boolean);
}

function awardLabel(record) {
  return awardDisplayLabel(record);
}

function rankLabel(profile) {
  return profile?.currentRank ? rankDisplayLabel(profile.currentRank, { compact: true }) : "RANK";
}

function profileName(profile, summary) {
  const fullName =
    profile?.name ??
    summary?.account?.displayName ??
    summary?.authIdentity?.displayName ??
    summary?.authIdentity?.username ??
    "Member";
  return personDisplayName({ fullName }, "Member");
}

function mosLabel(mos) {
  return mosDisplayLabel(mos);
}

function secondaryMosLabel(mos) {
  return mos ? mosLabel(mos) : "None";
}

function resolveCurrentRankEffectiveAt(profile) {
  const history = profile?.rankHistory ?? [];
  const currentRankId = profile?.currentRankId ?? profile?.currentRank?.id;
  const activeEntry = history.find((entry) => {
    const entryRankId = entry.rankId ?? entry.rank?.id;
    return entryRankId === currentRankId && !entry.endedAt;
  });

  return activeEntry?.effectiveAt ?? history[0]?.effectiveAt ?? null;
}

function unitChain(currentUnit) {
  const chain = [];
  const seen = new Set();
  let unit = currentUnit;

  while (unit && !seen.has(unit.id ?? unit.key ?? unit.name)) {
    chain.unshift(unit);
    seen.add(unit.id ?? unit.key ?? unit.name);
    unit = unit.parent;
  }

  return chain;
}

function shortUnitName(name) {
  return (
    String(name ?? "Unassigned")
      .split(",")[0]
      .trim() || "Unassigned"
  );
}

function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
