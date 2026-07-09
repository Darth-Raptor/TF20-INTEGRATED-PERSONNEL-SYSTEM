import { comparePersonNamesByLastName } from "../shared/person-name-sort.mjs";

const TRAINING_OUTCOMES = ["Pass", "Fail"];

export function canViewTraining(account) {
  return (
    account?.status === "Active" &&
    (hasPermission(account, "training.view-scoped") ||
      hasPermission(account, "training.record-scoped"))
  );
}

export function canRecordTraining(account) {
  return account?.status === "Active" && hasPermission(account, "training.record-scoped");
}

export function validateTrainingSessionPayload(body) {
  const errors = [];
  const courseId = normalizeText(body?.courseId);
  const completedAt = normalizeTrainingDate(body?.completedAt);
  const notes = normalizeOptionalText(body?.notes);
  const attendees = Array.isArray(body?.attendees) ? body.attendees : [];
  const normalizedAttendees = [];
  const seenPersonnelIds = new Set();

  if (!courseId) {
    errors.push("Course is required.");
  }
  if (!completedAt) {
    errors.push("Completion date is required.");
  }
  if (!attendees.length) {
    errors.push("At least one attendee is required.");
  }

  attendees.forEach((attendee, index) => {
    const rowNumber = index + 1;
    const personnelProfileId = normalizeText(attendee?.personnelProfileId);
    const outcome = normalizeTrainingOutcome(attendee);
    const attendeeNotes = normalizeOptionalText(attendee?.notes);

    if (!personnelProfileId) {
      errors.push(`Attendee ${rowNumber} requires a personnel record.`);
    } else if (seenPersonnelIds.has(personnelProfileId)) {
      errors.push(`Attendee ${rowNumber} duplicates another attendee.`);
    } else {
      seenPersonnelIds.add(personnelProfileId);
    }

    if (!outcome.ok) {
      errors.push(`Attendee ${rowNumber} must have exactly one outcome: Pass or Fail.`);
    }

    if (personnelProfileId && outcome.ok) {
      normalizedAttendees.push({
        personnelProfileId,
        outcome: outcome.value,
        notes: attendeeNotes,
      });
    }
  });

  if (errors.length) {
    return failure("validation_error", errors.join(" "));
  }

  return {
    ok: true,
    value: {
      courseId,
      completedAt,
      notes,
      attendees: normalizedAttendees,
    },
  };
}

export async function getTrainingOptions(prisma, actor) {
  if (!canRecordTraining(actor)) {
    return failure("permission_denied", "Training record permission is required.");
  }

  const [courses, personnel] = await Promise.all([
    prisma.trainingCourse.findMany({
      where: { status: "Active" },
      orderBy: [{ name: "asc" }],
      include: {
        qualifications: {
          include: { qualification: true },
        },
      },
    }),
    prisma.personnelProfile.findMany({
      where: { status: "Active" },
      include: {
        currentRank: true,
        currentUnit: true,
      },
    }),
  ]);

  return {
    ok: true,
    options: {
      courses,
      personnel: sortProfilesByLastName(personnel),
    },
  };
}

export async function listTrainingSessions(prisma, actor) {
  if (!canViewTraining(actor)) {
    return failure("permission_denied", "Training view permission is required.");
  }

  const sessions = await prisma.trainingSession.findMany({
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      course: true,
      records: {
        where: { status: "Completed" },
        include: {
          personnelProfile: {
            include: {
              currentRank: true,
              currentUnit: true,
            },
          },
        },
      },
    },
  });

  return {
    ok: true,
    items: await hydrateSessionAccounts(prisma, sessions, actor),
  };
}

export async function getTrainingSession(prisma, actor, sessionId) {
  if (!canViewTraining(actor)) {
    return failure("permission_denied", "Training view permission is required.");
  }

  const session = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      course: {
        include: {
          qualifications: {
            include: { qualification: true },
          },
        },
      },
      records: {
        where: { status: "Completed" },
        include: {
          personnelProfile: {
            include: {
              currentRank: true,
              currentUnit: true,
            },
          },
          course: true,
        },
      },
    },
  });

  if (!session) {
    return failure("not_found", "Training session was not found.");
  }

  const [hydrated] = await hydrateSessionAccounts(prisma, [session], actor);
  return { ok: true, session: hydrated };
}

export async function createTrainingSession({ prisma, actor, body }) {
  if (!canRecordTraining(actor)) {
    return failure("permission_denied", "Training record permission is required.");
  }

  const payload = validateTrainingSessionPayload(body);
  if (!payload.ok) {
    return payload;
  }

  const ready = await validateTrainingCatalogRecords(prisma, payload.value);
  if (!ready.ok) {
    return ready;
  }

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.trainingSession.create({
      data: {
        courseId: payload.value.courseId,
        completedAt: payload.value.completedAt,
        recordedByAccountId: actor.id,
        instructorAccountId: actor.id,
        notes: payload.value.notes,
      },
    });

    await createTrainingRecordsAndGrants({
      tx,
      actor,
      course: ready.course,
      session: created,
      payload: payload.value,
    });

    return created;
  });

  return getTrainingSession(prisma, actor, session.id);
}

export async function updateTrainingSession({ prisma, actor, sessionId, body }) {
  if (!canRecordTraining(actor)) {
    return failure("permission_denied", "Training record permission is required.");
  }

  const existing = await prisma.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      records: {
        where: { status: "Completed" },
        select: { id: true },
      },
    },
  });

  if (!existing) {
    return failure("not_found", "Training session was not found.");
  }
  if (existing.recordedByAccountId !== actor.id) {
    return failure("permission_denied", "Only the trainer who recorded this session can edit it.");
  }

  const payload = validateTrainingSessionPayload(body);
  if (!payload.ok) {
    return payload;
  }

  const ready = await validateTrainingCatalogRecords(prisma, payload.value);
  if (!ready.ok) {
    return ready;
  }

  await prisma.$transaction(async (tx) => {
    const oldRecordIds = existing.records.map((record) => record.id);

    if (oldRecordIds.length) {
      await revokeTrainingRecordQualificationGrants({
        tx,
        actor,
        trainingRecordIds: oldRecordIds,
      });
      await tx.trainingRecord.updateMany({
        where: { id: { in: oldRecordIds } },
        data: {
          status: "Voided",
        },
      });
    }

    const session = await tx.trainingSession.update({
      where: { id: sessionId },
      data: {
        courseId: payload.value.courseId,
        completedAt: payload.value.completedAt,
        notes: payload.value.notes,
        instructorAccountId: actor.id,
      },
    });

    await createTrainingRecordsAndGrants({
      tx,
      actor,
      course: ready.course,
      session,
      payload: payload.value,
    });
  });

  return getTrainingSession(prisma, actor, sessionId);
}

export async function listOwnTrainingRecords(prisma, actor) {
  if (actor?.status !== "Active") {
    return failure("permission_denied", "Active member status is required.");
  }

  const profile = await prisma.personnelProfile.findUnique({
    where: { accountId: actor.id },
    select: { id: true },
  });

  if (!profile) {
    return failure("not_found", "Personnel profile was not found.");
  }

  const records = await prisma.trainingRecord.findMany({
    where: {
      personnelProfileId: profile.id,
      status: "Completed",
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
    include: {
      course: true,
      session: {
        include: {
          course: true,
        },
      },
    },
  });

  return {
    ok: true,
    items: await hydrateRecordAccounts(prisma, records),
  };
}

async function validateTrainingCatalogRecords(prisma, payload) {
  const course = await prisma.trainingCourse.findFirst({
    where: { id: payload.courseId, status: "Active" },
    include: {
      qualifications: {
        include: { qualification: true },
      },
    },
  });

  if (!course) {
    return failure("validation_error", "Selected training course is invalid.");
  }

  const personnelIds = payload.attendees.map((attendee) => attendee.personnelProfileId);
  const personnel = await prisma.personnelProfile.findMany({
    where: {
      id: { in: personnelIds },
      status: "Active",
    },
    select: { id: true },
  });
  const activePersonnelIds = new Set(personnel.map((profile) => profile.id));
  const missingPersonnel = personnelIds.filter((id) => !activePersonnelIds.has(id));

  if (missingPersonnel.length) {
    return failure("validation_error", "All attendees must be active personnel records.");
  }

  return { ok: true, course };
}

async function createTrainingRecordsAndGrants({ tx, actor, course, session, payload }) {
  for (const attendee of payload.attendees) {
    const record = await tx.trainingRecord.create({
      data: {
        sessionId: session.id,
        personnelProfileId: attendee.personnelProfileId,
        courseId: payload.courseId,
        status: "Completed",
        outcome: attendee.outcome,
        recordedByAccountId: actor.id,
        instructorAccountId: actor.id,
        completedAt: payload.completedAt,
        notes: attendee.notes,
      },
    });

    if (attendee.outcome === "Pass") {
      await grantCourseQualifications({
        tx,
        actor,
        course,
        trainingRecord: record,
        completedAt: payload.completedAt,
      });
    }
  }
}

async function grantCourseQualifications({ tx, actor, course, trainingRecord, completedAt }) {
  const activeQualifications = (course.qualifications ?? [])
    .map((entry) => entry.qualification)
    .filter((qualification) => qualification?.status === "Active");

  for (const qualification of activeQualifications) {
    const expiresAt = qualification.expiresAfterDays
      ? addDays(completedAt, qualification.expiresAfterDays)
      : null;
    await tx.personnelQualification.upsert({
      where: {
        personnelProfileId_qualificationId: {
          personnelProfileId: trainingRecord.personnelProfileId,
          qualificationId: qualification.id,
        },
      },
      update: {
        status: "Active",
        grantedAt: completedAt,
        expiresAt,
        grantedByAccountId: actor.id,
        changedByAccountId: actor.id,
        trainingRecordId: trainingRecord.id,
        evidence: `Granted by training course: ${course.name}`,
        notes: null,
      },
      create: {
        personnelProfileId: trainingRecord.personnelProfileId,
        qualificationId: qualification.id,
        status: "Active",
        grantedAt: completedAt,
        expiresAt,
        grantedByAccountId: actor.id,
        changedByAccountId: actor.id,
        trainingRecordId: trainingRecord.id,
        evidence: `Granted by training course: ${course.name}`,
      },
    });
  }
}

async function revokeTrainingRecordQualificationGrants({ tx, actor, trainingRecordIds }) {
  await tx.personnelQualification.updateMany({
    where: {
      trainingRecordId: { in: trainingRecordIds },
      status: { in: ["Recommended", "Pending", "Active", "Waived"] },
    },
    data: {
      status: "Revoked",
      changedByAccountId: actor.id,
      notes: "Revoked because the source training record was corrected.",
    },
  });
}

async function hydrateSessionAccounts(prisma, sessions, actor) {
  const accountMap = await loadAccountMap(
    prisma,
    sessions.flatMap((session) => [
      session.recordedByAccountId,
      session.instructorAccountId,
      ...(session.records ?? []).flatMap((record) => [
        record.recordedByAccountId,
        record.instructorAccountId,
      ]),
    ]),
  );

  return sessions.map((session) => ({
    ...session,
    recordedByAccount: accountMap.get(session.recordedByAccountId) ?? null,
    instructorAccount: accountMap.get(session.instructorAccountId) ?? null,
    permissions: {
      canEdit: canRecordTraining(actor) && session.recordedByAccountId === actor.id,
    },
    summary: summarizeTrainingRecords(session.records ?? []),
    records: sortTrainingRecordsByLastName(
      (session.records ?? []).map((record) => ({
        ...record,
        recordedByAccount: accountMap.get(record.recordedByAccountId) ?? null,
        instructorAccount: accountMap.get(record.instructorAccountId) ?? null,
      })),
    ),
  }));
}

async function hydrateRecordAccounts(prisma, records) {
  const accountMap = await loadAccountMap(
    prisma,
    records.flatMap((record) => [record.recordedByAccountId, record.instructorAccountId]),
  );

  return records.map((record) => ({
    ...record,
    recordedByAccount: accountMap.get(record.recordedByAccountId) ?? null,
    instructorAccount: accountMap.get(record.instructorAccountId) ?? null,
  }));
}

async function loadAccountMap(prisma, accountIds) {
  const ids = [...new Set((accountIds ?? []).filter(Boolean))];
  if (!ids.length) {
    return new Map();
  }

  const accounts = await prisma.account.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      displayName: true,
      email: true,
      authIdentities: {
        select: {
          displayName: true,
          username: true,
        },
        take: 1,
      },
    },
  });

  return new Map(accounts.map((account) => [account.id, account]));
}

function summarizeTrainingRecords(records) {
  const summary = { total: 0, passed: 0, failed: 0 };
  for (const record of records) {
    summary.total += 1;
    if (record.outcome === "Pass") {
      summary.passed += 1;
    } else if (record.outcome === "Fail") {
      summary.failed += 1;
    }
  }
  return summary;
}

function sortProfilesByLastName(profiles) {
  return [...profiles].sort(
    (left, right) =>
      comparePersonNamesByLastName(left?.name, right?.name) ||
      String(left?.id ?? "").localeCompare(String(right?.id ?? "")),
  );
}

function sortTrainingRecordsByLastName(records) {
  return [...records].sort(
    (left, right) =>
      comparePersonNamesByLastName(left?.personnelProfile?.name, right?.personnelProfile?.name) ||
      String(left?.id ?? "").localeCompare(String(right?.id ?? "")),
  );
}

function normalizeTrainingOutcome(attendee) {
  const explicit = normalizeText(attendee?.outcome);
  const pass = parseBooleanLike(attendee?.pass);
  const fail = parseBooleanLike(attendee?.fail);

  if (pass === true && fail === true) {
    return { ok: false };
  }
  if (explicit) {
    return TRAINING_OUTCOMES.includes(explicit) ? { ok: true, value: explicit } : { ok: false };
  }
  if (pass === true) {
    return { ok: true, value: "Pass" };
  }
  if (fail === true) {
    return { ok: true, value: "Fail" };
  }
  return { ok: false };
}

function normalizeTrainingDate(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00.000Z`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text || null;
}

function parseBooleanLike(value) {
  if (value === true || value === "true" || value === "1" || value === 1 || value === "on") {
    return true;
  }
  if (value === false || value === "false" || value === "0" || value === 0) {
    return false;
  }
  return null;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function hasPermission(account, permissionKey) {
  return (account?.roleAssignments ?? []).some(
    (assignment) =>
      isActiveRoleAssignment(assignment) &&
      (assignment.role?.permissions ?? []).some(
        (grant) => grant.permission?.status === "Active" && grant.permission?.key === permissionKey,
      ),
  );
}

function isActiveRoleAssignment(assignment) {
  return !assignment.endsAt && assignment.role?.status === "Active";
}

function failure(code, message) {
  return { ok: false, code, message };
}
