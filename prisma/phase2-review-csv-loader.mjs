import fs from "node:fs";
import path from "node:path";

const PLACEHOLDER_PATTERN = /\b(todo|tbd|placeholder|fixme|example|sample)\b/i;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

const FILE_SPECS = {
  awards: {
    fileName: "phase-2-backend-review - awards.csv",
    headers: ["award_key", "abbreviation", "name", "type", "category"],
    keyField: "award_key",
  },
  billets: {
    fileName: "phase-2-backend-review - billets.csv",
    headers: [
      "billet_key",
      "display_name",
      "category",
      "unit_key",
      "minimum_rank_key",
      "command_precedence",
    ],
    keyField: "billet_key",
  },
  enums: {
    fileName: "phase-2-backend-review - enumns.csv",
    headers: ["enum", "value"],
    keyField: null,
  },
  mos: {
    fileName: "phase-2-backend-review - mos.csv",
    headers: ["mos_key", "identifier", "mos", "unit_key"],
    keyField: "mos_key",
  },
  permissions: {
    fileName: "phase-2-backend-review - permissions.csv",
    headers: ["permission_key", "display_name", "minimum_role_key"],
    keyField: "permission_key",
  },
  qualifications: {
    fileName: "phase-2-backend-review - qualifications.csv",
    headers: ["identifier", "name"],
    keyField: "identifier",
  },
  ranks: {
    fileName: "phase-2-backend-review - ranks.csv",
    headers: ["rank_key", "display_name", "abbreviation", "grade", "rank_precedence"],
    keyField: "rank_key",
  },
  roles: {
    fileName: "phase-2-backend-review - roles.csv",
    headers: ["role_key", "display_name", "role_precedence"],
    keyField: "role_key",
  },
  staffSelections: {
    fileName: "phase-2-backend-review - staff selections.csv",
    headers: ["shop_key", "identifier", "name", "function"],
    keyField: "shop_key",
  },
  trainingCourses: {
    fileName: "phase-2-backend-review - training courses.csv",
    headers: ["training_course_key", "name"],
    keyField: "training_course_key",
  },
  units: {
    fileName: "phase-2-backend-review - units.csv",
    headers: ["unit_key", "display_name", "type", "parent", "unit_hierarchy_base"],
    keyField: "unit_key",
  },
};

export function loadPhase2ReviewCsvs({ projectRoot = process.cwd() } = {}) {
  const reviewDir = path.join(projectRoot, "phase two review files");
  if (!fs.existsSync(reviewDir)) {
    throw new Error(`Phase 2 review folder is missing: ${reviewDir}`);
  }

  const parsed = {};
  for (const [family, spec] of Object.entries(FILE_SPECS)) {
    const filePath = path.join(reviewDir, spec.fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing Phase 2 review CSV: ${spec.fileName}`);
    }
    parsed[family] = parseCsvFile(filePath, spec.headers);
  }

  return normalizePhase2ReviewCsvs(parsed);
}

export function validatePhase2ReviewCsvs(source) {
  const errors = [];
  const suspicious = [];

  validatePresence(source, errors);
  validateRoles(source, errors, suspicious);
  validatePermissions(source, errors, suspicious);
  validateUnits(source, errors, suspicious);
  validateRanks(source, errors, suspicious);
  validateBillets(source, errors, suspicious);
  validateMos(source, errors, suspicious);
  validateStaffSelections(source, errors, suspicious);
  validateSimpleCatalog(source.trainingCourses, "trainingCourses", "key", errors, suspicious);
  validateSimpleCatalog(source.qualifications, "qualifications", "key", errors, suspicious);
  validateSimpleCatalog(source.awards, "awards", "key", errors, suspicious);
  validateEnums(source, errors, suspicious);

  if (errors.length || suspicious.length) {
    const lines = [];
    if (errors.length) {
      lines.push("Phase 2 review CSV validation failed:");
      for (const error of errors) {
        lines.push(`- ERROR: ${error}`);
      }
    }
    if (suspicious.length) {
      if (lines.length) lines.push("");
      lines.push("Phase 2 review CSV validation stopped for review:");
      for (const item of suspicious) {
        lines.push(`- REVIEW: ${item}`);
      }
    }
    throw new Error(lines.join("\n"));
  }
}

export function summarizePhase2ReviewCsvs(source) {
  return {
    roles: source.roles.length,
    permissions: source.permissions.length,
    units: source.units.length,
    ranks: source.ranks.length,
    billets: source.billets.length,
    staffSelections: source.staffSelections.length,
    mos: source.mos.length,
    trainingCourses: source.trainingCourses.length,
    qualifications: source.qualifications.length,
    awards: source.awards.length,
    enums: Object.keys(source.enums).length,
    enumValues: Object.values(source.enums).reduce((total, values) => total + values.length, 0),
    enumDisplayMappings: source.enumDisplayMappings.length,
  };
}

function normalizePhase2ReviewCsvs(parsed) {
  const roles = parsed.roles.map((row) => ({
    key: row.role_key,
    displayName: row.display_name,
    precedence: parseIntegerField(row.role_precedence, "role_precedence"),
  }));

  const permissions = parsed.permissions.map((row) => ({
    key: row.permission_key,
    displayName: row.display_name,
    minimumRoleKey: row.minimum_role_key,
  }));

  const units = parsed.units.map((row) => ({
    key: row.unit_key,
    displayName: row.display_name,
    type: row.type,
    parentKey: normalizeNullish(row.parent),
    hierarchyBase: parseIntegerField(row.unit_hierarchy_base, "unit_hierarchy_base"),
  }));

  const ranks = parsed.ranks.map((row) => ({
    key: row.rank_key,
    displayName: row.display_name,
    abbreviation: row.abbreviation,
    grade: row.grade,
    precedence: parseIntegerField(row.rank_precedence, "rank_precedence"),
  }));

  const billets = parsed.billets.map((row) => ({
    key: row.billet_key,
    displayName: row.display_name,
    category: row.category,
    unitKey: row.unit_key,
    minimumRankKey: row.minimum_rank_key,
    commandPrecedence: parseIntegerField(row.command_precedence, "command_precedence"),
  }));

  const staffSelections = parsed.staffSelections.map((row) => ({
    key: row.shop_key,
    identifier: row.identifier,
    name: row.name,
    function: row.function,
  }));

  const mos = parsed.mos.map((row) => ({
    key: row.mos_key,
    identifier: row.identifier,
    name: row.mos,
    unitKey: row.unit_key,
  }));

  const trainingCourses = parsed.trainingCourses.map((row) => ({
    key: row.training_course_key,
    name: row.name,
  }));

  const qualifications = parsed.qualifications.map((row) => ({
    key: row.identifier,
    name: row.name,
  }));

  const awards = parsed.awards.map((row) => ({
    key: row.award_key,
    abbreviation: row.abbreviation,
    name: row.name,
    type: row.type,
    category: row.category,
  }));

  const enums = {};
  const enumDisplayMappings = [];
  for (const row of parsed.enums) {
    const enumName = row.enum;
    const displayValue = row.value;
    const normalizedValue = normalizeEnumValue(displayValue);

    if (!enums[enumName]) {
      enums[enumName] = [];
    }
    enums[enumName].push(normalizedValue);
    enumDisplayMappings.push({
      enumName,
      displayValue,
      normalizedValue,
      needsDisplayMapping: normalizedValue !== displayValue,
    });
  }

  return {
    roles,
    permissions,
    units,
    ranks,
    billets,
    staffSelections,
    mos,
    trainingCourses,
    qualifications,
    awards,
    enums,
    enumDisplayMappings,
  };
}

function validatePresence(source, errors) {
  for (const family of [
    "roles",
    "permissions",
    "units",
    "ranks",
    "billets",
    "staffSelections",
    "mos",
    "trainingCourses",
    "qualifications",
    "awards",
    "enums",
    "enumDisplayMappings",
  ]) {
    if (!(family in source)) {
      errors.push(`Normalized review source is missing family ${family}.`);
    }
  }
}

function validateRoles(source, errors, suspicious) {
  assertUnique(source.roles, "roles", "key", errors);
  assertUnique(source.roles, "roles", "precedence", errors, { allowDuplicates: true });

  for (const role of source.roles) {
    validateCatalogKey(role.key, "roles", errors, suspicious);
    validateRequiredText(role.displayName, `roles.${role.key}.displayName`, errors, suspicious);
    validateInteger(role.precedence, `roles.${role.key}.precedence`, errors);
    checkPlaceholder(role.displayName, `roles.${role.key}.displayName`, suspicious);
  }
}

function validatePermissions(source, errors, suspicious) {
  assertUnique(source.permissions, "permissions", "key", errors);
  const roleKeys = new Set(source.roles.map((role) => role.key));

  for (const permission of source.permissions) {
    validateCatalogKey(permission.key, "permissions", errors, suspicious);
    validateRequiredText(permission.displayName, `permissions.${permission.key}.displayName`, errors, suspicious);
    if (!roleKeys.has(permission.minimumRoleKey)) {
      errors.push(
        `permissions.${permission.key}.minimumRoleKey references missing role ${permission.minimumRoleKey}.`,
      );
    }
    checkPlaceholder(permission.displayName, `permissions.${permission.key}.displayName`, suspicious);
  }
}

function validateUnits(source, errors, suspicious) {
  assertUnique(source.units, "units", "key", errors);
  const unitKeys = new Set(source.units.map((unit) => unit.key));

  for (const unit of source.units) {
    validateCatalogKey(unit.key, "units", errors, suspicious);
    validateRequiredText(unit.displayName, `units.${unit.key}.displayName`, errors, suspicious);
    validateRequiredText(unit.type, `units.${unit.key}.type`, errors, suspicious);
    validateInteger(unit.hierarchyBase, `units.${unit.key}.hierarchyBase`, errors);
    if (unit.parentKey && !unitKeys.has(unit.parentKey)) {
      errors.push(`units.${unit.key}.parentKey references missing unit ${unit.parentKey}.`);
    }
    if (unit.parentKey === unit.key) {
      errors.push(`units.${unit.key}.parentKey cannot self-reference.`);
    }
    checkPlaceholder(unit.displayName, `units.${unit.key}.displayName`, suspicious);
  }
}

function validateRanks(source, errors, suspicious) {
  assertUnique(source.ranks, "ranks", "key", errors);
  assertUnique(source.ranks, "ranks", "precedence", errors);

  for (const rank of source.ranks) {
    validateCatalogKey(rank.key, "ranks", errors, suspicious);
    validateRequiredText(rank.displayName, `ranks.${rank.key}.displayName`, errors, suspicious);
    validateRequiredText(rank.abbreviation, `ranks.${rank.key}.abbreviation`, errors, suspicious);
    validateRequiredText(rank.grade, `ranks.${rank.key}.grade`, errors, suspicious);
    validateInteger(rank.precedence, `ranks.${rank.key}.precedence`, errors);
    checkPlaceholder(rank.displayName, `ranks.${rank.key}.displayName`, suspicious);
  }
}

function validateBillets(source, errors, suspicious) {
  assertUnique(source.billets, "billets", "key", errors);
  const unitKeys = new Set(source.units.map((unit) => unit.key));
  const rankKeys = new Set(source.ranks.map((rank) => rank.key));

  for (const billet of source.billets) {
    validateCatalogKey(billet.key, "billets", errors, suspicious);
    validateRequiredText(billet.displayName, `billets.${billet.key}.displayName`, errors, suspicious);
    validateRequiredText(billet.category, `billets.${billet.key}.category`, errors, suspicious);
    if (!unitKeys.has(billet.unitKey)) {
      errors.push(`billets.${billet.key}.unitKey references missing unit ${billet.unitKey}.`);
    }
    if (!rankKeys.has(billet.minimumRankKey)) {
      errors.push(
        `billets.${billet.key}.minimumRankKey references missing rank ${billet.minimumRankKey}.`,
      );
    }
    validateInteger(billet.commandPrecedence, `billets.${billet.key}.commandPrecedence`, errors);
    checkPlaceholder(billet.displayName, `billets.${billet.key}.displayName`, suspicious);
  }
}

function validateMos(source, errors, suspicious) {
  assertUnique(source.mos, "mos", "key", errors);
  const unitKeys = new Set(source.units.map((unit) => unit.key));

  for (const mos of source.mos) {
    validateCatalogKey(mos.key, "mos", errors, suspicious);
    validateRequiredText(mos.identifier, `mos.${mos.key}.identifier`, errors, suspicious);
    validateRequiredText(mos.name, `mos.${mos.key}.name`, errors, suspicious);
    if (!unitKeys.has(mos.unitKey)) {
      errors.push(`mos.${mos.key}.unitKey references missing unit ${mos.unitKey}.`);
    }
    checkPlaceholder(mos.name, `mos.${mos.key}.name`, suspicious);
  }
}

function validateStaffSelections(source, errors, suspicious) {
  assertUnique(source.staffSelections, "staffSelections", "key", errors);

  for (const selection of source.staffSelections) {
    validateCatalogKey(selection.key, "staffSelections", errors, suspicious);
    validateRequiredText(selection.identifier, `staffSelections.${selection.key}.identifier`, errors, suspicious);
    validateRequiredText(selection.name, `staffSelections.${selection.key}.name`, errors, suspicious);
    validateRequiredText(selection.function, `staffSelections.${selection.key}.function`, errors, suspicious);
    checkPlaceholder(selection.name, `staffSelections.${selection.key}.name`, suspicious);
  }
}

function validateSimpleCatalog(items, family, keyField, errors, suspicious) {
  assertUnique(items, family, keyField, errors);

  for (const item of items) {
    validateCatalogKey(item[keyField], family, errors, suspicious);
    validateRequiredText(item.name, `${family}.${item[keyField]}.name`, errors, suspicious);
    checkPlaceholder(item.name, `${family}.${item[keyField]}.name`, suspicious);
  }
}

function validateEnums(source, errors, suspicious) {
  const enumNames = Object.keys(source.enums).sort();
  assertUniqueArray(enumNames, "enums", "enumName", errors);

  for (const mapping of source.enumDisplayMappings) {
    validateRequiredText(mapping.enumName, "enum name", errors, suspicious);
    validateRequiredText(mapping.displayValue, `${mapping.enumName}.displayValue`, errors, suspicious);
    if (!SAFE_IDENTIFIER_PATTERN.test(mapping.normalizedValue)) {
      errors.push(
        `Enum ${mapping.enumName} produced invalid normalized identifier ${mapping.normalizedValue}.`,
      );
    }
    if (PLACEHOLDER_PATTERN.test(mapping.displayValue)) {
      suspicious.push(`Enum ${mapping.enumName} contains placeholder-looking display value ${mapping.displayValue}.`);
    }
  }

  for (const [enumName, values] of Object.entries(source.enums)) {
    assertUniqueArray(values, `enums.${enumName}`, "normalizedValue", errors);
  }
}

function parseCsvFile(filePath, expectedHeaders) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  if (!rows.length) {
    throw new Error(`CSV file is empty: ${path.basename(filePath)}`);
  }

  const header = rows[0];
  if (header.length !== expectedHeaders.length || header.some((value, index) => value !== expectedHeaders[index])) {
    throw new Error(
      `CSV header mismatch for ${path.basename(filePath)}. Expected ${expectedHeaders.join(", ")} but got ${header.join(", ")}.`,
    );
  }

  return rows.slice(1).map((row, rowIndex) => {
    if (row.length !== expectedHeaders.length) {
      throw new Error(
        `CSV row length mismatch for ${path.basename(filePath)} at data row ${rowIndex + 2}. Expected ${expectedHeaders.length} cells but got ${row.length}.`,
      );
    }

    return Object.fromEntries(
      expectedHeaders.map((headerName, index) => [headerName, normalizeCell(row[index])]),
    );
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
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
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows
    .filter((currentRow) => currentRow.some((value) => value.trim().length > 0))
    .map((currentRow) => currentRow.map((value) => value.trim()));
}

function normalizeCell(value) {
  return value.trim();
}

function normalizeNullish(value) {
  return value === "" || /^null$/i.test(value) ? null : value;
}

function normalizeEnumValue(value) {
  const normalized = value
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");

  if (!normalized) {
    return "";
  }

  return /^[A-Za-z]/.test(normalized) ? normalized : `Value${normalized}`;
}

function parseIntegerField(value, fieldName) {
  if (value === "") {
    throw new Error(`Missing required numeric field ${fieldName}.`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for ${fieldName}: ${value}`);
  }

  return parsed;
}

function assertUnique(items, family, fieldName, errors, options = {}) {
  const { allowDuplicates = false } = options;
  if (allowDuplicates) {
    return;
  }
  const seen = new Set();
  for (const item of items) {
    const value = item[fieldName];
    if (seen.has(value)) {
      errors.push(`${family} has duplicate ${fieldName} ${value}.`);
    }
    seen.add(value);
  }
}

function assertUniqueArray(values, family, label, errors) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      errors.push(`${family} has duplicate ${label} ${value}.`);
    }
    seen.add(value);
  }
}

function validateCatalogKey(value, family, errors, suspicious) {
  validateRequiredText(value, `${family}.key`, errors, suspicious);
  if (!SAFE_KEY_PATTERN.test(value)) {
    suspicious.push(`${family} contains non-standard key ${value}.`);
  }
}

function validateRequiredText(value, label, errors, suspicious) {
  if (!value) {
    errors.push(`Missing required value for ${label}.`);
    return;
  }
  if (value.trim() !== value) {
    suspicious.push(`${label} contains leading or trailing whitespace.`);
  }
}

function validateInteger(value, label, errors) {
  if (!Number.isInteger(value)) {
    errors.push(`${label} must be an integer.`);
  }
}

function checkPlaceholder(value, label, suspicious) {
  if (PLACEHOLDER_PATTERN.test(value)) {
    suspicious.push(`${label} contains placeholder-looking text: ${value}`);
  }
}
