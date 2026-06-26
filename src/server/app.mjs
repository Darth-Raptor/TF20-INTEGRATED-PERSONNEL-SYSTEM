import express from "express";

import { mountClientApp } from "./client-app.mjs";
import {
  getAdminUserRecord,
  listAdminUserRecords,
  saveAdminUserRecordNote,
  updateAdminUserRecord,
} from "./admin-user-records-service.mjs";
import {
  applicantFormState,
  assignApplicationUnit,
  canCreateOwnApplication,
  canRecruiterReview,
  canReviewApplicationRecord,
  canTargetUnitReview,
  canViewOwnApplication,
  claimApplication,
  createOrResumeDraftApplication,
  createOrResumeOwnApplication,
  getApplicationById,
  getOwnIntakeDocumentStatus,
  getOwnApplication,
  getRecruitingOptions,
  isHtmlRequest,
  listReviewRecords,
  listReviewQueue,
  listUnitReviewQueue,
  recommendApplication,
  reopenApplication,
  releaseApplicationClaim,
  recordApplicationIntakeAgreements,
  requestApplicationInfo,
  requestApplicationInfoFromUnit,
  rejectApplication,
  saveApplicationReviewNote,
  saveApplicationUnitReviewNote,
  acceptApplication,
  submitOwnApplication,
  updateOwnApplication,
  withdrawOwnApplication,
} from "./application-service.mjs";
import { getCurrentIntakeDocument } from "./intake-documents.mjs";
import {
  canUpdateScopedPersonnel,
  canViewOwnPersonnel,
  canViewScopedPersonnel,
  getPersonnelEditOptions,
  getOwnPersonnelProfile,
  getPersonnelLookupData,
  getPersonnelProfileById,
  getStaffUnitOverview,
  getScopedUnitFilters,
  listScopedPersonnel,
  listPublicUnitOpenings,
  updateUnitMOSSlots,
  updatePersonnelProfile,
} from "./personnel-service.mjs";
import {
  cancelEvent,
  createEvent,
  getEventDetail,
  getEventOptions,
  listEventsForMonth,
  signupForEvent,
  updateEvent,
  withdrawFromEvent,
} from "./event-service.mjs";
import {
  createTrainingSession,
  getTrainingOptions,
  getTrainingSession,
  listOwnTrainingRecords,
  listTrainingSessions,
  updateTrainingSession,
} from "./training-service.mjs";
import {
  assignAccountRole,
  getRoleManagementAccount,
  listRoleManagementOptions,
  removeAccountRole,
} from "./role-management-service.mjs";
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
import {
  appendCookie,
  buildCookie,
  createRandomId,
  parseCookies,
  signCookieValue,
  verifySignedCookieValue,
} from "./cookies.mjs";
import { sendDetail, sendError } from "./errors.mjs";
import { ingestDiscordMembershipEvent } from "./discord-membership-service.mjs";
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
  mountClientApp(app);

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

  app.post("/integrations/discord/guild-membership-events", async (req, res, next) => {
    try {
      if (!config.discordMembershipEventIngest?.enabled) {
        return sendError(
          res,
          404,
          "discord_membership_ingest_disabled",
          "Discord membership event ingest is disabled.",
        );
      }
      if (!hasBearerToken(req, config.discordMembershipEventIngest.secret)) {
        return sendError(
          res,
          401,
          "invalid_ingest_secret",
          "Valid ingest authorization is required.",
        );
      }

      const result = await ingestDiscordMembershipEvent({
        prisma,
        config,
        payload: req.body,
      });
      if (!result.ok) {
        return sendError(res, 400, result.code, result.message);
      }

      return sendDetail(
        res,
        {
          id: result.event.id,
          externalEventId: result.event.externalEventId,
          accountId: result.event.accountId,
          eventType: result.event.eventType,
          occurredAt: result.event.occurredAt,
        },
        { created: result.created },
      );
    } catch (error) {
      return next(error);
    }
  });

  app.get("/public/openings", async (req, res, next) => {
    try {
      const result = await listPublicUnitOpenings(prisma);
      if (!result.ok) {
        return sendError(res, 400, result.code, result.message);
      }

      return sendDetail(res, result.items, { count: result.items.length });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/", async (req, res, next) => {
    try {
      if (!req.context?.account) {
        return res.status(200).send(renderLoginScreen());
      }

      const permissions = flattenPermissions(req.context.account);
      const access = buildAccessContext({ account: req.context.account, permissions });

      if (access.gateState === "pending") {
        return res.status(200).send(
          renderPendingScreen(
            buildSessionSummary({
              account: req.context.account,
              session: req.context.session,
              authIdentity: req.context.authIdentity,
            }),
          ),
        );
      }

      if (access.gateState !== "active") {
        return res.status(200).send(renderBlockedScreen(access.gateState));
      }

      return res.status(200).send(
        renderAuthenticatedScreen(
          buildSessionSummary({
            account: req.context.account,
            session: req.context.session,
            authIdentity: req.context.authIdentity,
          }),
        ),
      );
    } catch (error) {
      return next(error);
    }
  });

  app.get("/auth/discord/start", async (req, res, next) => {
    try {
      const state = createRandomId();
      const returnTo = normalizeOAuthReturnPath(req.query.returnTo);
      const cookie = buildCookie(
        config.oauthStateCookieName,
        signCookieValue(state, config.sessionSecret),
        {
          domain: config.cookieDomain,
          secure: config.isProduction,
          maxAgeSeconds: 10 * 60,
        },
      );
      appendCookie(res, cookie);
      if (returnTo) {
        appendCookie(
          res,
          buildCookie(
            oauthReturnCookieName(config),
            signCookieValue(JSON.stringify({ state, returnTo }), config.sessionSecret),
            {
              domain: config.cookieDomain,
              secure: config.isProduction,
              maxAgeSeconds: 10 * 60,
            },
          ),
        );
      }
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

      const cookies = parseCookies(req.headers.cookie);
      const signedState = cookies[config.oauthStateCookieName];

      const expectedState = signedState ? signCookieValue(state, config.sessionSecret) : null;

      if (!signedState || signedState !== expectedState) {
        return sendError(res, 400, "invalid_oauth_state", "OAuth state verification failed.");
      }
      const returnTo = readOAuthReturnPath(cookies, config, state) ?? "/portal";

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
        discordUser,
        guildPayload: guildVerification.payload,
        approvedGuildId: config.discord.approvedGuildId,
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
        buildCookie(config.sessionCookieName, signCookieValue(session.id, config.sessionSecret), {
          domain: config.cookieDomain,
          secure: config.isProduction,
          maxAgeSeconds: config.sessionTtlDays * 24 * 60 * 60,
        }),
      );
      appendCookie(res, clearCookie(config.oauthStateCookieName, config));
      appendCookie(res, clearCookie(oauthReturnCookieName(config), config));

      if (resolved.account.status === "Pending") {
        return res.redirect(returnTo);
      }

      if (resolved.account.status !== "Active") {
        return res.redirect(`/auth/blocked?reason=${resolved.account.status.toLowerCase()}`);
      }

      return res.redirect(returnTo);
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
          domain: config.cookieDomain,
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
      const recentAuthExpiresAt = new Date(Date.now() + config.recentAuthWindowMinutes * 60 * 1000);

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

  app.get("/me/navigation", requireAuthenticatedSession, async (req, res) => {
    const permissions = flattenPermissions(req.context.account);
    const access = buildAccessContext({ account: req.context.account, permissions });
    return sendDetail(res, {
      accountStatus: access.accountStatus,
      gateState: access.gateState,
      defaultPath: access.visibleNavigation.defaultPath,
      sections: access.visibleNavigation.sections,
      permissions: Array.from(new Set(permissions.map((permission) => permission.key))).sort(),
    });
  });

  app.get("/admin/role-management", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await listRoleManagementOptions(prisma, req.context.account);
      if (!result.ok) return sendRoleManagementError(res, result);
      return sendDetail(res, { accounts: result.accounts, roles: result.roles });
    } catch (error) {
      return next(error);
    }
  });

  app.get(
    "/admin/role-management/:accountId",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await getRoleManagementAccount(
          prisma,
          req.context.account,
          req.params.accountId,
        );
        if (!result.ok) return sendRoleManagementError(res, result);
        return sendDetail(res, result.account);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/admin/role-management/:accountId/assignments",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await assignAccountRole({
          prisma,
          actor: req.context.account,
          accountId: req.params.accountId,
          roleId: req.body.roleId,
          reason: req.body.reason,
        });
        if (!result.ok) return sendRoleManagementError(res, result);
        return sendDetail(res, result.account);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.delete(
    "/admin/role-management/:accountId/assignments/:assignmentId",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await removeAccountRole({
          prisma,
          actor: req.context.account,
          accountId: req.params.accountId,
          assignmentId: req.params.assignmentId,
          reason: req.body.reason,
        });
        if (!result.ok) return sendRoleManagementError(res, result);
        return sendDetail(res, result.account);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get("/admin/user-records", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await listAdminUserRecords(prisma, req.context.account);
      if (!result.ok) return sendRoleManagementError(res, result);
      return res.status(200).json({
        items: result.items,
        meta: { count: result.items.length },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/admin/user-records/:accountId", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await getAdminUserRecord(prisma, req.context.account, req.params.accountId);
      if (!result.ok) return sendRoleManagementError(res, result);
      return res.status(200).json({
        data: result.record,
        options: result.options,
        permissions: result.permissions,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.patch(
    "/admin/user-records/:accountId",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await updateAdminUserRecord({
          prisma,
          actor: req.context.account,
          accountId: req.params.accountId,
          body: req.body,
        });
        if (!result.ok) return sendRoleManagementError(res, result);
        return res.status(200).json({
          data: result.record,
          options: result.options,
          permissions: result.permissions,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/admin/user-records/:accountId/notes",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await saveAdminUserRecordNote({
          prisma,
          actor: req.context.account,
          accountId: req.params.accountId,
          noteBody: req.body.noteBody,
        });
        if (!result.ok) return sendRoleManagementError(res, result);
        return res.status(200).json({
          data: result.record,
          options: result.options,
          permissions: result.permissions,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get(
    ["/applications/me", "/applications/mine"],
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        if (
          !canCreateOwnApplication(req.context.account) &&
          !canViewOwnApplication(req.context.account)
        ) {
          return sendError(
            res,
            403,
            "permission_denied",
            "Application self-service is not available.",
          );
        }

        const intakeStatus = await getOwnIntakeDocumentStatus({
          prisma,
          account: req.context.account,
        });
        if (!intakeStatus.ok) {
          return sendError(
            res,
            applicationSelfStatusCode(intakeStatus),
            intakeStatus.code,
            intakeStatus.message,
          );
        }

        const application = intakeStatus.application;
        const options = await getRecruitingOptions(prisma, {
          liveOnly: true,
          selectedUnitIds: (application?.interestedUnits ?? []).map((entry) => entry.unitId),
          selectedMOSIds: (application?.desiredMOS ?? []).map((entry) => entry.mosId),
        });
        const summary = buildSessionSummary({
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });

        if (isHtmlRequest(req)) {
          return res.status(200).send(
            renderOwnApplicationScreen({
              summary,
              application,
              units: options.units,
              formState: applicantFormState(),
              errorMessage: null,
            }),
          );
        }

        return sendDetail(res, { application, options, intakeDocuments: intakeStatus.documents });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get("/applications/intake-documents", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canAccessIntakeDocuments(req.context.account)) {
        return sendError(
          res,
          403,
          "permission_denied",
          "Intake documents are not available to this account.",
        );
      }

      const result = await getOwnIntakeDocumentStatus({
        prisma,
        account: req.context.account,
      });

      if (!result.ok) {
        return sendError(res, applicationSelfStatusCode(result), result.code, result.message);
      }

      return sendDetail(res, {
        application: result.application,
        documents: result.documents,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get(
    "/applications/intake-documents/:documentKey/pdf",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        if (!canAccessIntakeDocuments(req.context.account)) {
          return sendError(
            res,
            403,
            "permission_denied",
            "Intake documents are not available to this account.",
          );
        }

        const document = getCurrentIntakeDocument(req.params.documentKey);
        if (!document) {
          return sendError(res, 404, "not_found", "Intake document was not found.");
        }

        res.type("application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${safeHeaderFilename(document.fileName)}"`,
        );
        return res.sendFile(document.filePath, (error) => {
          if (error) next(error);
        });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/applications/me/intake-agreements",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await recordApplicationIntakeAgreements({
          prisma,
          account: req.context.account,
          documentKeys: req.body.documentKeys,
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        if (!result.ok) {
          return sendError(res, applicationSelfStatusCode(result), result.code, result.message);
        }

        return sendDetail(res, {
          application: result.application,
          documents: result.documents,
        });
      } catch (error) {
        return next(error);
      }
    },
  );

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
        return sendError(
          res,
          listResult.code === "permission_denied" ? 403 : 400,
          listResult.code,
          listResult.message,
        );
      }
      if (!unitResult.ok) {
        return sendError(
          res,
          unitResult.code === "permission_denied" ? 403 : 400,
          unitResult.code,
          unitResult.message,
        );
      }

      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(
          renderPersonnelRosterScreen({
            summary,
            items: listResult.items,
            units: unitResult.units,
            filters: {
              status: String(req.query.status ?? ""),
              unitId: String(req.query.unitId ?? ""),
            },
            errorMessage: null,
          }),
        );
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

      const [listResult, optionsResult] = await Promise.all([
        listScopedPersonnel(prisma, req.context.account, {}),
        getPersonnelEditOptions(prisma, req.context.account),
      ]);

      if (!listResult.ok) {
        return sendError(
          res,
          listResult.code === "permission_denied" ? 403 : 400,
          listResult.code,
          listResult.message,
        );
      }
      if (!optionsResult.ok) {
        return sendError(
          res,
          optionsResult.code === "permission_denied" ? 403 : 400,
          optionsResult.code,
          optionsResult.message,
        );
      }

      const canViewTarget = listResult.items.some((item) => item.id === profile.id);
      if (!canViewTarget) {
        return sendError(
          res,
          403,
          "permission_denied",
          "This personnel profile is outside your view scope.",
        );
      }

      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(
          renderPersonnelDetailScreen({
            summary,
            profile,
            lookups: optionsResult.options,
            canUpdate: canUpdateScopedPersonnel(req.context.account),
            formState: buildPersonnelFormState(profile),
            errorMessage: null,
          }),
        );
      }

      return res.status(200).json({
        data: profile,
        options: optionsResult.options,
        permissions: {
          canUpdate: canUpdateScopedPersonnel(req.context.account),
        },
      });
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

  app.get("/units/staff-overview", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await getStaffUnitOverview(
        prisma,
        req.context.account,
        String(req.query.unitId ?? ""),
      );
      if (!result.ok) {
        return sendError(
          res,
          result.code === "permission_denied" ? 403 : 400,
          result.code,
          result.message,
        );
      }

      return sendDetail(res, result.data);
    } catch (error) {
      return next(error);
    }
  });

  app.patch(
    "/units/:unitId/mos/:mosId/slots",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await updateUnitMOSSlots({
          prisma,
          actor: req.context.account,
          unitId: req.params.unitId,
          mosId: req.params.mosId,
          authorizedSlots: req.body.authorizedSlots,
        });
        if (!result.ok) {
          return sendError(
            res,
            result.code === "permission_denied" ? 403 : 400,
            result.code,
            result.message,
          );
        }

        return sendDetail(res, result.row);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get("/events", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await listEventsForMonth(prisma, req.context.account, req.query.month);
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        items: result.items,
        meta: {
          count: result.items.length,
          month: result.month,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/events/options", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await getEventOptions(prisma, req.context.account);
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        data: result.options,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/events/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await getEventDetail(prisma, req.context.account, req.params.id);
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        data: result.event,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/events", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await createEvent({
        prisma,
        actor: req.context.account,
        body: req.body,
      });
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(201).json({
        data: result.event,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/events/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await updateEvent({
        prisma,
        actor: req.context.account,
        eventId: req.params.id,
        body: req.body,
      });
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        data: result.event,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/events/:id/cancel", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await cancelEvent({
        prisma,
        actor: req.context.account,
        eventId: req.params.id,
      });
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        data: result.event,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/events/:id/signup", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await signupForEvent({
        prisma,
        actor: req.context.account,
        eventId: req.params.id,
      });
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        data: result.event,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/events/:id/withdraw", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await withdrawFromEvent({
        prisma,
        actor: req.context.account,
        eventId: req.params.id,
      });
      if (!result.ok) {
        return sendEventError(res, result);
      }

      return res.status(200).json({
        data: result.event,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/training/options", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await getTrainingOptions(prisma, req.context.account);
      if (!result.ok) {
        return sendTrainingError(res, result);
      }

      return res.status(200).json({
        data: result.options,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/training/sessions", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await listTrainingSessions(prisma, req.context.account);
      if (!result.ok) {
        return sendTrainingError(res, result);
      }

      return res.status(200).json({
        items: result.items,
        meta: { count: result.items.length },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/training/sessions", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await createTrainingSession({
        prisma,
        actor: req.context.account,
        body: req.body,
      });
      if (!result.ok) {
        return sendTrainingError(res, result);
      }

      return res.status(201).json({
        data: result.session,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/training/sessions/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await getTrainingSession(prisma, req.context.account, req.params.id);
      if (!result.ok) {
        return sendTrainingError(res, result);
      }

      return res.status(200).json({
        data: result.session,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/training/sessions/:id", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await updateTrainingSession({
        prisma,
        actor: req.context.account,
        sessionId: req.params.id,
        body: req.body,
      });
      if (!result.ok) {
        return sendTrainingError(res, result);
      }

      return res.status(200).json({
        data: result.session,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/training/self", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await listOwnTrainingRecords(prisma, req.context.account);
      if (!result.ok) {
        return sendTrainingError(res, result);
      }

      return res.status(200).json({
        items: result.items,
        meta: { count: result.items.length },
      });
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
          const application = await getOwnApplication(prisma, req.context.account.id);
          const options = await getRecruitingOptions(prisma, {
            liveOnly: true,
            selectedUnitIds: (application?.interestedUnits ?? []).map((entry) => entry.unitId),
            selectedMOSIds: (application?.desiredMOS ?? []).map((entry) => entry.mosId),
          });
          const summary = buildSessionSummary({
            account: req.context.account,
            session: req.context.session,
            authIdentity: req.context.authIdentity,
          });
          return res.status(400).send(
            renderOwnApplicationScreen({
              summary,
              application,
              units: options.units,
              formState: applicantFormState(req.body),
              errorMessage: result.message,
            }),
          );
        }

        return sendError(res, applicationSelfStatusCode(result), result.code, result.message);
      }

      if (isHtmlRequest(req)) {
        return res.redirect("/applications/me");
      }

      return sendDetail(res, result.application, { created: result.created });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/draft", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const hasBody = Object.keys(req.body ?? {}).length > 0;
      const result = hasBody
        ? await updateOwnApplication({
            prisma,
            account: req.context.account,
            body: req.body,
          })
        : await createOrResumeDraftApplication({
            prisma,
            account: req.context.account,
          });

      if (!result.ok) {
        return sendError(res, applicationSelfStatusCode(result), result.code, result.message);
      }

      return sendDetail(res, result.application, { created: result.created ?? false });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/applications/me", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await updateOwnApplication({
        prisma,
        account: req.context.account,
        body: req.body,
      });

      if (!result.ok) {
        return sendError(res, applicationSelfStatusCode(result), result.code, result.message);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/me/submit", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await submitOwnApplication({
        prisma,
        account: req.context.account,
        body: req.body,
      });

      if (!result.ok) {
        return sendError(res, applicationSelfStatusCode(result), result.code, result.message);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/me/withdraw", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await withdrawOwnApplication({
        prisma,
        account: req.context.account,
        reason: String(req.body.reason ?? "").trim(),
      });

      if (!result.ok) {
        return sendError(
          res,
          result.code === "permission_denied" ? 403 : result.code === "not_found" ? 404 : 400,
          result.code,
          result.message,
        );
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.get(
    "/applications/recruiting-options",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        if (
          !canCreateOwnApplication(req.context.account) &&
          !canViewOwnApplication(req.context.account) &&
          !canRecruiterReview(req.context.account) &&
          !canTargetUnitReview(req.context.account)
        ) {
          return sendError(
            res,
            403,
            "permission_denied",
            "Recruiting options are not available to this account.",
          );
        }

        const selectedUnitIds = String(req.query.unitIds ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        const options = await getRecruitingOptions(prisma, selectedUnitIds);
        return sendDetail(res, options);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.get("/applications/review", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canRecruiterReview(req.context.account)) {
        return sendError(
          res,
          403,
          "permission_denied",
          "Recruiter application review permission is required.",
        );
      }

      const applications = await listReviewQueue(prisma, req.context.account);
      const summary = buildSessionSummary({
        account: req.context.account,
        session: req.context.session,
        authIdentity: req.context.authIdentity,
      });

      if (isHtmlRequest(req)) {
        return res.status(200).send(
          renderApplicationReviewQueueScreen({
            summary,
            applications,
            errorMessage: null,
          }),
        );
      }

      return res.status(200).json({
        items: applications,
        meta: { count: applications.length },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/applications/review-records", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canRecruiterReview(req.context.account)) {
        return sendError(
          res,
          403,
          "permission_denied",
          "Recruiter application review permission is required.",
        );
      }

      const applications = await listReviewRecords(prisma, req.context.account);
      return res.status(200).json({
        items: applications,
        meta: { count: applications.length },
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/applications/unit-review", requireAuthenticatedSession, async (req, res, next) => {
    try {
      if (!canTargetUnitReview(req.context.account)) {
        return sendError(
          res,
          403,
          "permission_denied",
          "Target-unit review permission is required.",
        );
      }

      const applications = await listUnitReviewQueue(prisma, req.context.account);
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
      const canReview = await canReviewApplicationRecord(prisma, req.context.account, application);

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
        const options = await getRecruitingOptions(
          prisma,
          (application.interestedUnits ?? []).map((entry) => entry.unitId),
        );
        return res.status(200).send(
          renderApplicationReviewDetailScreen({
            summary,
            application,
            units: options.units,
            canRecruiterReview: canRecruiterReview(req.context.account),
            canTargetUnitReview: canTargetUnitReview(req.context.account),
            errorMessage: null,
          }),
        );
      }

      return sendDetail(res, application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/claim", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await claimApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/reopen", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await reopenApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        reason: String(req.body.reason ?? "").trim(),
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post(
    "/applications/:id/release-claim",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const result = await releaseApplicationClaim({
          prisma,
          actor: req.context.account,
          applicationId: req.params.id,
        });

        if (!result.ok) {
          return handleApplicationActionFailure({
            req,
            res,
            prisma,
            result,
            applicationId: req.params.id,
            account: req.context.account,
            session: req.context.session,
            authIdentity: req.context.authIdentity,
          });
        }

        if (isHtmlRequest(req)) {
          return res.redirect(`/applications/${req.params.id}`);
        }

        return sendDetail(res, result.application);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post("/applications/:id/notes", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await saveApplicationReviewNote({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        body: String(req.body.noteBody ?? req.body.body ?? "").trim(),
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post("/applications/:id/unit-notes", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const result = await saveApplicationUnitReviewNote({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        body: String(req.body.noteBody ?? req.body.body ?? "").trim(),
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
      }

      if (isHtmlRequest(req)) {
        return res.redirect(`/applications/${req.params.id}`);
      }

      return sendDetail(res, result.application);
    } catch (error) {
      return next(error);
    }
  });

  app.post(
    "/applications/:id/request-info",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const reason = String(req.body.reason ?? "").trim();
        if (!reason) {
          return sendError(res, 400, "validation_error", "Request-info reason is required.");
        }

        const result = await requestApplicationInfo({
          prisma,
          actor: req.context.account,
          applicationId: req.params.id,
          reason,
        });

        if (!result.ok) {
          return handleApplicationActionFailure({
            req,
            res,
            prisma,
            result,
            applicationId: req.params.id,
            account: req.context.account,
            session: req.context.session,
            authIdentity: req.context.authIdentity,
          });
        }

        if (isHtmlRequest(req)) {
          return res.redirect(`/applications/${req.params.id}`);
        }

        return sendDetail(res, result.application);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post(
    "/applications/:id/unit-request-info",
    requireAuthenticatedSession,
    async (req, res, next) => {
      try {
        const reason = String(req.body.reason ?? "").trim();
        if (!reason) {
          return sendError(res, 400, "validation_error", "Request-info reason is required.");
        }

        const result = await requestApplicationInfoFromUnit({
          prisma,
          actor: req.context.account,
          applicationId: req.params.id,
          reason,
        });

        if (!result.ok) {
          return handleApplicationActionFailure({
            req,
            res,
            prisma,
            result,
            applicationId: req.params.id,
            account: req.context.account,
            session: req.context.session,
            authIdentity: req.context.authIdentity,
          });
        }

        if (isHtmlRequest(req)) {
          return res.redirect(`/applications/${req.params.id}`);
        }

        return sendDetail(res, result.application);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.post("/applications/:id/recommend", requireAuthenticatedSession, async (req, res, next) => {
    try {
      const reason = String(req.body.reason ?? "").trim();
      const targetUnitId = String(req.body.targetUnitId ?? "").trim();

      const result = await recommendApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        reason,
        targetUnitId,
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
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
      if (!targetUnitId) {
        return sendError(res, 400, "validation_error", "Target unit is required.");
      }

      const result = await assignApplicationUnit({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        targetUnitId,
        reason,
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
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

      const result = await acceptApplication({
        prisma,
        actor: req.context.account,
        applicationId: req.params.id,
        reason,
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
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
      });

      if (!result.ok) {
        return handleApplicationActionFailure({
          req,
          res,
          prisma,
          result,
          applicationId: req.params.id,
          account: req.context.account,
          session: req.context.session,
          authIdentity: req.context.authIdentity,
        });
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
    app.get("/_local/preview-session", async (req, res, next) => {
      try {
        if (!isLoopbackRequest(req.ip)) {
          return sendError(
            res,
            403,
            "permission_denied",
            "Local preview sessions are only available from loopback.",
          );
        }

        const sessionId = await createLocalPreviewSession({ prisma });
        appendCookie(
          res,
          buildCookie(config.sessionCookieName, signCookieValue(sessionId, config.sessionSecret), {
            domain: config.cookieDomain,
            secure: false,
            maxAgeSeconds: 4 * 60 * 60,
          }),
        );

        return res.redirect("/portal");
      } catch (error) {
        return next(error);
      }
    });

    app.post("/_local/shutdown", (req, res) => {
      if (!isLoopbackRequest(req.ip)) {
        return sendError(
          res,
          403,
          "permission_denied",
          "Local shutdown is only available from loopback.",
        );
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

  app.use((error, req, res, _next) => {
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
  const derivedGoodStanding = ![
    "AWOL",
    "OtherThanHonorableDischarge",
    "DishonorableDischarge",
  ].includes(String(source.status ?? ""));
  return {
    name: String(source.name ?? ""),
    status: String(source.status ?? ""),
    currentUnitId: String(source.currentUnitId ?? ""),
    currentRankId: String(source.currentRankId ?? ""),
    currentBilletId: String(source.currentBilletId ?? ""),
    currentMOSId: String(source.currentMOSId ?? ""),
    currentSecondaryMOSId: String(source.currentSecondaryMOSId ?? ""),
    goodStanding: String(derivedGoodStanding),
    reason: String(source.reason ?? ""),
  };
}

async function createLocalPreviewSession({ prisma }) {
  const previewRoles = await prisma.role.findMany({
    where: { key: { in: ["member", "unit-staff", "recruiter", "system-admin"] } },
  });
  const rolesByKey = new Map(previewRoles.map((role) => [role.key, role]));
  for (const roleKey of ["member", "unit-staff", "recruiter", "system-admin"]) {
    if (!rolesByKey.has(roleKey)) {
      throw new Error(`Local preview requires the ${roleKey} role to be seeded.`);
    }
  }

  const providerAccountId = "codex-local-ui-preview";
  const existingIdentity = await prisma.authIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "Discord",
        providerAccountId,
      },
    },
    include: { account: true },
  });

  const account =
    existingIdentity?.account ??
    (await prisma.account.create({
      data: {
        displayName: "TF20 UI Preview",
        status: "Active",
        activatedAt: new Date(),
        authIdentities: {
          create: {
            provider: "Discord",
            providerAccountId,
            username: "tf20-ui-preview",
            displayName: "TF20 UI Preview",
          },
        },
      },
    }));

  if (account.status !== "Active") {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        status: "Active",
        activatedAt: account.activatedAt ?? new Date(),
        displayName: account.displayName ?? "TF20 UI Preview",
      },
    });
  }

  for (const roleKey of ["member", "unit-staff", "recruiter", "system-admin"]) {
    const role = rolesByKey.get(roleKey);
    const assignment = await prisma.roleAssignment.findFirst({
      where: {
        accountId: account.id,
        roleId: role.id,
        endsAt: null,
      },
    });

    if (!assignment) {
      await prisma.roleAssignment.create({
        data: {
          accountId: account.id,
          roleId: role.id,
          scopeType: "Global",
          scopeIncludesDescendants: true,
          reason: "Local UI preview session.",
        },
      });
    }
  }

  const sessionId = createRandomId();
  await prisma.session.create({
    data: {
      id: sessionId,
      accountId: account.id,
      data: { localPreview: true },
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      lastAuthenticatedAt: new Date(),
      recentAuthExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  return sessionId;
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
    result.code === "permission_denied"
      ? 403
      : result.code === "not_found"
        ? 404
        : result.code === "already_claimed" || result.code === "claim_required"
          ? 409
          : result.code === "configuration_error"
            ? 500
            : 400;

  if (!isHtmlRequest(req)) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const application = await getApplicationById(prisma, applicationId);

  if (!application) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const options = await getRecruitingOptions(
    prisma,
    (application.interestedUnits ?? []).map((entry) => entry.unitId),
  );
  const summary = buildSessionSummary({ account, session, authIdentity });
  return res.status(statusCode).send(
    renderApplicationReviewDetailScreen({
      summary,
      application,
      units: options.units,
      canRecruiterReview: canRecruiterReview(account),
      canTargetUnitReview: canTargetUnitReview(account),
      errorMessage: result.message,
    }),
  );
}

function sendTrainingError(res, result) {
  const statusCode =
    result.code === "permission_denied" ? 403 : result.code === "not_found" ? 404 : 400;
  return sendError(res, statusCode, result.code, result.message);
}

function sendEventError(res, result) {
  const statusCode =
    result.code === "permission_denied"
      ? 403
      : result.code === "not_found"
        ? 404
        : result.code === "invalid_transition"
          ? 409
          : 400;
  return sendError(res, statusCode, result.code, result.message);
}

function sendRoleManagementError(res, result) {
  const statusCode =
    result.code === "permission_denied"
      ? 403
      : result.code === "not_found"
        ? 404
        : result.code === "invalid_transition"
          ? 409
          : 400;
  return sendError(res, statusCode, result.code, result.message);
}

function applicationSelfStatusCode(result) {
  if (result.code === "permission_denied") return 403;
  if (result.code === "not_found") return 404;
  if (result.code === "intake_agreement_required") return 409;
  return 400;
}

function canAccessIntakeDocuments(account) {
  return (
    canCreateOwnApplication(account) ||
    canViewOwnApplication(account) ||
    canRecruiterReview(account) ||
    canTargetUnitReview(account)
  );
}

function safeHeaderFilename(fileName) {
  return String(fileName ?? "document.pdf").replaceAll('"', "");
}

function normalizeOAuthReturnPath(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string" || !candidate) return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return null;
  }

  const url = new URL(candidate, "https://taskforce20.local");
  if (url.origin !== "https://taskforce20.local") return null;

  const path = `${url.pathname}${url.search}${url.hash}`;
  return ["/portal", "/user/application"].includes(path) ? path : null;
}

function readOAuthReturnPath(cookies, config, state) {
  const signedReturnTo = cookies[oauthReturnCookieName(config)];
  const payload = safeVerifySignedCookieValue(signedReturnTo, config.sessionSecret);
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    if (parsed?.state !== state) return null;
    return normalizeOAuthReturnPath(parsed.returnTo);
  } catch {
    return null;
  }
}

function safeVerifySignedCookieValue(value, secret) {
  try {
    return verifySignedCookieValue(value, secret);
  } catch {
    return null;
  }
}

function hasBearerToken(req, expectedSecret) {
  const header = req.headers.authorization ?? "";
  if (!expectedSecret || !header.startsWith("Bearer ")) {
    return false;
  }

  return header.slice("Bearer ".length).trim() === expectedSecret;
}

function oauthReturnCookieName(config) {
  return `${config.oauthStateCookieName}_return`;
}

function clearCookie(name, config) {
  return buildCookie(name, "", {
    domain: config.cookieDomain,
    secure: config.isProduction,
    maxAgeSeconds: 0,
    expires: new Date(0),
  });
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
    result.code === "permission_denied" ? 403 : result.code === "not_found" ? 404 : 400;

  if (!isHtmlRequest(req)) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const [profile, optionsResult] = await Promise.all([
    getPersonnelProfileById(prisma, personnelProfileId),
    getPersonnelEditOptions(prisma, account),
  ]);

  if (!profile) {
    return sendError(res, statusCode, result.code, result.message);
  }

  const summary = buildSessionSummary({ account, session, authIdentity });
  return res.status(statusCode).send(
    renderPersonnelDetailScreen({
      summary,
      profile,
      lookups: optionsResult.ok ? optionsResult.options : await getPersonnelLookupData(prisma),
      canUpdate: canUpdateScopedPersonnel(account),
      formState: buildPersonnelFormState(body),
      errorMessage: result.message,
    }),
  );
}
