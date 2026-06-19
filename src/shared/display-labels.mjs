export function humanizeIdentifier(value, fallback = "Unknown") {
  if (value === null || value === undefined || value === "") return fallback;

  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function enumDisplayLabel(enumName, value, enumDisplayLabels = {}) {
  if (!value) return "Unknown";
  return enumDisplayLabels?.[enumName]?.[value] ?? humanizeIdentifier(value);
}

export function accountStatusLabel(status, enumDisplayLabels = {}) {
  return enumDisplayLabel("AccountStatus", status, enumDisplayLabels);
}

export function applicationStatusLabel(status, enumDisplayLabels = {}) {
  return enumDisplayLabel("ApplicationStatus", status, enumDisplayLabels);
}

export function personnelStatusLabel(status, enumDisplayLabels = {}) {
  return enumDisplayLabel("PersonnelStatus", status, enumDisplayLabels);
}

export function standingDisplayLabel(value) {
  if (value === null || value === undefined || value === "") return "Not recorded";
  return value ? "Good" : "Restricted";
}

export function personDisplayName(
  { firstName = "", lastName = "", fullName = "" } = {},
  fallback = "Unknown",
) {
  const explicitFirstName = String(firstName ?? "").trim();
  const explicitLastName = String(lastName ?? "").trim();
  if (explicitFirstName && explicitLastName) {
    return `${explicitFirstName.charAt(0).toUpperCase()}. ${explicitLastName}`;
  }

  const tokens = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length >= 2) {
    return `${tokens[0].charAt(0).toUpperCase()}. ${tokens.at(-1)}`;
  }
  return tokens[0] ?? fallback;
}

export function rankDisplayLabel(rank, { compact = false } = {}) {
  if (!rank) return "Unassigned";
  if (compact) {
    return rank.abbreviation ?? rank.name ?? humanizeIdentifier(rank.key, "Unassigned");
  }
  if (rank.abbreviation && rank.name && rank.abbreviation !== rank.name) {
    return `${rank.abbreviation} - ${rank.name}`;
  }
  return rank.name ?? rank.abbreviation ?? humanizeIdentifier(rank.key, "Unassigned");
}

export function unitDisplayLabel(unit) {
  return unit?.name ?? "Unassigned";
}

export function billetDisplayLabel(billet) {
  return billet?.name ?? "Unassigned";
}

export function mosDisplayLabel(mos, { empty = "Unassigned" } = {}) {
  if (!mos) return empty;
  if (mos.identifier && mos.name) return `${mos.identifier} - ${mos.name}`;
  return mos.name ?? mos.identifier ?? humanizeIdentifier(mos.key, empty);
}

export function awardDisplayLabel(record) {
  return record?.award?.name ?? record?.award?.abbreviation ?? record?.name ?? "";
}

export function trainingCourseDisplayLabel(course) {
  return course?.name ?? humanizeIdentifier(course?.key, "Unassigned");
}

export function trainingOutcomeLabel(outcome) {
  return enumDisplayLabel("TrainingOutcome", outcome);
}
