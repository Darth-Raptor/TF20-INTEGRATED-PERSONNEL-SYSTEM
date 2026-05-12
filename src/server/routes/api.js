import express from "express";

import { config } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  assertCanAccessPersonnelProfile,
  canAccessPersonnelRoster,
  createCalendarEvent,
  deleteLoaRequest,
  getPortalSummary,
  listBugReports,
  listAttendanceRecordsForEvent,
  listEvents,
  listLoaRequests,
  listPortalRecords,
  listPersonnelLookups,
  listUnits,
  listApplications,
  listAuditLogs,
  getPersonnelForUser,
  listPersonnel,
  parseLimit,
  reviewLoaRequest,
  submitApplication,
  submitBugReport,
  submitLoaRequest,
  syncApprovedLoaStatuses,
  updateLoaRequest,
  updateAttendanceRecord,
  updateCalendarEvent,
  updatePersonnelProfile,
  updateApplicationStatus,
  withdrawLoaRequest,
  writeAuditLog,
} from "../services/portal-data.js";
import { getSessionUserById, listPortalRoles, listPortalUsers, updatePortalUserRoles } from "../services/users.js";

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
      steamConfigured: Boolean(config.steam.webApiKey),
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/session", (req, res) => {
    res.json({
      authenticated: Boolean(req.isAuthenticated?.()),
      user: req.user || null,
    });
  });

  router.get("/me", requireAuth, asyncRoute(async (req, res) => {
    await syncApprovedLoaStatuses();
    const user = await getSessionUserById(req.user?.id);
    res.json({
      authenticated: true,
      user: user || req.user,
    });
  }));

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
    "/records",
    requireAuth,
    asyncRoute(async (req, res) => {
      if (!canAccessPersonnelRoster(req.user)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const items = await listPortalRecords({
        status: req.query.status,
        search: req.query.search,
        limit: parseLimit(req.query.limit, 100, 300),
        actorUser: req.user,
      });
      res.json({ items, next: null });
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

  router.get(
    "/personnel",
    requireAuth,
    asyncRoute(async (req, res) => {
      if (!canAccessPersonnelRoster(req.user)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const items = await listPersonnel({
        status: req.query.status,
        search: req.query.search,
        limit: parseLimit(req.query.limit),
        actorUser: req.user,
      });
      res.json({ items, next: null });
    }),
  );

  router.patch(
    "/personnel/:id",
    requireAuth,
    requireRole("personnel:write", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const item = await updatePersonnelProfile({
        actorUser: req.user,
        profileId: req.params.id,
        primaryUnitId: req.body.primaryUnitId,
        primaryBilletId: req.body.primaryBilletId,
        primaryMos: req.body.primaryMos,
        status: req.body.status,
        goodStanding: req.body.goodStanding,
        staffSectionIds: req.body.staffSectionIds,
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
    "/loa",
    requireAuth,
    asyncRoute(async (req, res) => {
      const items = await listLoaRequests({
        actorUser: req.user,
        status: req.query.status,
        limit: parseLimit(req.query.limit),
      });
      res.json({ items, next: null });
    }),
  );

  router.post(
    "/loa",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await submitLoaRequest({
        actorUser: req.user,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        reasonCategory: req.body.reasonCategory,
        details: req.body.details,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(201).json({ item });
    }),
  );

  router.patch(
    "/loa/:id",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await updateLoaRequest({
        actorUser: req.user,
        loaRequestId: req.params.id,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        reasonCategory: req.body.reasonCategory,
        details: req.body.details,
        leadershipComment: req.body.leadershipComment,
        s1Notes: req.body.s1Notes,
        reason: req.body.reason,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ item });
    }),
  );

  router.patch(
    "/loa/:id/status",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await reviewLoaRequest({
        actorUser: req.user,
        loaRequestId: req.params.id,
        status: req.body.status,
        leadershipComment: req.body.leadershipComment,
        s1Notes: req.body.s1Notes,
        reason: req.body.reason,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ item });
    }),
  );

  router.patch(
    "/loa/:id/withdraw",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await withdrawLoaRequest({
        actorUser: req.user,
        loaRequestId: req.params.id,
        reason: req.body.reason,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ item });
    }),
  );

  router.delete(
    "/loa/:id",
    requireAuth,
    requireRole("system:admin"),
    asyncRoute(async (req, res) => {
      await deleteLoaRequest({
        actorUser: req.user,
        loaRequestId: req.params.id,
        reason: req.body?.reason,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(204).end();
    }),
  );

  router.get(
    "/units",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await listUnits({ actorUser: req.user });
      res.json(item);
    }),
  );

  router.get(
    "/lookups/personnel",
    requireAuth,
    requireRole("personnel:write", "personnel:read", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const item = await listPersonnelLookups({ actorUser: req.user });
      res.json(item);
    }),
  );

  router.get(
    "/events",
    requireAuth,
    asyncRoute(async (req, res) => {
      const items = await listEvents({
        actorUser: req.user,
        status: req.query.status,
        limit: parseLimit(req.query.limit),
      });
      res.json({ items, next: null });
    }),
  );

  router.post(
    "/events",
    requireAuth,
    requireRole("personnel:write", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const item = await createCalendarEvent({
        actorUser: req.user,
        title: req.body.title,
        type: req.body.type,
        status: req.body.status,
        startsAt: req.body.startsAt,
        endsAt: req.body.endsAt,
        details: req.body.details,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(201).json({ item });
    }),
  );

  router.patch(
    "/events/:id",
    requireAuth,
    requireRole("personnel:write", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const item = await updateCalendarEvent({
        actorUser: req.user,
        eventId: req.params.id,
        title: req.body.title,
        type: req.body.type,
        status: req.body.status,
        startsAt: req.body.startsAt,
        endsAt: req.body.endsAt,
        details: req.body.details,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.json({ item });
    }),
  );

  router.get(
    "/events/:id/attendance",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await listAttendanceRecordsForEvent({
        actorUser: req.user,
        eventId: req.params.id,
      });
      res.json(item);
    }),
  );

  router.patch(
    "/events/:id/attendance/:recordId",
    requireAuth,
    requireRole("personnel:write", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      const item = await updateAttendanceRecord({
        actorUser: req.user,
        eventId: req.params.id,
        attendanceRecordId: req.params.recordId,
        status: req.body.status,
        rsvpStatus: req.body.rsvpStatus,
        notes: req.body.notes,
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
    "/support",
    requireAuth,
    asyncRoute(async (req, res) => {
      const items = await listBugReports({ actorUser: req.user, limit: parseLimit(req.query.limit) });
      res.json({ items, next: null });
    }),
  );

  router.post(
    "/support",
    requireAuth,
    asyncRoute(async (req, res) => {
      const item = await submitBugReport({
        actorUser: req.user,
        title: req.body.title,
        category: req.body.category,
        severity: req.body.severity,
        summary: req.body.summary,
        description: req.body.description,
        ipSessionMetadata: {
          ip: req.ip,
          userAgent: req.get("user-agent"),
        },
      });
      res.status(201).json({ item });
    }),
  );

  router.post(
    "/audit",
    requireAuth,
    requireRole("audit:write", "staff", "command", "command-staff", "system-admin"),
    asyncRoute(async (req, res) => {
      await assertCanAccessPersonnelProfile(req.user, req.body.affectedProfileId);
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
      const items = await listAuditLogs({ limit: parseLimit(req.query.limit, 50, 100), actorUser: req.user });
      res.json({ items, next: null });
    }),
  );

  return router;
}
