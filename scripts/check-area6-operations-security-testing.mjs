import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const schemaPath = path.join(projectRoot, "prisma", "schema.prisma");
const docPath = path.join(projectRoot, "docs", "operations-security-testing.md");
const roadmapPath = path.join(projectRoot, "docs", "backend-planning-roadmap.md");
const readmePath = path.join(projectRoot, "README.md");
const envExamplePath = path.join(projectRoot, ".env.example");
const workflowPath = path.join(projectRoot, ".github", "workflows", "check.yml");
const packageJsonPath = path.join(projectRoot, "package.json");

const schema = fs.readFileSync(schemaPath, "utf8");
const doc = fs.readFileSync(docPath, "utf8");
const roadmap = fs.readFileSync(roadmapPath, "utf8");
const readme = fs.readFileSync(readmePath, "utf8");
const envExample = fs.readFileSync(envExamplePath, "utf8");
const workflow = fs.readFileSync(workflowPath, "utf8");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const requiredDocPhrases = [
  "Production baseline is single VPS plus systemd",
  "Runtime configuration is environment-based and stays outside git.",
  "Secrets are env-only with strict rotation",
  "The authoritative minimum automated gate is:",
  "daily database backups are required",
  "The branch-supported CI floor must match the actual scripts present",
  "no secrets in git-managed operational files",
];

for (const phrase of requiredDocPhrases) {
  if (!doc.includes(phrase)) {
    fail(`Area 6 doc is missing required operational text: ${phrase}`);
  }
}

for (const modelName of ["Session", "SessionRevocation", "AccountRecoveryRequest", "AccessBootstrap", "AuditLog", "IntegrationLog"]) {
  requireModel(modelName);
}

requireField("Session", "recentAuthExpiresAt", "DateTime?");
requireField("Session", "revokedAt", "DateTime?");
requireField("SessionRevocation", "reason", "String");
requireField("AccountRecoveryRequest", "status", "RecoveryStatus");
requireField("AccessBootstrap", "expiresAt", "DateTime?");
requireField("AuditLog", "createdAt", "DateTime");
requireField("IntegrationLog", "status", "IntegrationLogStatus");

const requiredEnvKeys = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "APP_BASE_URL",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_REDIRECT_URI",
  "DISCORD_APPROVED_GUILD_ID",
  "DISCORD_BOT_TOKEN",
  "BOOTSTRAP_DISCORD_ID",
  "SESSION_TTL_DAYS",
  "RECENT_AUTH_WINDOW_MINUTES",
  "STEAM_API_KEY",
  "STEAM_OPENID_REALM",
  "STEAM_OPENID_RETURN_URL",
];

for (const key of requiredEnvKeys) {
  if (!new RegExp(`^${key}=`, "m").test(envExample)) {
    fail(`.env.example is missing required Area 6 variable ${key}`);
  }
}

if (!packageJson.scripts?.smoke) {
  fail("package.json must define the Area 6 smoke script.");
}

const requiredWorkflowSnippets = [
  "npm install",
  "npm run prisma:generate",
  "npm run check",
  "npm run smoke",
];

for (const snippet of requiredWorkflowSnippets) {
  if (!workflow.includes(snippet)) {
    fail(`GitHub Actions workflow is missing required Area 6 step: ${snippet}`);
  }
}

if (workflow.includes("npm run access:audit")) {
  fail("GitHub Actions workflow still contains stale access:audit step.");
}

if (!roadmap.includes("6. Operations, security, and testing: implemented in")) {
  fail("Roadmap does not mark Area 6 as implemented.");
}

if (!readme.includes("Area 6")) {
  fail("README has not been refreshed to acknowledge Area 6.");
}

console.log("Area 6 operations/security/testing check passed.");

function requireModel(modelName) {
  if (!new RegExp(`^model\\s+${modelName}\\s+\\{`, "m").test(schema)) {
    fail(`Missing Area 6 support model: ${modelName}`);
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
