import { getDb, isDbConfigured } from "../db.js";
import { getCommandDashboardBucketName, getStaffScopeUnitName, isCommandStaffBillet } from "./unit-hierarchy.js";

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
const loaStatuses = new Set(["Submitted", "Approved", "Denied", "Returned", "Cancelled"]);
const supportSeverities = new Set(["Low", "Medium", "High", "Critical"]);
const attendanceStatuses = new Set([
  "Present",
  "PresentAutoVerified",
  "PresentManual",
  "PartialAttendance",
  "Late",
  "LeftEarly",
  "Absent",
  "Excused",
  "NoShow",
  "LOA",
  "NotRequired",
  "PendingReview",
]);
const eventStatuses = new Set(["Planned", "Open", "Closed", "Cancelled"]);
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
const activeRosterStatuses = ["Recruit", "ProbationaryMember", "Active", "Reserve", "LeaveOfAbsence"];
const loaReviewerBillets = new Set(["co", "commandingofficer", "xo", "executiveofficer", "pl", "platoonleader", "tl", "teamleader"]);

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

function normalizeOrgValue(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function currentTimestamp() {
  return new Date();
}

function startOfDay(date = currentTimestamp()) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function syncApprovedLoaStatuses() {
  assertDatabaseReady();

  const db = getDb();
  const today = startOfDay();
  const approvedRecords = await db.lOARequest.findMany({
    where: { status: "Approved" },
    select: {
      id: true,
      profileId: true,
      startDate: true,
    },
  });

  const shouldBeOnLoa = new Set(
    approvedRecords
      .filter((record) => {
        const startDate = normalizeDate(record.startDate);
        return startDate && startOfDay(startDate) <= today;
      })
      .map((record) => record.profileId),
  );

  const candidateProfileIds = new Set(approvedRecords.map((record) => record.profileId));
  if (!candidateProfileIds.size) return;

  const profiles = await db.personnelProfile.findMany({
    where: {
      OR: [
        { id: { in: [...candidateProfileIds] } },
        { currentStatus: "LeaveOfAbsence" },
      ],
    },
    select: {
      id: true,
      userId: true,
      currentStatus: true,
      user: { select: { accountStatus: true } },
    },
  });

  await db.$transaction(async (tx) => {
    for (const profile of profiles) {
      const nextStatus = shouldBeOnLoa.has(profile.id) ? "LeaveOfAbsence" : profile.currentStatus === "LeaveOfAbsence" ? "Active" : null;
      if (!nextStatus || nextStatus === profile.currentStatus) continue;

      await tx.personnelProfile.update({
        where: { id: profile.id },
        data: { currentStatus: nextStatus },
      });

      if (profile.userId && profile.user?.accountStatus !== nextStatus) {
        await tx.user.update({
          where: { id: profile.userId },
          data: { accountStatus: nextStatus },
        });
      }
    }
  });
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

function canManageEvents(user) {
  return (
    hasFullPersonnelAccess(user) ||
    user?.permissions?.includes("personnel:write") ||
    user?.roles?.some((role) => ["staff", "command-staff", "system-admin"].includes(role))
  );
}

function isCommandStaffReviewer(actorUser) {
  return (
    actorUser?.roles?.some((role) => ["command-staff", "command"].includes(role)) ||
    isCommandStaffBillet({
      unitName: actorUser?.profile?.unit?.name,
      billetName: actorUser?.profile?.billet?.name,
    })
  );
}

function getLoaReviewerScopeUnitName(actorUser) {
  if (isCommandStaffReviewer(actorUser)) return "__all__";

  const billetKey = normalizeOrgValue(actorUser?.profile?.billet?.name);
  if (!loaReviewerBillets.has(billetKey)) return null;

  return getStaffScopeUnitName({
    unitName: actorUser?.profile?.unit?.name,
    billetName: actorUser?.profile?.billet?.name,
  });
}

async function canActorReviewLoaRecord(actorUser, record) {
  if (!actorUser?.id || !record?.profile) return false;

  const submitterBilletKey = normalizeOrgValue(record.profile?.primaryBillet?.name);
  if (submitterBilletKey === "co" || submitterBilletKey === "commandingofficer") {
    return isCommandStaffReviewer(actorUser);
  }

  const scopeUnitName = getLoaReviewerScopeUnitName(actorUser);
  if (!scopeUnitName) return false;
  if (scopeUnitName === "__all__") return true;

  const scopedUnitIds = await getUnitAndDescendantIds(scopeUnitName);
  return Boolean(record.profile?.primaryUnitId && scopedUnitIds.includes(record.profile.primaryUnitId));
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
  await syncApprovedLoaStatuses();

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
  await syncApprovedLoaStatuses();

  if (!userId) return null;

  const profile = await getDb().personnelProfile.findUnique({
    where: { userId },
    include: personnelProfileInclude,
  });

  return profile ? toPersonnelItem(profile) : null;
}

export async function getPortalSummary({ actorUser } = {}) {
  assertDatabaseReady();
  await syncApprovedLoaStatuses();

  const db = getDb();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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
    db.personnelProfile.count({
      where: mergeWhere(accessWhere, {
        currentStatus: { in: activeRosterStatuses },
        primaryBilletId: null,
      }),
    }),
    db.personnelProfile.count({
      where: mergeWhere(accessWhere, {
        currentStatus: { in: activeRosterStatuses },
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

  const commandDashboardCounts = new Map();
  for (const entry of unitCounts) {
    const unit = unitNamesById.get(entry.primaryUnitId);
    const bucketName = getCommandDashboardBucketName(unit?.name);
    if (!bucketName) continue;
    commandDashboardCounts.set(bucketName, (commandDashboardCounts.get(bucketName) || 0) + groupedCount(entry));
  }

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
    units: [
      "A Co, 1/75th Ranger Regiment",
      "1 Troop, A Squadron, 1st SFOD-Delta",
      "B Co, 2/160th SOAR",
    ].map((name) => ({
      id: name,
      name,
      type: "CommandDashboardBucket",
      personnelCount: commandDashboardCounts.get(name) || 0,
    })),
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

export async function updatePersonnelProfile({
  actorUser,
  profileId,
  primaryUnitId,
  primaryBilletId,
  primaryMos,
  status,
  goodStanding,
  staffSectionIds,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();
  await assertCanAccessPersonnelProfile(actorUser, profileId);

  const db = getDb();
  const profile = await db.personnelProfile.findUnique({
    where: { id: profileId },
    include: {
      user: { select: { id: true, accountStatus: true } },
      primaryUnit: { select: { id: true, name: true } },
      primaryBillet: { select: { id: true, name: true } },
      staffAssignments: {
        where: { endDate: null },
        include: { staffSection: true },
      },
    },
  });

  if (!profile) {
    const error = new Error("Personnel profile not found.");
    error.statusCode = 404;
    throw error;
  }

  const nextStatus = status && accountStatuses.has(status) ? status : profile.currentStatus;
  const lockAssignmentFields = ["Discharged", "BannedDoNotRehire"].includes(nextStatus);
  const nextPrimaryUnitId = lockAssignmentFields ? null : primaryUnitId ?? profile.primaryUnitId;
  const nextPrimaryMos = lockAssignmentFields ? null : normalizeText(primaryMos, 160) || null;
  const nextGoodStanding = typeof goodStanding === "boolean" ? goodStanding : profile.goodStanding;
  const nextPrimaryBilletId = lockAssignmentFields ? null : primaryBilletId ?? profile.primaryBilletId;
  const nextStaffSectionIds = lockAssignmentFields
    ? []
    : Array.isArray(staffSectionIds)
      ? [...new Set(staffSectionIds.map((value) => String(value).trim()).filter(Boolean))]
      : profile.staffAssignments.map((assignment) => assignment.staffSectionId);

  if (nextPrimaryUnitId) {
    const unit = await db.unit.findUnique({ where: { id: nextPrimaryUnitId }, select: { id: true } });
    if (!unit) {
      const error = new Error("Primary unit not found.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (nextPrimaryBilletId) {
    const billet = await db.billet.findUnique({ where: { id: nextPrimaryBilletId }, select: { id: true } });
    if (!billet) {
      const error = new Error("Primary billet not found.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (nextStaffSectionIds.length) {
    const sectionCount = await db.staffSection.count({
      where: { id: { in: nextStaffSectionIds } },
    });
    if (sectionCount !== nextStaffSectionIds.length) {
      const error = new Error("One or more staff sections are invalid.");
      error.statusCode = 400;
      throw error;
    }
  }

  const auditReason = normalizeText(reason, 1000) || "Updated personnel profile from the portal.";

  await db.$transaction(async (tx) => {
    await tx.personnelProfile.update({
      where: { id: profileId },
      data: {
        primaryUnitId: nextPrimaryUnitId,
        primaryBilletId: nextPrimaryBilletId,
        primaryMos: nextPrimaryMos,
        currentStatus: nextStatus,
        goodStanding: nextGoodStanding,
      },
    });

    await tx.user.update({
      where: { id: profile.userId },
      data: { accountStatus: nextStatus },
    });

    await tx.staffAssignment.updateMany({
      where: { profileId, endDate: null },
      data: { endDate: currentTimestamp(), reason: auditReason },
    });

    for (const staffSectionId of nextStaffSectionIds) {
      await tx.staffAssignment.create({
        data: {
          profileId,
          staffSectionId,
          effectiveDate: currentTimestamp(),
          assignmentType: "StaffAssignment",
          assignedByUserId: actorUser?.id,
          reason: auditReason,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        affectedProfileId: profileId,
        module: "Personnel",
        action: "Updated Personnel Profile",
        oldValue: {
          primaryUnitId: profile.primaryUnitId,
          primaryBilletId: profile.primaryBilletId,
          primaryMos: profile.primaryMos,
          currentStatus: profile.currentStatus,
          goodStanding: profile.goodStanding,
          staffSectionIds: profile.staffAssignments.map((assignment) => assignment.staffSectionId),
        },
        newValue: {
          primaryUnitId: nextPrimaryUnitId,
          primaryBilletId: nextPrimaryBilletId,
          primaryMos: nextPrimaryMos,
          currentStatus: nextStatus,
          goodStanding: nextGoodStanding,
          staffSectionIds: nextStaffSectionIds,
        },
        reason: auditReason,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  const updated = await getDb().personnelProfile.findUnique({
    where: { id: profileId },
    include: personnelProfileInclude,
  });

  return updated ? toPersonnelItem(updated) : null;
}

export async function listLoaRequests({ actorUser, limit = 50, status } = {}) {
  assertDatabaseReady();
  await syncApprovedLoaStatuses();

  const statusWhere = status && loaStatuses.has(status) ? { status } : {};
  const records = await getDb().lOARequest.findMany({
    where: statusWhere,
    take: limit,
    orderBy: [{ submittedAt: "desc" }],
    include: {
      profile: {
        include: {
          user: {
            select: {
              id: true,
              discordUsername: true,
              discordDisplayName: true,
              displayAlias: true,
            },
          },
          currentRank: true,
          primaryUnit: true,
          primaryBillet: true,
        },
      },
    },
  });

  const ownProfileId = actorUser?.profile?.id || null;
  const visibleRecords = [];
  for (const record of records) {
    const isOwn = ownProfileId && record.profileId === ownProfileId;
    const canReview = await canActorReviewLoaRecord(actorUser, record);
    if (!isOwn && !canReview) continue;

    visibleRecords.push({
      id: record.id,
      profileId: record.profileId,
      member: displayUser(record.profile?.user),
      rank: record.profile?.currentRank?.abbreviation || "Unranked",
      unit: record.profile?.primaryUnit?.name || "Unassigned",
      billet: record.profile?.primaryBillet?.name || "Missing",
      startDate: record.startDate,
      endDate: record.endDate,
      reasonCategory: record.reasonCategory,
      details: record.details,
      status: record.status,
      submittedAt: record.submittedAt,
      reviewedById: record.reviewedById,
      decisionDate: record.decisionDate,
      leadershipComment: record.leadershipComment,
      s1Notes: record.s1Notes,
      returnConfirmed: record.returnConfirmed,
      canApproveDeny: canReview && record.status === "Submitted",
      canMarkReturned: isOwn && record.status === "Approved",
      canWithdraw: isOwn && !["Returned", "Cancelled"].includes(record.status),
      canEditResponded: canReview && record.status !== "Submitted",
    });
  }

  return visibleRecords;
}

export async function submitLoaRequest({
  actorUser,
  startDate,
  endDate,
  reasonCategory,
  details,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  const profileId = actorUser?.profile?.id;
  if (!profileId) {
    const error = new Error("A linked personnel profile is required before you can submit LOA.");
    error.statusCode = 400;
    throw error;
  }

  const parsedStart = normalizeDate(startDate);
  const parsedEnd = normalizeDate(endDate);
  if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
    const error = new Error("LOA start and end dates must be valid, and end date must be on or after start date.");
    error.statusCode = 400;
    throw error;
  }

  const category = normalizeText(reasonCategory, 80);
  if (!category) {
    const error = new Error("LOA reason category is required.");
    error.statusCode = 400;
    throw error;
  }

  const record = await getDb().$transaction(async (tx) => {
    const created = await tx.lOARequest.create({
      data: {
        profileId,
        startDate: parsedStart,
        endDate: parsedEnd,
        reasonCategory: category,
        details: normalizeText(details, 2000) || null,
        status: "Submitted",
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        affectedProfileId: profileId,
        module: "LOA",
        action: "Submitted LOA Request",
        newValue: {
          startDate: parsedStart,
          endDate: parsedEnd,
          reasonCategory: category,
          status: "Submitted",
        },
        reason: "Member submitted LOA request.",
        relatedRecordId: created.id,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });

    return created;
  });

  return (await listLoaRequests({ actorUser, limit: 100 })).find((item) => item.id === record.id);
}

export async function reviewLoaRequest({
  actorUser,
  loaRequestId,
  status,
  leadershipComment,
  s1Notes,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  if (!["Approved", "Denied", "Returned"].includes(status)) {
    const error = new Error("LOA review status must be Approved, Denied, or Returned.");
    error.statusCode = 400;
    throw error;
  }

  const db = getDb();
  const record = await db.lOARequest.findUnique({
    where: { id: loaRequestId },
    include: {
      profile: true,
    },
  });

  if (!record) {
    const error = new Error("LOA request not found.");
    error.statusCode = 404;
    throw error;
  }

  const isOwn = actorUser?.profile?.id === record.profileId;
  const canReview = await canActorReviewLoaRecord(actorUser, record);
  if (status === "Returned") {
    if (!isOwn || record.status !== "Approved") {
      const error = new Error("Only the submitting member can mark an approved LOA as returned.");
      error.statusCode = 403;
      throw error;
    }
  } else if (!canReview || record.status !== "Submitted") {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  const reviewReason =
    normalizeText(reason, 1000) ||
    (status === "Returned" ? "Member marked approved LOA as returned." : `LOA request ${status.toLowerCase()} from the portal.`);

  await db.$transaction(async (tx) => {
    await tx.lOARequest.update({
      where: { id: loaRequestId },
      data: {
        status,
        reviewedById: status === "Returned" ? record.reviewedById || actorUser?.id : actorUser?.id,
        decisionDate: currentTimestamp(),
        leadershipComment: normalizeText(leadershipComment, 2000) || null,
        s1Notes: normalizeText(s1Notes, 2000) || null,
        returnConfirmed: status === "Returned",
      },
    });

    if (status === "Returned" && record.profile.currentStatus === "LeaveOfAbsence") {
      await tx.personnelProfile.update({
        where: { id: record.profileId },
        data: { currentStatus: "Active" },
      });
      await tx.user.update({
        where: { id: record.profile.userId },
        data: { accountStatus: "Active" },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        affectedProfileId: record.profileId,
        module: "LOA",
        action: `Reviewed LOA Request: ${status}`,
        oldValue: { status: record.status },
        newValue: { status },
        reason: reviewReason,
        relatedRecordId: loaRequestId,
        severity: status === "Denied" ? "Warning" : "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  await syncApprovedLoaStatuses();

  return (await listLoaRequests({ actorUser, limit: 100 })).find((item) => item.id === loaRequestId);
}

export async function withdrawLoaRequest({
  actorUser,
  loaRequestId,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  const db = getDb();
  const record = await db.lOARequest.findUnique({
    where: { id: loaRequestId },
    include: {
      profile: {
        include: {
          user: { select: { id: true, accountStatus: true } },
        },
      },
    },
  });

  if (!record) {
    const error = new Error("LOA request not found.");
    error.statusCode = 404;
    throw error;
  }

  const isOwn = actorUser?.profile?.id === record.profileId;
  if (!isOwn || ["Returned", "Cancelled"].includes(record.status)) {
    const error = new Error("Only the submitting member can withdraw an active LOA request.");
    error.statusCode = 403;
    throw error;
  }

  const withdrawalReason =
    normalizeText(reason, 1000) || "Member withdrew LOA request from the portal.";

  await db.$transaction(async (tx) => {
    await tx.lOARequest.update({
      where: { id: loaRequestId },
      data: {
        status: "Cancelled",
        decisionDate: currentTimestamp(),
        returnConfirmed: false,
      },
    });

    if (record.status === "Approved" && record.profile.currentStatus === "LeaveOfAbsence") {
      await tx.personnelProfile.update({
        where: { id: record.profileId },
        data: { currentStatus: "Active" },
      });
      await tx.user.update({
        where: { id: record.profile.userId },
        data: { accountStatus: "Active" },
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        affectedProfileId: record.profileId,
        module: "LOA",
        action: "Withdrew LOA Request",
        oldValue: { status: record.status },
        newValue: { status: "Cancelled" },
        reason: withdrawalReason,
        relatedRecordId: loaRequestId,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  await syncApprovedLoaStatuses();

  return (await listLoaRequests({ actorUser, limit: 100 })).find((item) => item.id === loaRequestId);
}

export async function updateLoaRequest({
  actorUser,
  loaRequestId,
  startDate,
  endDate,
  reasonCategory,
  details,
  leadershipComment,
  s1Notes,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  const db = getDb();
  const record = await db.lOARequest.findUnique({
    where: { id: loaRequestId },
    include: {
      profile: {
        include: {
          user: { select: { id: true } },
          primaryUnit: true,
          primaryBillet: true,
        },
      },
    },
  });

  if (!record) {
    const error = new Error("LOA request not found.");
    error.statusCode = 404;
    throw error;
  }

  const canReview = await canActorReviewLoaRecord(actorUser, record);
  if (!canReview || record.status === "Submitted") {
    const error = new Error("Only scoped staff or command can edit a responded LOA request.");
    error.statusCode = 403;
    throw error;
  }

  const parsedStart = normalizeDate(startDate);
  const parsedEnd = normalizeDate(endDate);
  if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
    const error = new Error("LOA start and end dates must be valid, and end date must be on or after start date.");
    error.statusCode = 400;
    throw error;
  }

  const category = normalizeText(reasonCategory, 80);
  if (!category) {
    const error = new Error("LOA reason category is required.");
    error.statusCode = 400;
    throw error;
  }

  const updateReason = normalizeText(reason, 1000);
  if (!updateReason) {
    const error = new Error("A reason is required when editing a responded LOA request.");
    error.statusCode = 400;
    throw error;
  }

  const nextDetails = normalizeText(details, 2000) || null;
  const nextLeadershipComment = normalizeText(leadershipComment, 2000) || null;
  const nextS1Notes = normalizeText(s1Notes, 2000) || null;

  await db.$transaction(async (tx) => {
    await tx.lOARequest.update({
      where: { id: loaRequestId },
      data: {
        startDate: parsedStart,
        endDate: parsedEnd,
        reasonCategory: category,
        details: nextDetails,
        leadershipComment: nextLeadershipComment,
        s1Notes: nextS1Notes,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        affectedProfileId: record.profileId,
        module: "LOA",
        action: "Edited Responded LOA Request",
        oldValue: {
          startDate: record.startDate,
          endDate: record.endDate,
          reasonCategory: record.reasonCategory,
          details: record.details,
          leadershipComment: record.leadershipComment,
          s1Notes: record.s1Notes,
          status: record.status,
        },
        newValue: {
          startDate: parsedStart,
          endDate: parsedEnd,
          reasonCategory: category,
          details: nextDetails,
          leadershipComment: nextLeadershipComment,
          s1Notes: nextS1Notes,
          status: record.status,
        },
        reason: updateReason,
        relatedRecordId: loaRequestId,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  await syncApprovedLoaStatuses();

  return (await listLoaRequests({ actorUser, limit: 100 })).find((item) => item.id === loaRequestId);
}

export async function listUnits({ actorUser } = {}) {
  assertDatabaseReady();
  const db = getDb();
  const units = await db.unit.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      billets: {
        orderBy: { name: "asc" },
        include: { category: true },
      },
      _count: {
        select: {
          children: true,
          profiles: true,
        },
      },
    },
  });

  const byParent = new Map();
  for (const unit of units) {
    const key = unit.parentId || "__root__";
    const items = byParent.get(key) || [];
    items.push(unit);
    byParent.set(key, items);
  }

  const unitItems = units.map((unit) => ({
    id: unit.id,
    parentId: unit.parentId,
    name: unit.name,
    type: unit.type,
    sortOrder: unit.sortOrder,
    personnelCount: unit._count.profiles,
    childCount: unit._count.children,
    billets: unit.billets.map((billet) => ({
      id: billet.id,
      name: billet.name,
      category: billet.category?.name || "Uncategorized",
    })),
  }));

  return {
    items: unitItems,
    roots: (byParent.get("__root__") || []).map((unit) => unit.id),
    visibility: actorUser?.access?.personnelScope || "self",
  };
}

export async function listPersonnelLookups({ actorUser } = {}) {
  assertDatabaseReady();

  if (!canReadScopedPersonnel(actorUser) && !canManageEvents(actorUser)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  const [units, billets, staffSections] = await Promise.all([
    getDb().unit.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
      },
    }),
    getDb().billet.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        unit: {
          select: {
            id: true,
            name: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    getDb().staffSection.findMany({
      orderBy: [{ code: "asc" }, { name: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
      },
    }),
  ]);

  return {
    units,
    billets: billets.map((billet) => ({
      id: billet.id,
      name: billet.name,
      unitId: billet.unitId,
      unitName: billet.unit?.name || "",
      category: billet.category?.name || "Uncategorized",
    })),
    staffSections,
  };
}

export async function listEvents({ actorUser, limit = 50, status } = {}) {
  assertDatabaseReady();

  const profileId = actorUser?.profile?.id || null;
  const where = status && eventStatuses.has(status) ? { status } : {};
  const items = await getDb().calendarEvent.findMany({
    where,
    take: limit,
    orderBy: [{ startsAt: "asc" }, { title: "asc" }],
    include: {
      attendance: profileId
        ? {
            where: { profileId },
            include: {
              profile: {
                include: {
                  user: {
                    select: {
                      displayAlias: true,
                      discordDisplayName: true,
                      discordUsername: true,
                    },
                  },
                },
              },
            },
          }
        : false,
      _count: {
        select: {
          attendance: true,
          observations: true,
        },
      },
    },
  });

  return items.map((event) => {
    const ownAttendance = profileId ? event.attendance?.[0] || null : null;
    return {
      id: event.id,
      title: event.title,
      type: event.type,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      details: event.details,
      ownerUserId: event.ownerUserId,
      attendanceCount: event._count.attendance,
      observationCount: event._count.observations,
      ownAttendance: ownAttendance
        ? {
            id: ownAttendance.id,
            status: ownAttendance.status,
            rsvpStatus: ownAttendance.rsvpStatus,
            notes: ownAttendance.notes,
          }
        : null,
    };
  });
}

async function buildAttendanceSeedProfiles(actorUser) {
  const where = mergeWhere(await personnelAccessWhere(actorUser), {
    currentStatus: { in: activeRosterStatuses },
  });

  return getDb().personnelProfile.findMany({
    where,
    select: { id: true },
  });
}

export async function createCalendarEvent({
  actorUser,
  title,
  type,
  status,
  startsAt,
  endsAt,
  details,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  if (!canManageEvents(actorUser)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  const cleanedTitle = normalizeText(title, 160);
  const cleanedType = normalizeText(type, 80);
  const cleanedStatus = eventStatuses.has(status) ? status : "Planned";
  const cleanedDetails = normalizeText(details, 4000) || null;
  const parsedStartsAt = normalizeDate(startsAt);
  const parsedEndsAt = normalizeDate(endsAt);

  if (!cleanedTitle || !cleanedType || !parsedStartsAt) {
    const error = new Error("Event title, type, and start date are required.");
    error.statusCode = 400;
    throw error;
  }

  if (parsedEndsAt && parsedEndsAt < parsedStartsAt) {
    const error = new Error("Event end date must be on or after the start date.");
    error.statusCode = 400;
    throw error;
  }

  const seedProfiles = await buildAttendanceSeedProfiles(actorUser);
  const created = await getDb().$transaction(async (tx) => {
    const event = await tx.calendarEvent.create({
      data: {
        title: cleanedTitle,
        type: cleanedType,
        status: cleanedStatus,
        startsAt: parsedStartsAt,
        endsAt: parsedEndsAt,
        details: cleanedDetails,
        ownerUserId: actorUser?.id || null,
      },
    });

    if (seedProfiles.length) {
      await tx.attendanceRecord.createMany({
        data: seedProfiles.map((profile) => ({
          eventId: event.id,
          profileId: profile.id,
          status: "PendingReview",
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        module: "Event",
        action: "Created Event",
        newValue: {
          title: cleanedTitle,
          type: cleanedType,
          status: cleanedStatus,
          startsAt: parsedStartsAt,
          endsAt: parsedEndsAt,
          seededAttendance: seedProfiles.length,
        },
        reason: "Created event from portal.",
        relatedRecordId: event.id,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });

    return event;
  });

  return (await listEvents({ actorUser, limit: 100 })).find((item) => item.id === created.id) || null;
}

export async function updateCalendarEvent({
  actorUser,
  eventId,
  title,
  type,
  status,
  startsAt,
  endsAt,
  details,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  if (!canManageEvents(actorUser)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  const db = getDb();
  const event = await db.calendarEvent.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    const error = new Error("Event not found.");
    error.statusCode = 404;
    throw error;
  }

  const nextStartsAt = normalizeDate(startsAt) || event.startsAt;
  const nextEndsAt = endsAt === "" ? null : normalizeDate(endsAt);
  if (nextEndsAt && nextEndsAt < nextStartsAt) {
    const error = new Error("Event end date must be on or after the start date.");
    error.statusCode = 400;
    throw error;
  }

  const nextTitle = normalizeText(title, 160) || event.title;
  const nextType = normalizeText(type, 80) || event.type;
  const nextStatus = eventStatuses.has(status) ? status : event.status;
  const nextDetails = normalizeText(details, 4000) || null;
  const seedProfiles = await buildAttendanceSeedProfiles(actorUser);

  await db.$transaction(async (tx) => {
    await tx.calendarEvent.update({
      where: { id: eventId },
      data: {
        title: nextTitle,
        type: nextType,
        status: nextStatus,
        startsAt: nextStartsAt,
        endsAt: nextEndsAt,
        details: nextDetails,
      },
    });

    if (seedProfiles.length) {
      await tx.attendanceRecord.createMany({
        data: seedProfiles.map((profile) => ({
          eventId,
          profileId: profile.id,
          status: "PendingReview",
        })),
        skipDuplicates: true,
      });
    }

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        module: "Event",
        action: "Updated Event",
        oldValue: {
          title: event.title,
          type: event.type,
          status: event.status,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          details: event.details,
        },
        newValue: {
          title: nextTitle,
          type: nextType,
          status: nextStatus,
          startsAt: nextStartsAt,
          endsAt: nextEndsAt,
          details: nextDetails,
        },
        reason: "Updated event from portal.",
        relatedRecordId: eventId,
        severity: "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  return (await listEvents({ actorUser, limit: 100 })).find((item) => item.id === eventId) || null;
}

export async function listAttendanceRecordsForEvent({ actorUser, eventId } = {}) {
  assertDatabaseReady();

  const event = await getDb().calendarEvent.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      startsAt: true,
      endsAt: true,
      details: true,
    },
  });

  if (!event) {
    const error = new Error("Event not found.");
    error.statusCode = 404;
    throw error;
  }

  const canReadAll = canManageEvents(actorUser) || canReadScopedPersonnel(actorUser);
  let where;
  if (!canReadAll) {
    where = {
      eventId,
      profileId: actorUser?.profile?.id || "__no_profile__",
    };
  } else {
    where = mergeWhere(
      { eventId },
      {
        profile: {
          is: await personnelAccessWhere(actorUser),
        },
      },
    );
  }

  const items = await getDb().attendanceRecord.findMany({
    where,
    orderBy: [{ profileId: "asc" }, { markedAt: "desc" }],
    include: {
      profile: {
        include: {
          user: {
            select: {
              id: true,
              discordUsername: true,
              discordDisplayName: true,
              displayAlias: true,
            },
          },
          currentRank: true,
          primaryUnit: true,
          primaryBillet: true,
        },
      },
    },
  });

  return {
    event,
    items: items.map((record) => ({
      id: record.id,
      eventId: record.eventId,
      profileId: record.profileId,
      status: record.status,
      rsvpStatus: record.rsvpStatus,
      markedById: record.markedById,
      markedAt: record.markedAt,
      overrideReason: record.overrideReason,
      originalStatus: record.originalStatus,
      notes: record.notes,
      member: displayUser(record.profile?.user),
      rank: record.profile?.currentRank?.abbreviation || "Unranked",
      unit: record.profile?.primaryUnit?.name || "Unassigned",
      billet: record.profile?.primaryBillet?.name || "Missing",
    })),
  };
}

export async function updateAttendanceRecord({
  actorUser,
  eventId,
  attendanceRecordId,
  status,
  rsvpStatus,
  notes,
  reason,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  if (!canManageEvents(actorUser)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }

  if (!attendanceStatuses.has(status)) {
    const error = new Error("Invalid attendance status.");
    error.statusCode = 400;
    throw error;
  }

  const cleanedReason = normalizeText(reason, 1000);
  if (!cleanedReason) {
    const error = new Error("Attendance overrides require an audit reason.");
    error.statusCode = 400;
    throw error;
  }

  const db = getDb();
  const record = await db.attendanceRecord.findFirst({
    where: {
      id: attendanceRecordId,
      eventId,
    },
    include: {
      profile: true,
    },
  });

  if (!record) {
    const error = new Error("Attendance record not found.");
    error.statusCode = 404;
    throw error;
  }

  await assertCanAccessPersonnelProfile(actorUser, record.profileId);

  await db.$transaction(async (tx) => {
    await tx.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: {
        status,
        rsvpStatus: normalizeText(rsvpStatus, 80) || null,
        notes: normalizeText(notes, 2000) || null,
        originalStatus: record.status,
        overrideReason: cleanedReason,
        markedById: actorUser?.id || null,
        markedAt: currentTimestamp(),
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        affectedProfileId: record.profileId,
        module: "Attendance",
        action: "Updated Attendance Record",
        oldValue: {
          status: record.status,
          rsvpStatus: record.rsvpStatus,
          notes: record.notes,
        },
        newValue: {
          status,
          rsvpStatus: normalizeText(rsvpStatus, 80) || null,
          notes: normalizeText(notes, 2000) || null,
        },
        reason: cleanedReason,
        relatedRecordId: attendanceRecordId,
        severity: status === "NoShow" || status === "Absent" ? "Warning" : "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });
  });

  const updated = await listAttendanceRecordsForEvent({ actorUser, eventId });
  return updated.items.find((item) => item.id === attendanceRecordId) || null;
}

export async function listBugReports({ actorUser, limit = 50 } = {}) {
  assertDatabaseReady();

  const canReadAll =
    actorUser?.permissions?.includes("system:admin") ||
    actorUser?.roles?.some((role) => ["staff", "command-staff", "system-admin"].includes(role));

  const records = await getDb().bugReport.findMany({
    where: canReadAll ? {} : { submittedById: actorUser?.id || "__no_user__" },
    take: limit,
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  return records.map((record) => ({
    id: record.id,
    title: record.title,
    category: record.category,
    severity: record.severity,
    status: record.status,
    summary: record.summary,
    description: record.description,
    submittedById: record.submittedById,
    assignedToId: record.assignedToId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
}

export async function submitBugReport({
  actorUser,
  title,
  category,
  severity,
  summary,
  description,
  ipSessionMetadata,
}) {
  assertDatabaseReady();

  const cleanedTitle = normalizeText(title, 160);
  const cleanedCategory = normalizeText(category, 80);
  const cleanedSeverity = normalizeText(severity, 40);
  const cleanedSummary = normalizeText(summary, 1000);
  const cleanedDescription = normalizeText(description, 4000);

  if (!cleanedTitle || !cleanedCategory || !cleanedSummary) {
    const error = new Error("Title, category, and summary are required for support submissions.");
    error.statusCode = 400;
    throw error;
  }

  const resolvedSeverity = supportSeverities.has(cleanedSeverity) ? cleanedSeverity : "Medium";
  const record = await getDb().$transaction(async (tx) => {
    const created = await tx.bugReport.create({
      data: {
        title: cleanedTitle,
        category: cleanedCategory,
        severity: resolvedSeverity,
        status: "Open",
        summary: cleanedSummary,
        description: cleanedDescription || null,
        submittedById: actorUser?.id,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actorUser?.id,
        module: "Support",
        action: "Submitted Bug Report",
        newValue: {
          title: cleanedTitle,
          category: cleanedCategory,
          severity: resolvedSeverity,
          status: "Open",
        },
        reason: "Portal support submission.",
        relatedRecordId: created.id,
        severity: resolvedSeverity === "Critical" ? "ActionRequired" : "Info",
        systemGenerated: false,
        ipSessionMetadata,
      },
    });

    return created;
  });

  return (await listBugReports({ actorUser, limit: 100 })).find((item) => item.id === record.id);
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
