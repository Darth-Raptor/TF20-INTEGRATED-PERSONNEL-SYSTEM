import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
const docPath = path.join(projectRoot, "docs", "api-frontend-contract.md");
const roadmapPath = path.join(projectRoot, "docs", "backend-planning-roadmap.md");
const readmePath = path.join(projectRoot, "README.md");

const schema = fs.readFileSync(schemaPath, "utf8");
const doc = fs.readFileSync(docPath, "utf8");
const roadmap = fs.readFileSync(roadmapPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");

const requiredDocPhrases = [
  "API style is hybrid REST, not pure CRUD and not full RPC.",
  "The public recruiting site is not part of Area 5.",
  "No user-facing Discord or Steam connection-management screen is defined in",
  "No legacy import, sync, fallback, or operator-triggered live import endpoint",
  "`/auth/*`",
  "`/me/*`",
  "`/applications/*`",
  "`/personnel/*`",
  "`/loa/*`",
  "`/events/*`",
  "`/attendance/*`",
  "`/training/*`",
  "`/qualifications/*`",
  "`/promotions/*`",
  "`/awards/*`",
  "`/support/*`",
  "`/notifications/*`",
  "`/audit/*`",
  "`/access/*`",
  "`/bootstrap/*`",
  "Response bodies use consistent top-level keys:",
  "The backend is authoritative for module visibility and scope filtering.",
  "Notifications support list, acknowledge, and archive only.",
];

for (const phrase of requiredDocPhrases) {
  if (!doc.includes(phrase)) {
    fail(`Area 5 doc is missing required contract text: ${phrase}`);
  }
}

const requiredModels = [
  "Account",
  "Session",
  "SessionRevocation",
  "RoleAssignment",
  "AccountRecoveryRequest",
  "AccessBootstrap",
  "Application",
  "ApplicationStatusHistory",
  "PersonnelProfile",
  "LoaRequest",
  "Event",
  "EventAttendance",
  "TrainingRecord",
  "PersonnelQualification",
  "PromotionRequest",
  "PromotionRecord",
  "AwardRequest",
  "AwardRecord",
  "SupportTicket",
  "SupportTicketComment",
  "Notification",
  "AuditLog",
  "IntegrationLog",
];

for (const modelName of requiredModels) {
  requireModel(modelName);
}

requireField("Session", "recentAuthExpiresAt", "DateTime?");
requireField("Session", "revokedAt", "DateTime?");
requireField("SessionRevocation", "scope", "SessionRevocationScope");
requireField("AccountRecoveryRequest", "status", "RecoveryStatus");
requireField("AccessBootstrap", "status", "BootstrapStatus");
requireField("RoleAssignment", "scopeType", "RoleScopeType");
requireField("RoleAssignment", "scopeIncludesDescendants", "Boolean");
requireField("Application", "status", "ApplicationStatus");
requireField("Application", "targetUnitId", "String");
requireField("PersonnelProfile", "status", "PersonnelStatus");
requireField("LoaRequest", "status", "LoaStatus");
requireField("LoaRequest", "approvalLevel", "LoaApprovalLevel");
requireField("EventAttendance", "status", "AttendanceStatus");
requireField("SupportTicket", "status", "SupportTicketStatus");
requireField("Notification", "status", "NotificationStatus");
requireField("Notification", "deliveryChannel", "NotificationDeliveryChannel");
requireField("AuditLog", "protectedWrite", "Boolean");

requireEnumValue("NotificationDeliveryChannel", "InApp");
forbidEnumValue("NotificationDeliveryChannel", "Discord");
forbidEnumValue("AuthProvider", "Steam");

const forbiddenLegacyPatterns = [
  /Airtable/i,
  /legacy import endpoint/i,
  /public recruiting-site screen contract/i,
];

if (!doc.includes("No public recruiting-site screen contract.")) {
  fail("Area 5 doc must explicitly exclude the public recruiting-site contract.");
}

for (const pattern of forbiddenLegacyPatterns) {
  if (pattern.test(schema)) {
    fail(`Area 5 schema unexpectedly contains forbidden legacy/public contract surface: ${pattern}`);
  }
}

if (!roadmap.includes("5. API and frontend contract: implemented in")) {
  fail("Roadmap does not mark Area 5 as implemented.");
}

if (!readme.includes("Area 5")) {
  fail("README has not been refreshed to acknowledge Area 5.");
}

console.log("Area 5 API/frontend contract check passed.");

function requireModel(modelName) {
  if (!new RegExp(`^model\\s+${modelName}\\s+\\{`, "m").test(schema)) {
    fail(`Missing Area 5 support model: ${modelName}`);
  }
}

function requireEnumValue(enumName, valueName) {
  const body = getBlockBody(schema, "enum", enumName);
  if (!new RegExp(`^\\s*${valueName}\\s*$`, "m").test(body)) {
    fail(`Missing enum value ${enumName}.${valueName}`);
  }
}

function forbidEnumValue(enumName, valueName) {
  const body = getBlockBody(schema, "enum", enumName);
  if (new RegExp(`^\\s*${valueName}\\s*$`, "m").test(body)) {
    fail(`Unexpected enum value ${enumName}.${valueName} is present.`);
  }
}

function requireField(modelName, fieldName, fieldType) {
  const body = getBlockBody(schema, "model", modelName);
  const pattern = new RegExp(
    `^\\s*${escapeRegExp(fieldName)}\\s+${escapeRegExp(fieldType)}(?:\\s|$)`,
    "m",
  );

  if (!pattern.test(body)) {
    fail(`Missing field ${modelName}.${fieldName} with expected type ${fieldType}`);
  }
}

function getBlockBody(schemaText, blockType, blockName) {
  const match = new RegExp(`^${blockType}\\s+${blockName}\\s+\\{([\\s\\S]*?)^}`, "m").exec(schemaText);
  if (!match) fail(`Missing ${blockType} ${blockName}`);
  return match[1];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
