import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
const outputPath = path.join(projectRoot, "docs", "schema-prisma-workbook.csv");

const SCALAR_TYPES = new Set([
  "BigInt",
  "Boolean",
  "Bytes",
  "DateTime",
  "Decimal",
  "Float",
  "Int",
  "Json",
  "String",
]);

const DOMAIN_GROUPS = [
  {
    name: "Identity and Access",
    models: [
      "Account",
      "AuthIdentity",
      "Session",
      "SessionRevocation",
      "Role",
      "Permission",
      "PermissionGrant",
      "RoleAssignment",
      "AccountRecoveryRequest",
      "AccessBootstrap",
    ],
  },
  { name: "Organization", models: ["Unit", "Rank", "Billet", "StaffSection", "MOS"] },
  {
    name: "Personnel",
    models: [
      "PersonnelProfile",
      "PersonnelStatusHistory",
      "PersonnelRankHistory",
      "PersonnelUnitAssignment",
      "PersonnelBilletAssignment",
      "PersonnelMOSHistory",
      "StaffAssignment",
      "PersonnelStandingHistory",
    ],
  },
  {
    name: "Recruiting",
    models: [
      "Application",
      "ApplicationAnswer",
      "ApplicationStatusHistory",
      "ApplicationReviewNote",
    ],
  },
  { name: "Operations", models: ["EventTemplate", "Event", "EventAttendance", "LoaRequest"] },
  {
    name: "Training",
    models: [
      "TrainingCourse",
      "Qualification",
      "CourseQualification",
      "TrainingRecord",
      "PersonnelQualification",
    ],
  },
  {
    name: "Service Records",
    models: [
      "PromotionRequest",
      "PromotionRecord",
      "Award",
      "AwardRequest",
      "AwardRecord",
      "DisciplinaryRecord",
      "AdministrativeNote",
    ],
  },
  {
    name: "Support and System",
    models: [
      "SupportTicket",
      "SupportTicketComment",
      "Notification",
      "AuditLog",
      "IntegrationLog",
    ],
  },
];

const schema = await readFile(schemaPath, "utf8");
const enumNames = new Set([...schema.matchAll(/^enum\s+(\w+)/gm)].map((match) => match[1]));
const modelNames = new Set([...schema.matchAll(/^model\s+(\w+)/gm)].map((match) => match[1]));
const domainByModel = buildDomainMap();
const rows = buildRows(schema);

const headers = [
  "order",
  "kind",
  "domain",
  "object",
  "item",
  "type",
  "type_category",
  "required",
  "list",
  "key",
  "default",
  "db_type",
  "relation_target",
  "relation_name",
  "foreign_key",
  "references",
  "line",
];

const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
].join("\n");

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${csv}\n`, "utf8");

console.log(`Generated ${path.relative(projectRoot, outputPath)}`);
console.log(`${rows.length} reference rows`);

function buildRows(source) {
  const result = [];
  let current = null;
  let order = 1;

  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = stripInlineComment(rawLine).trim();
    if (!trimmed) return;

    const enumMatch = trimmed.match(/^enum\s+(\w+)\s*\{/);
    if (enumMatch) {
      current = { kind: "enum", name: enumMatch[1] };
      result.push(baseRow({ order: order++, kind: "enum", object: current.name, line }));
      return;
    }

    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = { kind: "model", name: modelMatch[1] };
      result.push(
        baseRow({
          order: order++,
          kind: "model",
          domain: domainByModel.get(current.name) ?? "Other",
          object: current.name,
          line,
        }),
      );
      return;
    }

    if (trimmed === "}") {
      current = null;
      return;
    }

    if (current?.kind === "enum") {
      const value = trimmed.split(/\s+/)[0];
      result.push(
        baseRow({
          order: order++,
          kind: "enum_value",
          object: current.name,
          item: value,
          type: current.name,
          type_category: "enum",
          line,
        }),
      );
      return;
    }

    if (current?.kind !== "model") return;

    const domain = domainByModel.get(current.name) ?? "Other";
    if (trimmed.startsWith("@@")) {
      const attribute = parseModelAttribute(trimmed);
      result.push(
        baseRow({
          order: order++,
          kind: "constraint",
          domain,
          object: current.name,
          item: attribute.name,
          key: attribute.value,
          line,
        }),
      );
      return;
    }

    const field = parseField(trimmed);
    if (!field) return;

    result.push(
      baseRow({
        order: order++,
        kind: "field",
        domain,
        object: current.name,
        item: field.name,
        type: field.type,
        type_category: field.category,
        required: field.isRequired ? "yes" : "no",
        list: field.isList ? "yes" : "no",
        key: field.keys.join("; "),
        default: field.defaultValue,
        db_type: field.dbType,
        relation_target: field.relationTarget,
        relation_name: field.relationName,
        foreign_key: field.foreignKey.join("; "),
        references: field.references.join("; "),
        line,
      }),
    );
  });

  return result;
}

function parseField(line) {
  const parts = line.split(/\s+/);
  if (parts.length < 2) return null;

  const [name, type, ...restParts] = parts;
  const attributes = restParts.join(" ");
  const baseType = type.replace("[]", "").replace("?", "");
  const relation = parseRelation(attributes);
  const category = typeCategory(baseType);
  const keys = [];
  if (attributes.includes("@id")) keys.push("id");
  if (attributes.includes("@unique")) keys.push("unique");

  return {
    name,
    type,
    baseType,
    category,
    isList: type.endsWith("[]"),
    isRequired: !type.endsWith("?") && !type.endsWith("[]"),
    keys,
    defaultValue: readBalancedAttribute(attributes, "@default"),
    dbType: attributes.match(/@db\.(\w+)/)?.[1] ?? "",
    relationTarget: category === "relation" ? baseType : "",
    relationName: relation.name,
    foreignKey: relation.fields,
    references: relation.references,
  };
}

function parseRelation(attributes) {
  const body = readBalancedAttribute(attributes, "@relation");
  if (!body) return { name: "", fields: [], references: [] };
  return {
    name: body.match(/^"([^"]+)"/)?.[1] ?? "",
    fields: parseBracketList(body, "fields"),
    references: parseBracketList(body, "references"),
  };
}

function parseBracketList(text, key) {
  const match = text.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseModelAttribute(line) {
  const match = line.match(/^@@(\w+)/);
  return {
    name: match ? `@@${match[1]}` : "@@",
    value: line,
  };
}

function readBalancedAttribute(text, token) {
  const start = text.indexOf(`${token}(`);
  if (start === -1) return "";
  const bodyStart = start + token.length + 1;
  let depth = 1;
  for (let index = bodyStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) return text.slice(bodyStart, index);
  }
  return "";
}

function typeCategory(baseType) {
  if (SCALAR_TYPES.has(baseType)) return "scalar";
  if (enumNames.has(baseType)) return "enum";
  if (modelNames.has(baseType)) return "relation";
  return "unknown";
}

function buildDomainMap() {
  const map = new Map();
  for (const group of DOMAIN_GROUPS) {
    for (const model of group.models) {
      map.set(model, group.name);
    }
  }
  return map;
}

function baseRow(values) {
  return {
    order: "",
    kind: "",
    domain: "",
    object: "",
    item: "",
    type: "",
    type_category: "",
    required: "",
    list: "",
    key: "",
    default: "",
    db_type: "",
    relation_target: "",
    relation_name: "",
    foreign_key: "",
    references: "",
    line: "",
    ...values,
  };
}

function stripInlineComment(line) {
  const index = line.indexOf("//");
  return index === -1 ? line : line.slice(0, index);
}

function csvValue(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}
