import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

import { createApp } from "../../src/server/app.mjs";

test("discord auth start preserves application return target for public apply", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.url}/auth/discord/start?returnTo=/user/application`, {
      redirect: "manual",
    });

    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^https:\/\/discord\.com\/oauth2\/authorize/);

    const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")];
    const cookieText = cookies.filter(Boolean).join("\n");
    assert.match(cookieText, /tf20_oauth_state=/);
    assert.match(cookieText, /tf20_oauth_state_return=/);
  } finally {
    await server.close();
  }
});

test("discord auth start ignores unsafe return targets", async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.url}/auth/discord/start?returnTo=https://evil.test`, {
      redirect: "manual",
    });

    assert.equal(response.status, 302);
    const cookies = response.headers.getSetCookie?.() ?? [response.headers.get("set-cookie")];
    const cookieText = cookies.filter(Boolean).join("\n");
    assert.match(cookieText, /tf20_oauth_state=/);
    assert.doesNotMatch(cookieText, /tf20_oauth_state_return=/);
  } finally {
    await server.close();
  }
});

async function startTestServer() {
  const app = createApp({
    prisma: {},
    config: {
      nodeEnv: "test",
      discord: {
        clientId: "discord-client",
        redirectUri: "http://127.0.0.1/auth/discord/callback",
      },
      isProduction: false,
      oauthStateCookieName: "tf20_oauth_state",
      sessionCookieName: "tf20_session",
      sessionSecret: "test-session-secret",
      sessionTtlDays: 7,
      trustProxy: false,
    },
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
