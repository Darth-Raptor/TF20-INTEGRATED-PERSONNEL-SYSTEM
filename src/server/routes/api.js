import express from "express";

import { config } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getPortalSummary,
  listApplications,
  listAuditLogs,
  getPersonnelForUser,
  listPersonnel,
  parseLimit,
  submitApplication,
  updatePersonnelForUser,
  updateApplicationStatus,
  writeAuditLog,
} from "../services/portal-data.js";
import { listPortalRoles, listPortalUsers, updatePortalUserRoles } from "../services/users.js";

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

export function apiRouter() {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      service: "tf20-portal",
      databaseConfigured: Boolean(config.databaseUrl),
      discordConfigured: Boolean(config.discord.clientId && config.discord.clientSecret),
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/session", (req, res) => {
    res.json({
      authenticated: Boolean(req.isAuthenticated?.()),
      user: req.user || null,
    });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({
      authenticated: true,
      user: req.user,
    });
  });

  router.get(
    "/summary",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await getPortalSummary({ actorUser: req.user });
      res.json({ item });
    }),
  );

  router.get(
    "/roles",
    requireAuth,
    requireRole("system:admin"),
    asyncRoute(async (req, res) => {
      const items = await listPortalRoles();
      res.json({ items });
    }),
  );

  router.get(
    "/users",
    requireAuth,
    requireRole("system:admin"),
    asyncRoute(async (req, res) => {
      const items = await listPortalUsers();
      res.json({ items });
    }),
  );

  router.patch(
    "/users/:id/roles",
    requireAuth,
    requireRole("system:admin"),
    asyncRoute(async (req, res) => {
      if (!Array.isArray(req.body.roles)) {
        res.status(400).json({ error: "roles must be an array of role names." });
        return;
      }

      const user = await updatePortalUserRoles({
        actorUserId: req.user?.id,
        userId: req.params.id,
        roleNames: req.body.roles,
        reason: req.body.reason,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ user });
    }),
  );

  router.get(
    "/applications",
    requireAuth,
    asyncRoute(async (req, res) => {
      const items = await listApplications({
        status: req.query.status,
        search: req.query.search,
        limit: parseLimit(req.query.limit),
        actorUser: req.user,
      });
      res.json({ items, next: null });
    }),
  );

  router.post(
    "/applications",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await submitApplication({
        actorUserId: req.user?.id,
        steam64Id: req.body.steam64Id,
        timezone: req.body.timezone,
        roleInterest: req.body.roleInterest,
        availability: req.body.availability,
        experience: req.body.experience,
        technicalReadiness: req.body.technicalReadiness,
        rulesAcknowledgement: req.body.rulesAcknowledgement,
        motivation: req.body.motivation,
        armaExperience: req.body.armaExperience,
        reason: "Submitted from portal application form.",
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(201).json({ item });
    }),
  );

  router.patch(
    "/applications/:id/status",
    requireAuth,
    requireRole("applications:write", "recruiter", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const item = await updateApplicationStatus({
        actorUser: req.user,
        applicationId: req.params.id,
        status: req.body.status,
        note: req.body.note,
        reason: req.body.reason,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ item });
    }),
  );

  router.get(
    "/personnel/me",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await getPersonnelForUser(req.user?.id);
      if (!item) {
        res.status(404).json({ error: "Personnel profile not found for this account." });
        return;
      }
      res.json({ item });
    }),
  );

  router.patch(
    "/personnel/me",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await updatePersonnelForUser({
        actorUserId: req.user?.id,
        displayAlias: req.body.displayAlias,
        steam64Id: req.body.steam64Id,
        timezone: req.body.timezone,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ item });
    }),
  );

  router.get(
    "/personnel",
    requireAuth,
    requireRole("personnel:read", "staff", "command", "command-staff"),
    asyncRoute(async (req, res) => {
      const items = await listPersonnel({
        status: req.query.status,
        search: req.query.search,
        limit: parseLimit(req.query.limit),
      });
      res.json({ items, next: null });
    }),
  );

  router.post(
    "/audit",
    requireAuth,
    requireRole("audit:write", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const entry = await writeAuditLog({
        actorUserId: req.user?.id,
        affectedProfileId: req.body.affectedProfileId,
        module: req.body.module,
        action: req.body.action,
        oldValue: req.body.oldValue,
        newValue: req.body.newValue,
        reason: req.body.reason,
        relatedRecordId: req.body.relatedRecordId,
        severity: req.body.severity,
        systemGenerated: false,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(201).json({ accepted: true, id: entry.id, createdAt: entry.createdAt });
    }),
  );

  router.get(
    "/audit",
    requireAuth,
    requireRole("audit:read", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const items = await listAuditLogs({ limit: parseLimit(req.query.limit, 50, 100) });
      res.json({ items, next: null });
    }),
  );

  return router;
}
