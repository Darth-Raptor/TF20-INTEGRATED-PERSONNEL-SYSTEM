import express from "express";

import {
  applicantFormState,
  assignApplicationUnit,
  canCreateOwnApplication,
  canRecruiterReview,
  canReviewApplicationRecord,
  canTargetUnitReview,
  canViewOwnApplication,
  createOrResumeOwnApplication,
  getApplicationById,
  getApplicationUnits,
  getOwnApplication,
  isHtmlRequest,
  listReviewQueue,
  recommendApplication,
  rejectApplication,
  acceptApplication,
} from "./application-service.mjs";
import {
  canUpdateScopedPersonnel,
  canViewOwnPersonnel,
  canViewScopedPersonnel,
  getOwnPersonnelProfile,
  getPersonnelLookupData,
  getPersonnelProfileById,
  getScopedUnitFilters,
  listScopedPersonnel,
  updatePersonnelProfile,
} from "./personnel-service.mjs";
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
  renderApplicationReviewDetailScreen,
  renderApplicationReviewQueueScreen,
  renderAuthenticatedScreen,
  renderBlockedScreen,
  renderLoginScreen,
  renderOwnApplicationScreen,
  renderPersonnelDetailScreen,
  renderPersonnelRosterScreen,
  renderPersonnelSelfScreen,
  renderPendingScreen,
} from "./views.mjs";

export function createApp({ prisma, config, requestShutdown = () => {} }) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) {
    app.set("trust proxy", true);
  }

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
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

  app.get(["/applications/me", "/applications/mine"], requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canCreateOwnApplication(req.context.account) && !canViewOwnApplication(req.context.account)) {
        return sendError(res, 403, "permission_denied", "Application self-service is not available.");
      }

      const [application, units] = await Promise.all([
        getOwnApplication(prisma, req.context.account.id),
        getApplicationUnits(prisma),
      ]);
      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(renderOwnApplicationScreen({
          summary,
          application,
          units,
          formState: applicantFormState(),
          errorMessage: null,
        }));
      }

      return sendDetail(res, { application, units });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/personnel/self", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canViewOwnPersonnel(req.context.account)) {
        return sendError(res, 403, "permission_denied", "Personnel self-view is not available.");
      }

      const profile = await getOwnPersonnelProfile(prisma, req.context.account.id);
      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(renderPersonnelSelfScreen({ summary, profile }));
      }

      return sendDetail(res, profile);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/personnel", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canViewScopedPersonnel(req.context.account)) {
        return sendError(res, 403, "permission_denied", "Scoped personnel view is required.");
      }

      const [listResult, unitResult] = await Promise.all([
        listScopedPersonnel(prisma, req.context.account, req.query),
        getScopedUnitFilters(prisma, req.context.account),
      ]);

      if (!listResult.ok) {
        return sendError(res, listResult.code === "permission_denied" ? 403 : 400, listResult.code, listResult.message);
      }
      if (!unitResult.ok) {
        return sendError(res, unitResult.code === "permission_denied" ? 403 : 400, unitResult.code, unitResult.message);
      }

      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(renderPersonnelRosterScreen({
          summary,
          items: listResult.items,
          units: unitResult.units,
          filters: {
            status: String(req.query.status ?? ""),
            unitId: String(req.query.unitId ?? ""),
          },
          errorMessage: null,
        }));
      }

      return res.status(200).json({
        items: listResult.items,
        meta: { count: listResult.items.length },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/personnel/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canViewScopedPersonnel(req.context.account)) {
        return sendError(res, 403, "permission_denied", "Scoped personnel view is required.");
      }

      const profile = await getPersonnelProfileById(prisma, req.params.id);
      if (!profile) {
        return sendError(res, 404, "not_found", "Personnel profile was not found.");
      }

      const [listResult, lookups] = await Promise.all([
        listScopedPersonnel(prisma, req.context.account, {}),
        getPersonnelLookupData(prisma),
      ]);

      if (!listResult.ok) {
        return sendError(res, listResult.code === "permission_denied" ? 403 : 400, listResult.code, listResult.message);
      }

      const canViewTarget = listResult.items.some((item) => item.id === profile.id);
      if (!canViewTarget) {
        return sendError(res, 403, "permission_denied", "This personnel profile is outside your view scope.");
      }

      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(renderPersonnelDetailScreen({
          summary,
          profile,
          lookups,
          canUpdate: canUpdateScopedPersonnel(req.context.account),
          formState: buildPersonnelFormState(profile),
          errorMessage: null,
        }));
      }

      return sendDetail(res, profile);
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/personnel/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await updatePersonnelProfile({
        prisma,
        actor: req.context.account,
        personnelProfileId: req.params.id,
        body: req.body,
      });

      if (!result.ok) {
        return handlePersonnelActionFailure({
          req,
          res,
          prisma,
          result,
          personnelProfileId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
          body: req.body,
        });
      }

      return sendDetail(res, result.profile);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/personnel/:id/update", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await updatePersonnelProfile({
        prisma,
        actor: req.context.account,
        personnelProfileId: req.params.id,
        body: req.body,
      });

      if (!result.ok) {
        return handlePersonnelActionFailure({
          req,
          res,
          prisma,
          result,
          personnelProfileId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
          body: req.body,
        });
      }

      return res.redirect(`/personnel/${req.params.id}`);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await createOrResumeOwnApplication({
        prisma,
        account: req.context.account,
        body: req.body,
      });

      if (!result.ok) {
        if (isHtmlRequest(req)) {
          const [units, application] = await Promise.all([
            getApplicationUnits(prisma),
            getOwnApplication(prisma, req.context.account.id),
          ]);
          const summary = buildSessionSummary({
            account: req.context.account,
            session: req.context.session,
            authIdentity: req.context.authIdentity,
          });
          return res.status(400).send(renderOwnApplicationScreen({
            summary,
            application,
            units,
            formState: applicantFormState(req.body),
            errorMessage: result.message,
          }));
        }

        return sendError(res, result.code === "permission_denied" ? 403 : 400, result.code, result.message);
      }

      if (isHtmlRequest(req)) {
        return res.redirect("/applications/me");
      }

      return sendDetail(res, result.application, { created: result.created });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/applications/review", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canRecruiterReview(req.context.account) && !canTargetUnitReview(req.context.account)) {
        return sendError(res, 403, "permission_denied", "Application review permission is required.");
      }

      const applications = await listReviewQueue(prisma, req.context.account);
      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(renderApplicationReviewQueueScreen({
          summary,
          applications,
          errorMessage: null,
        }));
      }

      return res.status(200).json({
        items: applications,
        meta: { count: applications.length },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/applications/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const application = await getApplicationById(prisma, req.params.id);
      if (!application) {
        return sendError(res, 404, "not_found", "Application was not found.");
      }

      const isOwner = application.accountId === req.context.account.id;
      const canReview = canReviewApplicationRecord(req.context.account, application);

      if (!isOwner && !canReview) {
        return sendError(res, 403, "permission_denied", "You cannot view this application.");
      }

      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req) && isOwner) {
        return res.redirect("/applications/me");
      }

      if (isHtmlRequest(req) && !isOwner) {
        const units = await getApplicationUnits(prisma);
        return res.status(200).send(renderApplicationReviewDetailScreen({
          summary,
          application,
          units,
          canRecruiterReview: canRecruiterReview(req.context.account),
          canTargetUnitReview: canTargetUnitReview(req.context.account),
          errorMessage: null,
        }));
      }

      return sendDetail(res, application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/recommend", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const reason = String(req.body.reason ?? "").trim();
      if (!reason) {
        return sendError(res, 400, "validation_error", "Recommendation reason is required.");
      }

      const result = await recommendApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        reason,
        noteBody: String(req.body.noteBody ?? "").trim(),
      });

      if (!result.ok) {
        return handleApplicationActionFailure({ req, res, prisma, result, applicationId: req.params.id, account: req.context.account, session: req.context.session, authIdentity: req.context.authIdentity });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/assign-unit", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const reason = String(req.body.reason ?? "").trim();
      const targetUnitId = String(req.body.targetUnitId ?? "").trim();
      if (!reason || !targetUnitId) {
        return sendError(res, 400, "validation_error", "Target unit and reason are required.");
      }

      const result = await assignApplicationUnit({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        targetUnitId,
        reason,
      });

      if (!result.ok) {
        return handleApplicationActionFailure({ req, res, prisma, result, applicationId: req.params.id, account: req.context.account, session: req.context.session, authIdentity: req.context.authIdentity });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/accept", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const reason = String(req.body.reason ?? "").trim();
      if (!reason) {
        return sendError(res, 400, "validation_error", "Acceptance reason is required.");
      }

      const result = await acceptApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        reason,
        noteBody: String(req.body.noteBody ?? "").trim(),
      });

      if (!result.ok) {
        return handleApplicationActionFailure({ req, res, prisma, result, applicationId: req.params.id, account: req.context.account, session: req.context.session, authIdentity: req.context.authIdentity });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/reject", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const reason = String(req.body.reason ?? "").trim();
      if (!reason) {
        return sendError(res, 400, "validation_error", "Rejection reason is required.");
      }

      const result = await rejectApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        reason,
        noteBody: String(req.body.noteBody ?? "").trim(),
      });

      if (!result.ok) {
        return handleApplicationActionFailure({ req, res, prisma, result, applicationId: req.params.id, account: req.context.account, session: req.context.session, authIdentity: req.context.authIdentity });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  if (!config.isProduction) {
    app.post("/_local/shutdown", (req, res) => {
      if (!isLoopbackRequest(req.ip)) {
        return sendError(res, 403, "permission_denied", "Local shutdown is only available from loopback.");
      }

      res.status(202).json({
        data: {
          accepted: true,
          action: "shutdown",
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });

      setImmediate(() => {
        requestShutdown("local shutdown action");
      });
    });
  }

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

function isLoopbackRequest(ipAddress = "") {
  return ipAddress === "::1" || ipAddress === "::ffff:127.0.0.1" || ipAddress === "127.0.0.1";
}

function buildPersonnelFormState(profileOrBody = {}) {
  const source = profileOrBody ?? {};
  return {
    name: String(source.name ?? ""),
    status: String(source.status ?? ""),
    currentUnitId: String(source.currentUnitId ?? ""),
    currentRankId: String(source.currentRankId ?? ""),
    currentBilletId: String(source.currentBilletId ?? ""),
    currentMOSId: String(source.currentMOSId ?? ""),
    goodStanding: String(
      typeof source.goodStanding === "boolean" ? source.goodStanding : source.goodStanding ?? "",
    ),
    reason: String(source.reason ?? ""),
  };
}

async function handleApplicationActionFailure({
  req,
  res,
  prisma,
  result,
  applicationId,
  account,
  session,
  authIdentity,
}) {
  const statusCode =
    result.code === "permission_denied" ? 403 :
    result.code === "not_found" ? 404 :
    result.code === "configuration_error" ? 500 : 400;

  if (!isHtmlRequest(req)) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const [application, units] = await Promise.all([
    getApplicationById(prisma, applicationId),
    getApplicationUnits(prisma),
  ]);

  if (!application) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const summary = buildSessionSummary({ account, session, authIdentity });
  return res.status(statusCode).send(renderApplicationReviewDetailScreen({
    summary,
    application,
    units,
    canRecruiterReview: canRecruiterReview(account),
    canTargetUnitReview: canTargetUnitReview(account),
    errorMessage: result.message,
  }));
}

async function handlePersonnelActionFailure({
  req,
  res,
  prisma,
  result,
  personnelProfileId,
  account,
  session,
  authIdentity,
  body,
}) {
  const statusCode =
    result.code === "permission_denied" ? 403 :
    result.code === "not_found" ? 404 : 400;

  if (!isHtmlRequest(req)) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const [profile, lookups] = await Promise.all([
    getPersonnelProfileById(prisma, personnelProfileId),
    getPersonnelLookupData(prisma),
  ]);

  if (!profile) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const summary = buildSessionSummary({ account, session, authIdentity });
  return res.status(statusCode).send(renderPersonnelDetailScreen({
    summary,
    profile,
    lookups,
    canUpdate: canUpdateScopedPersonnel(account),
    formState: buildPersonnelFormState(body),
    errorMessage: result.message,
  }));
}
