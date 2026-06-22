import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const configModuleUrl = pathToFileURL("src/server/config.mjs").href;

test("loadConfig fails clearly when required env vars are missing", () => {
  const result = runConfigProbe(`
    import { loadConfig } from ${JSON.stringify(configModuleUrl)};
    try {
      loadConfig();
      process.exit(2);
    } catch (error) {
      if (!String(error.message).includes("Missing required environment variables")) {
        console.error(error.message);
        process.exit(3);
      }
    }
  `);

  assert.equal(result.status, 0, result.stderr);
});

test("loadConfig parses runtime defaults and overrides", () => {
  const result = runConfigProbe(`
    import assert from "node:assert/strict";
    import { loadConfig } from ${JSON.stringify(configModuleUrl)};
    const config = loadConfig({
      DATABASE_URL: "mysql://user:pass@127.0.0.1:3306/tf20_config_test",
      SESSION_SECRET: "session-secret",
      APP_BASE_URL: "http://127.0.0.1:3000",
      DISCORD_CLIENT_ID: "client",
      DISCORD_CLIENT_SECRET: "secret",
      DISCORD_REDIRECT_URI: "http://127.0.0.1:3000/auth/discord/callback",
      DISCORD_APPROVED_GUILD_ID: "guild",
      DISCORD_BOT_TOKEN: "bot",
      BOOTSTRAP_DISCORD_ID: "bootstrap",
      SESSION_TTL_DAYS: "14",
      RECENT_AUTH_WINDOW_MINUTES: "20",
      TRUST_PROXY: "true"
    });
    assert.equal(config.sessionTtlDays, 14);
    assert.equal(config.recentAuthWindowMinutes, 20);
    assert.equal(config.trustProxy, true);
    assert.equal(config.cookieDomain, undefined);
    assert.equal(config.discordRecruitingBridge.enabled, false);
    assert.equal(config.discordMembershipEventIngest.enabled, false);
    assert.equal(
      config.discordRecruitingBridge.url,
      "http://127.0.0.1:8787/ips/recruiting-event",
    );
  `);

  assert.equal(result.status, 0, result.stderr);
});

test("loadConfig enables discord membership ingest when a secret is present", () => {
  const result = runConfigProbe(`
    import assert from "node:assert/strict";
    import { loadConfig } from ${JSON.stringify(configModuleUrl)};
    const config = loadConfig({
      DATABASE_URL: "mysql://user:pass@127.0.0.1:3306/tf20_config_test",
      SESSION_SECRET: "session-secret",
      APP_BASE_URL: "http://127.0.0.1:3000",
      DISCORD_CLIENT_ID: "client",
      DISCORD_CLIENT_SECRET: "secret",
      DISCORD_REDIRECT_URI: "http://127.0.0.1:3000/auth/discord/callback",
      DISCORD_APPROVED_GUILD_ID: "guild",
      DISCORD_BOT_TOKEN: "bot",
      BOOTSTRAP_DISCORD_ID: "bootstrap",
      SESSION_TTL_DAYS: "14",
      RECENT_AUTH_WINDOW_MINUTES: "20",
      DISCORD_MEMBERSHIP_EVENT_INGEST_SECRET: "ingest-secret"
    });
    assert.equal(config.discordMembershipEventIngest.enabled, true);
    assert.equal(config.discordMembershipEventIngest.secret, "ingest-secret");
  `);

  assert.equal(result.status, 0, result.stderr);
});

test("loadConfig derives a shared cookie domain from www app URLs", () => {
  const result = runConfigProbe(`
    import assert from "node:assert/strict";
    import { loadConfig } from ${JSON.stringify(configModuleUrl)};
    const config = loadConfig({
      DATABASE_URL: "mysql://user:pass@127.0.0.1:3306/tf20_config_test",
      SESSION_SECRET: "session-secret",
      APP_BASE_URL: "https://www.taskforce20.com",
      DISCORD_CLIENT_ID: "client",
      DISCORD_CLIENT_SECRET: "secret",
      DISCORD_REDIRECT_URI: "https://www.taskforce20.com/auth/discord/callback",
      DISCORD_APPROVED_GUILD_ID: "guild",
      DISCORD_BOT_TOKEN: "bot",
      BOOTSTRAP_DISCORD_ID: "bootstrap",
      SESSION_TTL_DAYS: "14",
      RECENT_AUTH_WINDOW_MINUTES: "20"
    });
    assert.equal(config.cookieDomain, "taskforce20.com");
  `);

  assert.equal(result.status, 0, result.stderr);
});

function runConfigProbe(source) {
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.env.TEMP ?? process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      Path: process.env.Path,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
    },
  });
}
