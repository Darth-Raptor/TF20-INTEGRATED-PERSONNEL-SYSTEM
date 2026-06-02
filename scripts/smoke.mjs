import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";

const projectRoot = process.cwd();
const serverPort = 43123;

const requiredPaths = [
  path.join(projectRoot, "prisma", "schema.prisma"),
  path.join(projectRoot, "docs", "source-of-truth-data-model.md"),
  path.join(projectRoot, "docs", "identity-roles-access.md"),
  path.join(projectRoot, "docs", "portal-workflows.md"),
  path.join(projectRoot, "docs", "external-connections.md"),
  path.join(projectRoot, "docs", "api-frontend-contract.md"),
  path.join(projectRoot, "docs", "operations-security-testing.md"),
  path.join(projectRoot, "docs", "catalog-governance.md"),
  path.join(projectRoot, "prisma", "catalog-source.mjs"),
  path.join(projectRoot, "scripts", "check-area1-model.mjs"),
  path.join(projectRoot, "scripts", "check-area2-access.mjs"),
  path.join(projectRoot, "scripts", "check-area3-workflows.mjs"),
  path.join(projectRoot, "scripts", "check-area4-external-connections.mjs"),
  path.join(projectRoot, "scripts", "check-area5-api-frontend-contract.mjs"),
  path.join(projectRoot, "scripts", "check-area6-operations-security-testing.mjs"),
  path.join(projectRoot, "scripts", "check-catalog-source.mjs"),
  path.join(projectRoot, "src", "server", "index.mjs"),
  path.join(projectRoot, "src", "server", "app.mjs"),
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

await runRuntimeSmoke();

console.log("Smoke check passed for restart-branch boot prerequisites.");

async function runRuntimeSmoke() {
  const expressPackage = path.join(projectRoot, "node_modules", "express", "package.json");
  const prismaClientPackage = path.join(projectRoot, "node_modules", "@prisma", "client", "package.json");
  if (!fs.existsSync(expressPackage) || !fs.existsSync(prismaClientPackage)) {
    console.log("Smoke skipped runtime boot because local dependencies are not installed.");
    return;
  }

  const child = spawn(process.execPath, ["src/server/index.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(serverPort),
      NODE_ENV: "test",
      DATABASE_URL: "mysql://tf20_user:replace-password@127.0.0.1:3306/tf20_smoke",
      SESSION_SECRET: "smoke-session-secret",
      APP_BASE_URL: `http://127.0.0.1:${serverPort}`,
      DISCORD_CLIENT_ID: "smoke-client-id",
      DISCORD_CLIENT_SECRET: "smoke-client-secret",
      DISCORD_REDIRECT_URI: `http://127.0.0.1:${serverPort}/auth/discord/callback`,
      DISCORD_APPROVED_GUILD_ID: "smoke-guild-id",
      DISCORD_BOT_TOKEN: "smoke-bot-token",
      BOOTSTRAP_DISCORD_ID: "smoke-bootstrap-discord-id",
      SESSION_TTL_DAYS: "7",
      RECENT_AUTH_WINDOW_MINUTES: "15",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let bootOutput = "";
  child.stdout.on("data", (chunk) => {
    bootOutput += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    bootOutput += chunk.toString();
  });

  const started = await waitForBoot(child, bootOutput);
  if (!started) {
    child.kill("SIGTERM");
    fail("Smoke runtime boot did not start the HTTP server.");
  }

  const response = await fetch(`http://127.0.0.1:${serverPort}/health`);
  if (!response.ok) {
    child.kill("SIGTERM");
    fail(`Smoke runtime health check failed with ${response.status}`);
  }

  child.kill("SIGTERM");
  await once(child, "exit");
}

async function waitForBoot(child, initialOutput) {
  if (initialOutput.includes("TF20 runtime foundation listening")) {
    return true;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, 5000);

    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes("TF20 runtime foundation listening")) {
        cleanup();
        resolve(true);
      }
    };

    const onExit = () => {
      cleanup();
      resolve(false);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.on("exit", onExit);
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
