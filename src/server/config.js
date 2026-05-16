const requiredInProduction = ["SESSION_SECRET"];

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET || "dev-only-change-me",
  databaseUrl: process.env.DATABASE_URL,
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackUrl: process.env.DISCORD_CALLBACK_URL || "http://localhost:3000/auth/discord/callback",
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    guildReconcileIntervalMs: Number(process.env.DISCORD_GUILD_RECONCILE_INTERVAL_MS || 15 * 60 * 1000),
  },
  steam: {
    webApiKey: process.env.STEAM_WEB_API_KEY,
  },
};

export function validateConfig() {
  if (config.nodeEnv !== "production") return;

  const missing = requiredInProduction.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }

  if (!config.databaseUrl) {
    console.warn("DATABASE_URL is not configured. Database-backed portal features will stay offline.");
  }

  if (!config.discord.clientId || !config.discord.clientSecret) {
    console.warn("Discord OAuth is not configured. Protected portal routes will return a setup message.");
  }

  if ((config.discord.botToken && !config.discord.guildId) || (!config.discord.botToken && config.discord.guildId)) {
    console.warn("Discord guild sync requires both DISCORD_BOT_TOKEN and DISCORD_GUILD_ID.");
  }
}
