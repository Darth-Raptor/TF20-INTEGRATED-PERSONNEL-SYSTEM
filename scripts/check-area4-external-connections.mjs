import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
const docPath = path.join(projectRoot, "docs", "external-connections.md");
const roadmapPath = path.join(projectRoot, "docs", "backend-planning-roadmap.md");
const readmePath = path.join(projectRoot, "README.md");

const schema = fs.readFileSync(schemaPath, "utf8");
const doc = fs.readFileSync(docPath, "utf8");
const roadmap = fs.readFileSync(roadmapPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

const requiredDocPhrases = [
  "Discord remains the only login provider.",
  "Discord covers OAuth login, approved-guild membership verification, guild",
  "Steam is optional and limited to link or unlink workflow, identity",
  "No legacy runtime integrations exist at all after migration.",
  "Airtable and every prior roster or application integration are excluded from",
  "Every Discord and Steam action writes an `IntegrationLog` record.",
  "No Steam login flow.",
];

for (const phrase of requiredDocPhrases) {
  if (!doc.includes(phrase)) {
    fail(`Area 4 doc is missing locked decision text: ${phrase}`);
  }
}

requireModel("AuthIdentity");
requireModel("Notification");
requireModel("IntegrationLog");
requireModel("AuditLog");

requireEnumValue("AuthProvider", "Discord");
forbidEnumValue("AuthProvider", "Steam");

requireField("AuthIdentity", "provider", "AuthProvider");
requireField("AuthIdentity", "providerAccountId", "String");
requireField("AuthIdentity", "lastGuildVerifiedAt", "DateTime?");
requireField("AuthIdentity", "guildMembershipRequired", "Boolean");
requireField("AuthIdentity", "linkedAt", "DateTime");
requireField("AuthIdentity", "unlinkedAt", "DateTime?");
requireField("AuthIdentity", "metadata", "Json?");

requireField("Notification", "deliveryChannel", "NotificationDeliveryChannel");
requireField("Notification", "workflowEvent", "String?");
requireField("Notification", "relatedRecordType", "String?");
requireField("Notification", "relatedRecordId", "String?");

requireField("IntegrationLog", "provider", "String");
requireField("IntegrationLog", "action", "String");
requireField("IntegrationLog", "status", "IntegrationLogStatus");
requireField("IntegrationLog", "accountId", "String?");
requireField("IntegrationLog", "relatedRecordType", "String?");
requireField("IntegrationLog", "relatedRecordId", "String?");
requireField("IntegrationLog", "requestPayload", "Json?");
requireField("IntegrationLog", "responsePayload", "Json?");
requireField("IntegrationLog", "error", "String?");

requireField("AuditLog", "module", "String");
requireField("AuditLog", "action", "String");
requireField("AuditLog", "recordType", "String?");
requireField("AuditLog", "recordId", "String?");
requireField("AuditLog", "reason", "String?");

const forbiddenLegacyPatterns = [
  /model\s+Airtable/i,
  /enum\s+Legacy/i,
  /AIRTABLE_/,
];

for (const pattern of forbiddenLegacyPatterns) {
  if (pattern.test(schema) || pattern.test(doc)) {
    fail(`Area 4 runtime planning still contains legacy integration surface: ${pattern}`);
  }
}

if (!roadmap.includes("4. External connections: implemented in `docs/external-connections.md` and")) {
  fail("Roadmap does not mark Area 4 as implemented.");
}

if (!readme.includes("Area 4")) {
  fail("README has not been refreshed to acknowledge Area 4.");
}

console.log("Area 4 external-connections check passed.");

function requireModel(modelName) {
  if (!new RegExp(`^model\\s+${modelName}\\s+\\{`, "m").test(schema)) {
    fail(`Missing Area 4 support model: ${modelName}`);
  }
}

function requireEnumValue(enumName, valueName) {
  const enumBody = getBlockBody(schema, "enum", enumName);
  if (!new RegExp(`^\\s*${valueName}\\s*$`, "m").test(enumBody)) {
    fail(`Missing enum value ${enumName}.${valueName}`);
  }
}

function forbidEnumValue(enumName, valueName) {
  const enumBody = getBlockBody(schema, "enum", enumName);
  if (new RegExp(`^\\s*${valueName}\\s*$`, "m").test(enumBody)) {
    fail(`Unexpected enum value ${enumName}.${valueName} is present.`);
  }
}

function requireField(modelName, fieldName, fieldType) {
  const modelBody = getBlockBody(schema, "model", modelName);
  const fieldPattern = new RegExp(
    `^\\s*${escapeRegExp(fieldName)}\\s+${escapeRegExp(fieldType)}(?:\\s|$)`,
    "m",
  );

  if (!fieldPattern.test(modelBody)) {
    fail(`Missing field ${modelName}.${fieldName} with expected type ${fieldType}`);
  }
}

function getBlockBody(schemaText, blockType, blockName) {
  const pattern = new RegExp(`^${blockType}\\s+${blockName}\\s+\\{([\\s\\S]*?)^}`, "m");
  const match = schemaText.match(pattern);
  if (!match) {
    fail(`Missing ${blockType} ${blockName}`);
  }
  return match[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
