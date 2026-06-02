import fs from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();

const requiredPaths = [
  path.join(projectRoot, "prisma", "schema.prisma"),
  path.join(projectRoot, "docs", "source-of-truth-data-model.md"),
  path.join(projectRoot, "docs", "identity-roles-access.md"),
  path.join(projectRoot, "docs", "portal-workflows.md"),
  path.join(projectRoot, "docs", "external-connections.md"),
  path.join(projectRoot, "docs", "api-frontend-contract.md"),
  path.join(projectRoot, "docs", "operations-security-testing.md"),
  path.join(projectRoot, "scripts", "check-area1-model.mjs"),
  path.join(projectRoot, "scripts", "check-area2-access.mjs"),
  path.join(projectRoot, "scripts", "check-area3-workflows.mjs"),
  path.join(projectRoot, "scripts", "check-area4-external-connections.mjs"),
  path.join(projectRoot, "scripts", "check-area5-api-frontend-contract.mjs"),
  path.join(projectRoot, "scripts", "check-area6-operations-security-testing.mjs"),
];

for (const requiredPath of requiredPaths) {
  if (!fs.existsSync(requiredPath)) {
    fail(`Smoke check missing required project file: ${path.relative(projectRoot, requiredPath)}`);
  }
}

const envExample = fs.readFileSync(path.join(projectRoot, ".env.example"), "utf8");
for (const key of [
  "DATABASE_URL",
  "SESSION_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_APPROVED_GUILD_ID",
  "DISCORD_BOT_TOKEN",
]) {
  if (!new RegExp(`^${key}=`, "m").test(envExample)) {
    fail(`Smoke check missing required environment placeholder ${key}`);
  }
}

console.log("Smoke check passed for restart-branch boot prerequisites.");

function fail(message) {
  console.error(message);
  process.exit(1);
}
