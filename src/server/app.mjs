import express from "express";

import {
  buildDiscordAuthorizationUrl,
  buildSessionSummary,
  createSession,
  exchangeDiscordCode,
  fetchDiscordUser,
  flattenPermissions,
  logIntegration,
  resolveAuthenticatedAccount,
  verifyDiscordGuildMembership,
} from "./auth-service.mjs";
import { buildAccessContext } from "./access.mjs";
import { appendCookie, buildCookie, createRandomId, signCookieValue } from "./cookies.mjs";
import { sendDetail, sendError } from "./errors.mjs";
import { buildRequestContextMiddleware, requireAuthenticatedSession } from "./middleware.mjs";
import {
  renderAuthenticatedScreen,
  renderBlockedScreen,
  renderLoginScreen,
  renderPendingScreen,
} from "./views.mjs";

export function createApp({ prisma, config }) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) {
    app.set("trust proxy", true);
  }

  app.use(express.json());
  app.use(buildRequestContextMiddleware({ prisma, config }));

  app.get("/health", (req, res) => {
    res.status(200).json({
      data: {
        ok: true,
        service: "tf20-runtime-foundation",
        environment: config.nodeEnv,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.get("/", async (req, res, next) => {
    try {
      if (!req.context?.account) {
        return res.status(200).send(renderLoginScreen());
      }

      const permissions = flattenPermissions(req.context.account);
      const access = buildAccessContext({ account: req.context.account, permissions });

      if (access.gateState === "pending") {
        return res.status(200).send(renderPendingScreen(buildSessionSummary({
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        })));
      }

      if (access.gateState !== "active") {
        return res.status(200).send(renderBlockedScreen(access.gateState));
      }

      return res.status(200).send(renderAuthenticatedScreen(buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      })));
    } catch (error) {
      return next(error);
    }
  });

  app.get("/auth/discord/start", async (req, res, next) => {
    try {
      const state = createRandomId();
      const cookie = buildCookie(
        config.oauthStateCookieName,
        signCookieValue(state, config.sessionSecret),
        {
          secure: config.isProduction,
          maxAgeSeconds: 10 * 60,
        },
      );
      appendCookie(res, cookie);
      const authUrl = await buildDiscordAuthorizationUrl(config, state);
      return res.redirect(authUrl);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/auth/discord/callback", async (req, res, next) => {
    try {
      const { code, state } = req.query;
      if (!code || !state) {
        return sendError(res, 400, "invalid_oauth_callback", "Missing OAuth callback parameters.");
      }

      const signedState = req.headers.cookie
        ?.split(";")
        .find((cookie) => cookie.trim().startsWith(`${config.oauthStateCookieName}=`))
        ?.split("=")
        ?.slice(1)
        ?.join("=")
        ?.trim();

      const expectedState = signedState
        ? signCookieValue(state, config.sessionSecret)
        : null;

      if (!signedState || signedState !== expectedState) {
        return sendError(res, 400, "invalid_oauth_state", "OAuth state verification failed.");
      }

      const tokenPayload = await exchangeDiscordCode(config, code);
      const discordUser = await fetchDiscordUser(tokenPayload.access_token);
      const guildVerification = await verifyDiscordGuildMembership(config, discordUser.id);

      if (!guildVerification.isMember) {
        await logIntegration(prisma, {
          provider: "Discord",
          action: "guild-verification-denied",
          status: "Failure",
          requestPayload: {
            discordUserId: discordUser.id,
          },
          responsePayload: {
            approvedGuildId: config.discord.approvedGuildId,
          },
          error: "User is not a member of the approved Discord guild.",
        });
        return res.redirect("/auth/blocked?reason=not_in_guild");
      }

      await logIntegration(prisma, {
        provider: "Discord",
        action: "guild-verification-passed",
        status: "Success",
        requestPayload: {
          discordUserId: discordUser.id,
        },
        responsePayload: guildVerification.payload ?? {},
      });

      const resolved = await resolveAuthenticatedAccount({
        prisma,
        config,
        discordUser,
        guildPayload: guildVerification.payload,
      });

      const session = await createSession({
        prisma,
        config,
        account: resolved.account,
        authIdentity: resolved.authIdentity,
      });

      await logIntegration(prisma, {
        provider: "Discord",
        action: "oauth-session-created",
        status: "Success",
        accountId: resolved.account.id,
        relatedRecordType: "Session",
        relatedRecordId: session.id,
        requestPayload: {
          discordUserId: discordUser.id,
        },
        responsePayload: {
          accountStatus: resolved.account.status,
          createdPendingAccount: resolved.created,
        },
      });

      appendCookie(
        res,
        buildCookie(
          config.sessionCookieName,
          signCookieValue(session.id, config.sessionSecret),
          {
            secure: config.isProduction,
            maxAgeSeconds: config.sessionTtlDays * 24 * 60 * 60,
          },
        ),
      );

      if (resolved.account.status === "Pending") {
        return res.redirect("/");
      }

      if (resolved.account.status !== "Active") {
        return res.redirect(`/auth/blocked?reason=${resolved.account.status.toLowerCase()}`);
      }

      return res.redirect("/");
    } catch (error) {
      return next(error);
    }
  });

  app.get("/auth/logout", async (req, res, next) => {
    try {
      if (req.context?.session) {
        await prisma.session.update({
          where: { id: req.context.session.id },
          data: {
            revokedAt: new Date(),
            revocationReason: "User initiated logout.",
          },
        });
      }

      appendCookie(
        res,
        buildCookie(config.sessionCookieName, "", {
          secure: config.isProduction,
          maxAgeSeconds: 0,
          expires: new Date(0),
        }),
      );

      return res.redirect("/");
    } catch (error) {
      return next(error);
    }
  });

  app.post("/auth/recent-auth", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const recentAuthExpiresAt = new Date(
        Date.now() + config.recentAuthWindowMinutes * 60 * 1000,
      );

      const session = await prisma.session.update({
        where: { id: req.context.session.id },
        data: {
          lastAuthenticatedAt: new Date(),
          recentAuthExpiresAt,
        },
      });

      return sendDetail(res, {
        sessionId: session.id,
        recentAuthExpiresAt: session.recentAuthExpiresAt,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/auth/blocked", (req, res) => {
    const reason = String(req.query.reason ?? "blocked");
    res.status(200).send(renderBlockedScreen(reason));
  });

  app.get("/me", requireAuthenticatedSession, async (req, res) => {
    const summary = buildSessionSummary({
      account: req.context.account,
      session: req.context.session,
      authIdentity: req.context.authIdentity,
    });

    return sendDetail(res, summary);
  });

  app.get("/me/gate", requireAuthenticatedSession, async (req, res) => {
    const permissions = flattenPermissions(req.context.account);
    const access = buildAccessContext({ account: req.context.account, permissions });
    return sendDetail(res, {
      gateState: access.gateState,
      accountStatus: req.context.account.status,
    });
  });

  app.get("/me/modules", requireAuthenticatedSession, async (req, res) => {
    const permissions = flattenPermissions(req.context.account);
    const access = buildAccessContext({ account: req.context.account, permissions });
    return sendDetail(res, {
      visibleModules: access.visibleModules,
      permissions: Array.from(new Set(permissions.map((permission) => permission.key))).sort(),
    });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    return sendError(
      res,
      500,
      "internal_error",
      error instanceof Error ? error.message : "Unexpected server error.",
    );
  });

  return app;
}
