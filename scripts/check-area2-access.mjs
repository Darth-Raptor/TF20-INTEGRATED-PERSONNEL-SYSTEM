import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schema = fs.readFileSync(path.join(projectRoot, "prisma", "schema.prisma"), "utf8");
const seed = fs.readFileSync(path.join(projectRoot, "prisma", "seed.mjs"), "utf8");

const requiredModels = [
  "AccessBootstrap",
  "SessionRevocation",
  "AccountRecoveryRequest",
  "AuthIdentity",
  "Session",
  "Permission",
  "RoleAssignment",
  "AuditLog",
];

const requiredEnums = [
  "BootstrapStatus",
  "SessionRevocationScope",
  "AccountStatus",
  "RoleScopeType",
];

const requiredFields = {
  Account: [
    "statusReason",
    "activatedAt",
    "lockedAt",
    "disabledAt",
    "archivedAt",
    "revokedSessions",
    "issuedSessionRevocations",
    "targetedSessionRevocations",
    "verifiedBootstraps",
    "completedBootstraps",
  ],
  AuthIdentity: ["lastGuildVerifiedAt", "guildMembershipRequired"],
  Session: ["lastAuthenticatedAt", "recentAuthExpiresAt", "revokedAt", "revokedByAccountId", "revocationReason"],
  Permission: ["module", "action", "sensitiveCategory", "requiresRecentAuth"],
  RoleAssignment: ["scopeType", "scopeIncludesDescendants", "unitId", "staffSectionId"],
  AccountRecoveryRequest: ["reviewedById", "completedById", "requestedIdentity", "decisionNote"],
  AccessBootstrap: ["configuredDiscordIdHash", "setupScope", "verifiedAt", "completedAt", "expiresAt"],
  SessionRevocation: ["scope", "targetAccountId", "issuedByAccountId", "reason"],
};

for (const enumName of requiredEnums) {
  assertPattern(new RegExp(`^enum\\s+${enumName}\\s+\\{`, "m"), `Missing Area 2 enum ${enumName}`);
}

for (const modelName of requiredModels) {
  assertPattern(new RegExp(`^model\\s+${modelName}\\s+\\{`, "m"), `Missing Area 2 model ${modelName}`);
}

for (const [modelName, fields] of Object.entries(requiredFields)) {
  const body = modelBody(modelName);
  for (const field of fields) {
    assertPattern(new RegExp(`^\\s*${field}\\s+`, "m"), `Missing Area 2 field ${modelName}.${field}`, body);
  }
}

const seededRoleOrPermission = /\b(role|permission)\.(create|upsert|createMany)\b/i.test(seed);
if (seededRoleOrPermission) {
  fail("Seed file must not create official roles or permissions before user verification.");
}

if (/Applicant|Member|Staff|Command|Admin|Recruiter|applications\.|personnel\.|audit\./.test(seed)) {
  fail("Seed file contains unverified access catalog values.");
}

console.log("Area 2 access foundation check passed.");

function modelBody(modelName) {
  const match = new RegExp(`^model\\s+${modelName}\\s+\\{([\\s\\S]*?)^}`, "m").exec(schema);
  if (!match) fail(`Missing model ${modelName}`);
  return match[1];
}

function assertPattern(pattern, message, text = schema) {
  if (!pattern.test(text)) fail(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
