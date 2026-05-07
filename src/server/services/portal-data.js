import { getDb, isDbConfigured } from "../db.js";
import { getStaffScopeUnitName, isCommandStaffBillet } from "./unit-hierarchy.js";

const applicationStatuses = new Set([
  "NotStarted",
  "Draft",
  "Submitted",
  "UnderReview",
  "Contacted",
  "InterviewScheduled",
  "InterviewPassed",
  "Accepted",
  "Denied",
  "Withdrawn",
  "ConvertedToRecruit",
]);

const accountStatuses = new Set([
  "Applicant",
  "Recruit",
  "ProbationaryMember",
  "Active",
  "Reserve",
  "LeaveOfAbsence",
  "Inactive",
  "Discharged",
  "BannedDoNotRehire",
]);

const auditSeverities = new Set(["Info", "ActionRequired", "Warning", "Critical"]);
const activeApplicationStatuses = [
  "Draft",
  "Submitted",
  "UnderReview",
  "Contacted",
  "InterviewScheduled",
  "InterviewPassed",
  "Accepted",
];
const finalApplicationStatuses = new Set(["Denied", "Withdrawn", "ConvertedToRecruit"]);

const personnelProfileInclude = {
  user: {
    select: {
      id: true,
      discordId: true,
      discordUsername: true,
      discordDisplayName: true,
      displayAlias: true,
      steam64Id: true,
      steamUsername: true,
      steamProfileUrl: true,
      steamAvatarUrl: true,
      steamLinkedAt: true,
      steamLastSyncedAt: true,
      timezone: true,
      accountStatus: true,
    },
  },
  currentRank: true,
  primaryUnit: true,
  primaryBillet: true,
  staffAssignments: {
    where: { endDate: null },
    include: {
      staffSection: true,
    },
  },
  _count: {
    select: {
      assignments: true,
      qualifications: true,
      attendanceRecords: true,
      loaRequests: true,
    },
  },
};

function normalizeText(value, maxLength = 1000) {
  const normalized = String(value ?? "").trim();
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function assertCanReadApplication(user, application) {
  const permissions = user?.permissions || [];
  if (permissions.includes("applications:read") || permissions.includes("system:admin")) return;
  if (application.userId === user?.id) return;

  const error = new Error("Forbidden");
  error.statusCode = 403;
  throw error;
}

function hasFullPersonnelAccess(user) {
  const roles = user?.roles || [];
  const permissions = user?.permissions || [];

  if (permissions.includes("system:admin")) return true;
  if (roles.some((role) => ["system-admin", "command", "command-staff"].includes(role))) return true;
  if (
    isCommandStaffBillet({
      unitName: user?.profile?.unit?.name,
      billetName: user?.profile?.billet?.name,
    })
  ) {
    return true;
  }

  return false;
}

function canReadScopedPersonnel(user) {
  const roles = user?.roles || [];
  const permissions = user?.permissions || [];
  const hasBilletScope = Boolean(
    getStaffScopeUnitName({
      unitName: user?.profile?.unit?.name,
      billetName: user?.profile?.billet?.name,
    }),
  );

  return (
    hasFullPersonnelAccess(user) ||
    hasBilletScope ||
    permissions.includes("personnel:read") ||
    roles.some((role) => ["staff", "recruiter"].includes(role))
  );
}

export function canAccessPersonnelRoster(user) {
  return canReadScopedPersonnel(user);
}

function mergeWhere(...clauses) {
  const filters = clauses.filter((clause) => clause && Object.keys(clause).length);
  if (!filters.length) return {};
  if (filters.length === 1) return filters[0];
  return { AND: filters };
}

async function getUnitAndDescendantIds(rootUnitName) {
  if (!rootUnitName) return [];

  const db = getDb();
  const root = await db.unit.findFirst({
    where: { name: rootUnitName },
    select: { id: true },
  });

  if (!root) return [];

  const units = await db.unit.findMany({
    select: { id: true, parentId: true },
  });
  const childrenByParentId = new Map();

  for (const unit of units) {
    if (!unit.parentId) continue;
    const children = childrenByParentId.get(unit.parentId) || [];
    children.push(unit.id);
    childrenByParentId.set(unit.parentId, children);
  }

  const visibleIds = new Set([root.id]);
  const queue = [root.id];

  while (queue.length) {
    const unitId = queue.shift();
    for (const childId of childrenByParentId.get(unitId) || []) {
      if (visibleIds.has(childId)) continue;
      visibleIds.add(childId);
      queue.push(childId);
    }
  }

  return [...visibleIds];
}

async function personnelAccessWhere(actorUser) {
  if (hasFullPersonnelAccess(actorUser)) return {};

  const ownProfileId = actorUser?.profile?.id || null;
  if (!canReadScopedPersonnel(actorUser)) {
    return ownProfileId ? { id: ownProfileId } : { id: "__no_personnel_access__" };
  }

  const scopeUnitName = getStaffScopeUnitName({
    unitName: actorUser?.profile?.unit?.name,
    billetName: actorUser?.profile?.billet?.name,
  });
  const scopedUnitIds = await getUnitAndDescendantIds(scopeUnitName);
  const filters = [];

  if (ownProfileId) filters.push({ id: ownProfileId });
  if (scopedUnitIds.length) filters.push({ primaryUnitId: { in: scopedUnitIds } });

  return filters.length ? { OR: filters } : { id: "__no_personnel_scope__" };
}

export async function assertCanAccessPersonnelProfile(actorUser, profileId) {
  assertDatabaseReady();

  if (!profileId || hasFullPersonnelAccess(actorUser)) return;

  const where = mergeWhere({ id: profileId }, await personnelAccessWhere(actorUser));
  const count = await getDb().personnelProfile.count({ where });

  if (count > 0) return;

  const error = new Error("Forbidden");
  error.statusCode = 403;
  throw error;
}

export function assertDatabaseReady() {
  if (!isDbConfigured()) {
    const error = new Error("Database is not configured. Set DATABASE_URL before enabling this portal feature.");
    error.statusCode = 503;
    throw error;
  }
}

export function parseLimit(value, fallback = 50, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function listApplications({ status, search, limit = 50, actorUser } = {}) {
  assertDatabaseReady();

  const where = {};
  const canReadAll =
    actorUser?.permissions?.includes("applications:read") ||
    actorUser?.permissions?.includes("system:admin") ||
    actorUser?.roles?.some((role) => ["staff", "command-staff", "system-admin", "recruiter"].includes(role));

  if (!canReadAll) {
    where.userId = actorUser?.id;
  }

  if (status && applicationStatuses.has(status)) {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { roleInterest: { contains: search } },
      { availability: { contains: search } },
      { user: { is: { discordUsername: { contains: search } } } },
      { user: { is: { discordDisplayName: { contains: search } } } },
      { user: { is: { displayAlias: { contains: search } } } },
    ];
  }

  const applications = await getDb().application.findMany({
    where,
    take: limit,
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          discordId: true,
          discordUsername: true,
          discordDisplayName: true,
          displayAlias: true,
          steam64Id: true,
          timezone: true,
          accountStatus: true,
        },
      },
      answers: {
        orderBy: [{ section: "asc" }, { questionKey: "asc" }],
      },
      history: {
        take: 6,
        orderBy: { createdAt: "desc" },
      },
      notes: {
        take: 3,
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          answers: true,
          notes: true,
          history: true,
        },
      },
    },
  });

  return applications.map((application) => ({
    id: application.id,
    status: application.status,
    roleInterest: application.roleInterest,
    availability: application.availability,
    experience: application.experience,
    technicalReadiness: application.technicalReadiness,
    submittedAt: application.submittedAt,
    decidedAt: application.decidedAt,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    user: application.user,
    answers: application.answers.map((answer) => ({
      section: answer.section,
      questionKey: answer.questionKey,
      questionText: answer.questionText,
      answer: answer.answer,
    })),
    history: application.history.map((entry) => ({
      oldStatus: entry.oldStatus,
      newStatus: entry.newStatus,
      reason: entry.reason,
      createdAt: entry.createdAt,
    })),
    notes: application.notes.map((note) => ({
      note: note.note,
      createdAt: note.createdAt,
    })),
    counts: application._count,
  }));
}

export async function submitApplication({
  actorUserId,
  steam64Id,
  timezone,
  roleInterest,
  availability,
  experience,
  technicalReadiness,
  rulesAcknowledgement,
  motivation,
  armaExperience,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  const db = getDb();
  const cleanedSteam64Id = normalizeText(steam64Id, 32);
  const cleanedTimezone = normalizeText(timezone, 64);
  const applicationData = {
    roleInterest: normalizeText(roleInterest, 160),
    availability: normalizeText(availability, 500),
    experience: normalizeText(experience, 2000),
    technicalReadiness: normalizeText(technicalReadiness, 1000),
  };

  if (!applicationData.roleInterest || !applicationData.availability || !applicationData.experience) {
    const error = new Error("Role interest, availability, and experience are required.");
    error.statusCode = 400;
    throw error;
  }

  if (cleanedSteam64Id) {
    const existingSteamUser = await db.user.findFirst({
      where: {
        steam64Id: cleanedSteam64Id,
        NOT: { id: actorUserId },
      },
      select: { id: true },
    });

    if (existingSteamUser) {
      const error = new Error("That Steam64 ID is already linked to another account.");
      error.statusCode = 409;
      throw error;
    }
  }

  const existingApplication = await db.application.findFirst({
    where: {
      userId: actorUserId,
      status: { in: activeApplicationStatuses },
    },
    orderBy: { updatedAt: "desc" },
  });

  const answers = [
    {
      section: "Identity",
      questionKey: "steam64Id",
      questionText: "Steam64 ID",
      answer: cleanedSteam64Id || "Not provided",
    },
    {
      section: "Identity",
      questionKey: "timezone",
      questionText: "Timezone",
      answer: cleanedTimezone || "Not provided",
    },
    {
      section: "Readiness",
      questionKey: "technicalReadiness",
      questionText: "Modpack, TeamSpeak, ACRE/TFAR, microphone readiness",
      answer: applicationData.technicalReadiness || "Not provided",
    },
    {
      section: "Expectations",
      questionKey: "rulesAcknowledgement",
      questionText: "Rules and expectations acknowledgement",
      answer: normalizeText(rulesAcknowledgement, 1000) || "Not provided",
    },
    {
      section: "Short Answer",
      questionKey: "motivation",
      questionText: "Why do you want to join Task Force 20?",
      answer: normalizeText(motivation, 2000) || "Not provided",
    },
    {
      section: "Experience",
      questionKey: "armaExperience",
      questionText: "Relevant Arma or MILSIM experience",
      answer: normalizeText(armaExperience, 2000) || applicationData.experience,
    },
  ];

  const application = await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actorUserId },
      data: {
        steam64Id: cleanedSteam64Id || undefined,
        timezone: cleanedTimezone || undefined,
      },
    });

    const oldStatus = existingApplication?.status || null;
    const record = existingApplication
      ? await tx.application.update({
          where: { id: existingApplication.id },
          data: {
            ...applicationData,
            status: "Submitted",
            submittedAt: new Date(),
          },
        })
      : await tx.application.create({
          data: {
            userId: actorUserId,
            ...applicationData,
            status: "Submitted",
            submittedAt: new Date(),
          },
        });

    await tx.applicationAnswer.deleteMany({ where: { applicationId: record.id } });
    await tx.applicationAnswer.createMany({
      data: answers.map((answer) => ({
        applicationId: record.id,
        ...answer,
      })),
    });

    if (oldStatus !== "Submitted") {
      await tx.applicationStatusHistory.create({
        data: {
          applicationId: record.id,
          oldStatus,
          newStatus: "Submitted",
          changedById: actorUserId,
          reason: reason || "Application submitted by applicant.",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId,
        module: "Application",
        action: existingApplication ? "Resubmitted" : "Submitted",
        newValue: {
          roleInterest: applicationData.roleInterest,
          availability: applicationData.availability,
        },
        reason: reason || "Applicant submitted application.",
        relatedRecordId: record.id,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });

    return tx.application.findUnique({
      where: { id: record.id },
      include: {
        user: {
          select: {
            id: true,
            discordId: true,
            discordUsername: true,
            discordDisplayName: true,
            displayAlias: true,
            steam64Id: true,
            timezone: true,
            accountStatus: true,
          },
        },
        answers: true,
        history: { orderBy: { createdAt: "desc" } },
        notes: { orderBy: { createdAt: "desc" } },
        _count: { select: { answers: true, notes: true, history: true } },
      },
    });
  });

  return (await listApplications({ actorUser: { id: actorUserId }, limit: 1 })).find((item) => item.id === application.id);
}

export async function updateApplicationStatus({
  actorUser,
  applicationId,
  status,
  note,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  if (!applicationStatuses.has(status)) {
    const error = new Error("Invalid application status.");
    error.statusCode = 400;
    throw error;
  }

  const db = getDb();
  const application = await db.application.findUnique({
    where: { id: applicationId },
    include: {
      user: true,
    },
  });

  if (!application) {
    const error = new Error("Application not found.");
    error.statusCode = 404;
    throw error;
  }

  assertCanReadApplication(actorUser, application);

  const noteText = normalizeText(note, 2000);
  const reasonText = normalizeText(reason, 1000) || `Application status changed to ${status}.`;
  const targetStatus = status === "Accepted" ? "ConvertedToRecruit" : status;

  await db.$transaction(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: targetStatus,
        decidedAt: finalApplicationStatuses.has(targetStatus) ? new Date() : application.decidedAt,
      },
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId,
        oldStatus: application.status,
        newStatus: targetStatus,
        changedById: actorUser?.id,
        reason: reasonText,
      },
    });

    if (noteText) {
      await tx.applicationNote.create({
        data: {
          applicationId,
          authorUserId: actorUser?.id,
          note: noteText,
        },
      });
    }

    if (targetStatus === "ConvertedToRecruit") {
      await tx.user.update({
        where: { id: application.userId },
        data: { accountStatus: "Recruit" },
      });

      await tx.personnelProfile.upsert({
        where: { userId: application.userId },
        update: {
          currentStatus: "Recruit",
          dateAccepted: new Date(),
          dateJoined: new Date(),
        },
        create: {
          userId: application.userId,
          currentStatus: "Recruit",
          dateAccepted: new Date(),
          dateJoined: new Date(),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        module: "Application",
        action: targetStatus === "ConvertedToRecruit" ? "Accepted and Converted" : `Status: ${targetStatus}`,
        oldValue: { status: application.status },
        newValue: { status: targetStatus },
        reason: reasonText,
        relatedRecordId: applicationId,
        severity: status === "Denied" ? "Warning" : "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  return (await listApplications({ actorUser, limit: 100 })).find((item) => item.id === applicationId);
}

export async function listPersonnel({ status, search, limit = 50, actorUser } = {}) {
  assertDatabaseReady();

  const where = {};
  if (status && accountStatuses.has(status)) {
    where.currentStatus = status;
  }
  if (search) {
    where.OR = [
      { user: { is: { discordUsername: { contains: search } } } },
      { user: { is: { discordDisplayName: { contains: search } } } },
      { user: { is: { displayAlias: { contains: search } } } },
      { currentRank: { is: { abbreviation: { contains: search } } } },
      { primaryUnit: { is: { name: { contains: search } } } },
      { primaryBillet: { is: { name: { contains: search } } } },
      { primaryMos: { contains: search } },
    ];
  }

  const accessWhere = await personnelAccessWhere(actorUser);
  const personnel = await getDb().personnelProfile.findMany({
    where: mergeWhere(accessWhere, where),
    take: limit,
    orderBy: [{ updatedAt: "desc" }],
    include: personnelProfileInclude,
  });

  return personnel.map(toPersonnelItem);
}

export async function getPersonnelForUser(userId) {
  assertDatabaseReady();

  if (!userId) return null;

  const profile = await getDb().personnelProfile.findUnique({
    where: { userId },
    include: personnelProfileInclude,
  });

  return profile ? toPersonnelItem(profile) : null;
}

export async function getPortalSummary({ actorUser } = {}) {
  assertDatabaseReady();

  const db = getDb();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const activeRosterStatuses = ["Recruit", "ProbationaryMember", "Active", "Reserve", "LeaveOfAbsence"];
  const accessWhere = await personnelAccessWhere(actorUser);

  const [
    personnelByStatus,
    totalPersonnel,
    activePersonnel,
    missingBillet,
    missingPrimaryMos,
    applicationsByStatus,
    pendingAttendanceReview,
    totalEvents,
    upcomingEvents,
    auditThisMonth,
    totalAudit,
    unitCounts,
    pendingQualifications,
    openSupport,
    latestDiscordSync,
  ] = await Promise.all([
    db.personnelProfile.groupBy({
      by: ["currentStatus"],
      where: accessWhere,
      _count: { _all: true },
    }),
    db.personnelProfile.count({ where: accessWhere }),
    db.personnelProfile.count({ where: mergeWhere(accessWhere, { currentStatus: "Active" }) }),
    db.personnelProfile.count({ where: mergeWhere(accessWhere, { primaryBilletId: null }) }),
    db.personnelProfile.count({
      where: mergeWhere(accessWhere, {
        OR: [{ primaryMos: null }, { primaryMos: "" }],
      }),
    }),
    db.application.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.attendanceRecord.count({ where: { status: "PendingReview" } }),
    db.calendarEvent.count(),
    db.calendarEvent.count({ where: { startsAt: { gte: now } } }),
    db.auditLog.count({ where: { createdAt: { gte: startOfMonth } } }),
    db.auditLog.count(),
    db.personnelProfile.groupBy({
      by: ["primaryUnitId"],
      where: mergeWhere(accessWhere, {
        currentStatus: { in: activeRosterStatuses },
        primaryUnitId: { not: null },
      }),
      _count: { _all: true },
    }),
    db.personnelQualification.count({
      where: { status: { in: ["Recommended", "PendingApproval"] } },
    }),
    db.bugReport.count({
      where: { status: { notIn: ["Closed", "Resolved"] } },
    }),
    db.discordSyncLog.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  const unitIds = unitCounts.map((entry) => entry.primaryUnitId).filter(Boolean);
  const units = unitIds.length
    ? await db.unit.findMany({
        where: { id: { in: unitIds } },
        select: { id: true, name: true, type: true },
      })
    : [];
  const unitNamesById = new Map(units.map((unit) => [unit.id, unit]));

  return {
    personnel: {
      total: totalPersonnel,
      active: activePersonnel,
      missingBillet,
      missingPrimaryMos,
      byStatus: groupCounts(personnelByStatus, "currentStatus"),
    },
    applications: {
      total: sumGroupedCounts(applicationsByStatus),
      active: applicationsByStatus
        .filter((entry) => activeApplicationStatuses.includes(entry.status))
        .reduce((total, entry) => total + groupedCount(entry), 0),
      awaitingContact: applicationsByStatus
        .filter((entry) => ["Submitted", "UnderReview"].includes(entry.status))
        .reduce((total, entry) => total + groupedCount(entry), 0),
      byStatus: groupCounts(applicationsByStatus, "status"),
    },
    attendance: {
      pendingReview: pendingAttendanceReview,
      totalEvents,
      upcomingEvents,
    },
    audit: {
      thisMonth: auditThisMonth,
      total: totalAudit,
    },
    units: unitCounts.map((entry) => {
      const unit = unitNamesById.get(entry.primaryUnitId);
      return {
        id: entry.primaryUnitId,
        name: unit?.name || "Unknown Unit",
        type: unit?.type || "Unit",
        personnelCount: groupedCount(entry),
      };
    }),
    workflows: {
      pendingQualifications,
      openSupport,
      latestDiscordSync: latestDiscordSync
        ? {
            action: latestDiscordSync.action,
            status: latestDiscordSync.status,
            createdAt: latestDiscordSync.createdAt,
          }
        : null,
    },
  };
}

export async function listAuditLogs({ limit = 50, actorUser } = {}) {
  assertDatabaseReady();

  const accessWhere = await personnelAccessWhere(actorUser);
  const where = hasFullPersonnelAccess(actorUser)
    ? {}
    : {
        affectedProfile: {
          is: accessWhere,
        },
      };

  const entries = await getDb().auditLog.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      actor: {
        select: {
          discordUsername: true,
          discordDisplayName: true,
          displayAlias: true,
        },
      },
      affectedProfile: {
        include: {
          user: {
            select: {
              discordUsername: true,
              discordDisplayName: true,
              displayAlias: true,
            },
          },
        },
      },
    },
  });

  return entries.map((entry) => ({
    id: entry.id,
    createdAt: entry.createdAt,
    actor: displayUser(entry.actor) || (entry.systemGenerated ? "System" : "Unknown"),
    affectedProfile: displayUser(entry.affectedProfile?.user),
    module: entry.module,
    action: entry.action,
    reason: entry.reason,
    severity: entry.severity,
    relatedRecordId: entry.relatedRecordId,
    systemGenerated: entry.systemGenerated,
  }));
}

function toPersonnelItem(profile) {
  return {
    id: profile.id,
    status: profile.currentStatus,
    dateJoined: profile.dateJoined,
    dateAccepted: profile.dateAccepted,
    recruitClass: profile.recruitClass,
    goodStanding: profile.goodStanding,
    primaryMos: profile.primaryMos,
    user: profile.user,
    rank: profile.currentRank,
    unit: profile.primaryUnit,
    billet: profile.primaryBillet,
    staffAssignments: profile.staffAssignments.map((assignment) => ({
      id: assignment.id,
      assignmentType: assignment.assignmentType,
      effectiveDate: assignment.effectiveDate,
      staffSection: assignment.staffSection,
    })),
    counts: profile._count,
    updatedAt: profile.updatedAt,
  };
}

function groupedCount(entry) {
  return entry?._count?._all || 0;
}

function groupCounts(entries, key) {
  return Object.fromEntries(entries.map((entry) => [entry[key] || "None", groupedCount(entry)]));
}

function sumGroupedCounts(entries) {
  return entries.reduce((total, entry) => total + groupedCount(entry), 0);
}

function displayUser(user) {
  return user?.displayAlias || user?.discordDisplayName || user?.discordUsername || "";
}

export async function writeAuditLog({
  actorUserId,
  affectedProfileId,
  module,
  action,
  oldValue,
  newValue,
  reason,
  relatedRecordId,
  severity = "Info",
  systemGenerated = false,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  if (!module || !action) {
    const error = new Error("Audit log requires module and action.");
    error.statusCode = 400;
    throw error;
  }

  return getDb().auditLog.create({
    data: {
      actorUserId,
      affectedProfileId,
      module,
      action,
      oldValue,
      newValue,
      reason,
      relatedRecordId,
      severity: auditSeverities.has(severity) ? severity : "Info",
      systemGenerated,
      ipSessionMetadata,
    },
  });
}
