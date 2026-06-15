import fs from "node:fs";
import path from "node:path";

const REQUIRED_ENV_KEYS = [
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
];

export function loadConfig(overrides = {}) {
  loadDotEnv();

  const env = { ...process.env, ...overrides };
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    nodeEnv: env.NODE_ENV ?? "development",
    port: parseInteger(env.PORT, 3000),
    appBaseUrl: env.APP_BASE_URL,
    databaseUrl: env.DATABASE_URL,
    sessionSecret: env.SESSION_SECRET,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "tf20_session",
    oauthStateCookieName: env.OAUTH_STATE_COOKIE_NAME ?? "tf20_oauth_state",
    sessionTtlDays: parseInteger(env.SESSION_TTL_DAYS, 7),
    recentAuthWindowMinutes: parseInteger(env.RECENT_AUTH_WINDOW_MINUTES, 15),
    discord: {
      clientId: env.DISCORD_CLIENT_ID,
      clientSecret: env.DISCORD_CLIENT_SECRET,
      redirectUri: env.DISCORD_REDIRECT_URI,
      approvedGuildId: env.DISCORD_APPROVED_GUILD_ID,
      botToken: env.DISCORD_BOT_TOKEN,
    },
    discordRecruitingBridge: {
      enabled: parseBoolean(env.DISCORD_RECRUITING_BRIDGE_ENABLED, false),
      url: env.DISCORD_RECRUITING_BRIDGE_URL ?? "http://127.0.0.1:8787/ips/recruiting-event",
      secret: env.DISCORD_RECRUITING_BRIDGE_SECRET ?? "",
      intervalMs: parseInteger(env.DISCORD_RECRUITING_BRIDGE_INTERVAL_MS, 15000),
      timeoutMs: parseInteger(env.DISCORD_RECRUITING_BRIDGE_TIMEOUT_MS, 8000),
      batchSize: parseInteger(env.DISCORD_RECRUITING_BRIDGE_BATCH_SIZE, 10),
      maxAttempts: parseInteger(env.DISCORD_RECRUITING_BRIDGE_MAX_ATTEMPTS, 8),
    },
    bootstrapDiscordId: env.BOOTSTRAP_DISCORD_ID,
    isProduction: (env.NODE_ENV ?? "development") === "production",
    trustProxy: env.TRUST_PROXY === "true",
  };
}

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = stripQuotes(rawValue);
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}
