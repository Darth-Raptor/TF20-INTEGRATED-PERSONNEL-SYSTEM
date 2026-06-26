import {
  EVENT_ATTENDANCE_SCOPE_OPTIONS,
  EVENT_LOCATION_OPTIONS,
  EVENT_TYPE_OPTIONS,
  normalizeCalendarMonth,
} from "../shared/events.mjs";

const EVENT_TYPE_IDS = new Set(EVENT_TYPE_OPTIONS.map((option) => option.id));
const EVENT_LOCATION_IDS = new Set(EVENT_LOCATION_OPTIONS.map((option) => option.id));
const EVENT_ATTENDANCE_SCOPE_IDS = new Set(
  EVENT_ATTENDANCE_SCOPE_OPTIONS.map((option) => option.id),
);
const VISIBLE_EVENT_STATUSES = new Set(["Scheduled", "Cancelled"]);
const DISCHARGED_PERSONNEL_STATUSES = new Set([
  "HonorableDischarge",
  "OtherThanHonorableDischarge",
  "DishonorableDischarge",
]);
const UNIT_SERVER_LOCK_NAME = "tf20:event:unit-server";

export function canViewOwnEvents(account) {
  return account?.status === "Active" && hasPermission(account, "events.view-self");
}

export function canManageScopedEvents(account) {
  return account?.status === "Active" && hasPermission(account, "events.manage-scoped");
}

export async function listEventsForMonth(prisma, actor, monthValue) {
  if (!canViewOwnEvents(actor)) {
    return failure("permission_denied", "Event view permission is required.");
  }

  const month = normalizeCalendarMonth(monthValue);
  const range = calendarQueryRange(month);
  const events = await prisma.event.findMany({
    where: {
      status: { in: [...VISIBLE_EVENT_STATUSES] },
      startsAt: { lt: range.end },
      endsAt: { gt: range.start },
    },
    orderBy: [{ startsAt: "asc" }, { title: "asc" }, { id: "asc" }],
    include: {
      sourceUnit: {
        select: {
          id: true,
          name: true,
          hierarchyBase: true,
        },
      },
    },
  });

  const scope = canManageScopedEvents(actor) ? await resolveEventManageScope(prisma, actor) : null;
  const manageableUnitIds = scope?.ok ? scope.rootUnitIds : new Set();

  return {
    ok: true,
    month,
    items: events.map((event) => ({
      ...event,
      permissions: {
        canManage: manageableUnitIds.has(event.sourceUnitId),
      },
    })),
  };
}

export async function getEventOptions(prisma, actor) {
  if (!canManageScopedEvents(actor)) {
    return failure("permission_denied", "Scoped event management permission is required.");
  }

  const scope = await resolveEventManageScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }

  return {
    ok: true,
    options: {
      eventTypes: EVENT_TYPE_OPTIONS,
      locations: EVENT_LOCATION_OPTIONS,
      attendanceScopes: EVENT_ATTENDANCE_SCOPE_OPTIONS,
      units: scope.rootUnits.map((unit) => ({
        id: unit.id,
        name: unit.name,
      })),
    },
  };
}

export async function getEventDetail(prisma, actor, eventId) {
  if (!canViewOwnEvents(actor)) {
    return failure("permission_denied", "Event view permission is required.");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      sourceUnit: {
        select: {
          id: true,
          name: true,
          hierarchyBase: true,
        },
      },
    },
  });

  if (!event || !VISIBLE_EVENT_STATUSES.has(event.status)) {
    return failure("not_found", "Event was not found.");
  }

  const [scope, profile, activeSignups] = await Promise.all([
    canManageScopedEvents(actor)
      ? resolveEventManageScope(prisma, actor)
      : Promise.resolve({ ok: true, rootUnitIds: new Set(), rootUnits: [] }),
    findPersonnelProfileForEvents(prisma, actor.id),
    prisma.eventAttendance.findMany({
      where: {
        eventId: event.id,
        status: "Expected",
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: {
        personnelProfile: {
          include: {
            currentRank: true,
            currentUnit: true,
          },
        },
      },
    }),
  ]);

  const canManage = scope.ok && scope.rootUnitIds.has(event.sourceUnitId);
  const currentSignup = profile
    ? await prisma.eventAttendance.findUnique({
        where: {
          eventId_personnelProfileId: {
            eventId: event.id,
            personnelProfileId: profile.id,
          },
        },
      })
    : null;
  const eligible = profile ? await isProfileEligibleForEvent(prisma, event, profile) : false;
  const mutable = event.status === "Scheduled" && event.startsAt > new Date();

  return {
    ok: true,
    event: {
      ...event,
      signupCount: activeSignups.length,
      signups: canManage
        ? activeSignups.map((signup) => ({
            ...signup,
            signedUpAt: signup.updatedAt ?? signup.createdAt,
          }))
        : [],
      currentUserSignupStatus: currentSignup?.status ?? null,
      currentUserEligible: eligible,
      permissions: {
        canManage,
        canEdit: canManage && mutable,
        canCancel: canManage && mutable,
        canSignup:
          Boolean(profile) &&
          eligible &&
          mutable &&
          currentSignup?.status !== "Expected" &&
          event.status === "Scheduled",
        canWithdraw:
          Boolean(profile) &&
          mutable &&
          currentSignup?.status === "Expected" &&
          event.status === "Scheduled",
      },
    },
  };
}

export async function createEvent({ prisma, actor, body }) {
  if (!canManageScopedEvents(actor)) {
    return failure("permission_denied", "Scoped event management permission is required.");
  }

  const scope = await resolveEventManageScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }

  const payload = normalizeEventPayload(body, { requireSourceUnitId: scope.rootUnits.length > 1 });
  if (!payload.ok) {
    return payload;
  }

  const sourceUnitId = payload.value.sourceUnitId ?? scope.rootUnits[0]?.id ?? null;
  if (!sourceUnitId || !scope.rootUnitIds.has(sourceUnitId)) {
    return failure("validation_error", "Select a manageable owning unit for the event.");
  }

  const conflict = await ensureUnitServerAvailability(prisma, null, payload.value, {
    sourceUnitId,
  });
  if (!conflict.ok) {
    return conflict;
  }

  const created = await prisma.event.create({
    data: {
      title: payload.value.title,
      eventType: payload.value.eventType,
      status: "Scheduled",
      rosterSource: "ManualAdjustment",
      sourceUnitId,
      startsAt: payload.value.startsAt,
      endsAt: payload.value.endsAt,
      location: payload.value.location,
      attendanceScope: payload.value.attendanceScope,
      details: payload.value.details,
      ownerAccountId: actor.id,
      createdByAccountId: actor.id,
    },
  });

  return getEventDetail(prisma, actor, created.id);
}

export async function updateEvent({ prisma, actor, eventId, body }) {
  if (!canManageScopedEvents(actor)) {
    return failure("permission_denied", "Scoped event management permission is required.");
  }

  const existing = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      sourceUnit: {
        select: { id: true, name: true },
      },
    },
  });
  if (!existing || !VISIBLE_EVENT_STATUSES.has(existing.status)) {
    return failure("not_found", "Event was not found.");
  }

  const scope = await resolveEventManageScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }
  if (!scope.rootUnitIds.has(existing.sourceUnitId)) {
    return failure("permission_denied", "This event is outside your staff event scope.");
  }
  if (existing.status !== "Scheduled" || existing.startsAt <= new Date()) {
    return failure("invalid_transition", "Only future scheduled events can be edited.");
  }

  const payload = normalizeEventPayload(body, { requireSourceUnitId: false });
  if (!payload.ok) {
    return payload;
  }
  if (payload.value.sourceUnitId && payload.value.sourceUnitId !== existing.sourceUnitId) {
    return failure("validation_error", "Owning unit cannot be changed after event creation.");
  }

  const activeSignups = await prisma.eventAttendance.findMany({
    where: {
      eventId,
      status: "Expected",
    },
    select: {
      personnelProfile: {
        select: {
          id: true,
          currentUnitId: true,
          status: true,
        },
      },
    },
  });
  if (
    payload.value.attendanceScope === "UnitOnly" &&
    !(await allSignupsEligibleForUnitScope(prisma, existing.sourceUnitId, activeSignups))
  ) {
    return failure(
      "validation_error",
      "This event cannot be restricted to unit-only attendance while out-of-scope signups remain.",
    );
  }

  const conflict = await ensureUnitServerAvailability(prisma, eventId, payload.value, {
    sourceUnitId: existing.sourceUnitId,
  });
  if (!conflict.ok) {
    return conflict;
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title: payload.value.title,
      eventType: payload.value.eventType,
      startsAt: payload.value.startsAt,
      endsAt: payload.value.endsAt,
      location: payload.value.location,
      attendanceScope: payload.value.attendanceScope,
      details: payload.value.details,
      ownerAccountId: actor.id,
    },
  });

  return getEventDetail(prisma, actor, eventId);
}

export async function cancelEvent({ prisma, actor, eventId }) {
  if (!canManageScopedEvents(actor)) {
    return failure("permission_denied", "Scoped event management permission is required.");
  }

  const existing = await prisma.event.findUnique({
    where: { id: eventId },
  });
  if (!existing || !VISIBLE_EVENT_STATUSES.has(existing.status)) {
    return failure("not_found", "Event was not found.");
  }

  const scope = await resolveEventManageScope(prisma, actor);
  if (!scope.ok) {
    return scope;
  }
  if (!scope.rootUnitIds.has(existing.sourceUnitId)) {
    return failure("permission_denied", "This event is outside your staff event scope.");
  }
  if (existing.status !== "Scheduled" || existing.startsAt <= new Date()) {
    return failure("invalid_transition", "Only future scheduled events can be cancelled.");
  }

  await prisma.event.update({
    where: { id: eventId },
    data: {
      status: "Cancelled",
    },
  });

  return getEventDetail(prisma, actor, eventId);
}

export async function signupForEvent({ prisma, actor, eventId }) {
  if (!canViewOwnEvents(actor)) {
    return failure("permission_denied", "Event view permission is required.");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });
  if (!event || !VISIBLE_EVENT_STATUSES.has(event.status)) {
    return failure("not_found", "Event was not found.");
  }
  if (event.status !== "Scheduled" || event.startsAt <= new Date()) {
    return failure("invalid_transition", "This event is no longer accepting signups.");
  }

  const profile = await findPersonnelProfileForEvents(prisma, actor.id);
  if (!profile) {
    return failure("permission_denied", "A personnel profile is required to sign up for events.");
  }

  const eligible = await isProfileEligibleForEvent(prisma, event, profile);
  if (!eligible) {
    return failure(
      "permission_denied",
      "You are not eligible to sign up for this event with your current unit assignment.",
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.eventAttendance.findUnique({
      where: {
        eventId_personnelProfileId: {
          eventId,
          personnelProfileId: profile.id,
        },
      },
    });

    if (existing?.status === "Expected") {
      return failure("invalid_transition", "You are already signed up for this event.");
    }

    if (existing) {
      await tx.eventAttendance.update({
        where: { id: existing.id },
        data: {
          status: "Expected",
          expectedSource: null,
          reviewerAccountId: null,
          reviewedAt: null,
          correctedByAccountId: null,
          correctedAt: null,
          correctionReason: null,
          notes: null,
        },
      });
      return { ok: true };
    }

    await tx.eventAttendance.create({
      data: {
        eventId,
        personnelProfileId: profile.id,
        status: "Expected",
      },
    });
    return { ok: true };
  });

  if (!updated.ok) {
    return updated;
  }

  return getEventDetail(prisma, actor, eventId);
}

export async function withdrawFromEvent({ prisma, actor, eventId }) {
  if (!canViewOwnEvents(actor)) {
    return failure("permission_denied", "Event view permission is required.");
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });
  if (!event || !VISIBLE_EVENT_STATUSES.has(event.status)) {
    return failure("not_found", "Event was not found.");
  }
  if (event.status !== "Scheduled" || event.startsAt <= new Date()) {
    return failure("invalid_transition", "This event is no longer accepting RSVP changes.");
  }

  const profile = await findPersonnelProfileForEvents(prisma, actor.id);
  if (!profile) {
    return failure("permission_denied", "A personnel profile is required to withdraw from events.");
  }

  const updated = await prisma.eventAttendance.findUnique({
    where: {
      eventId_personnelProfileId: {
        eventId,
        personnelProfileId: profile.id,
      },
    },
  });
  if (!updated || updated.status !== "Expected") {
    return failure("invalid_transition", "You are not currently signed up for this event.");
  }

  await prisma.eventAttendance.update({
    where: { id: updated.id },
    data: {
      status: "NotRequired",
    },
  });

  return getEventDetail(prisma, actor, eventId);
}

function normalizeEventPayload(body, { requireSourceUnitId }) {
  const title = normalizeText(body?.title);
  const eventType = normalizeText(body?.eventType);
  const location = normalizeText(body?.location);
  const attendanceScope = normalizeText(body?.attendanceScope);
  const sourceUnitId = normalizeText(body?.sourceUnitId);
  const startsAt = normalizeDateTime(body?.startsAt);
  const endsAt = normalizeDateTime(body?.endsAt);
  const details = normalizeOptionalText(body?.details);
  const errors = [];

  if (!title) {
    errors.push("Event name is required.");
  }
  if (!EVENT_TYPE_IDS.has(eventType)) {
    errors.push("Event type is invalid.");
  }
  if (!EVENT_LOCATION_IDS.has(location)) {
    errors.push("Event location is invalid.");
  }
  if (!EVENT_ATTENDANCE_SCOPE_IDS.has(attendanceScope)) {
    errors.push("Attendance restriction is invalid.");
  }
  if (requireSourceUnitId && !sourceUnitId) {
    errors.push("Owning unit is required.");
  }
  if (!startsAt) {
    errors.push("Start date and time are required.");
  }
  if (!endsAt) {
    errors.push("Estimated end date and time are required.");
  }
  if (startsAt && endsAt && startsAt >= endsAt) {
    errors.push("Estimated end time must be after the event start.");
  }
  if (!details) {
    errors.push("Event description is required.");
  }

  if (errors.length) {
    return failure("validation_error", errors.join(" "));
  }

  return {
    ok: true,
    value: {
      title,
      eventType,
      location,
      attendanceScope,
      sourceUnitId: sourceUnitId || null,
      startsAt,
      endsAt,
      details,
    },
  };
}

async function resolveEventManageScope(prisma, actor) {
  if (!canManageScopedEvents(actor)) {
    return failure("permission_denied", "Scoped event management permission is required.");
  }

  const units = await prisma.unit.findMany({
    where: { status: "Active" },
    orderBy: [{ hierarchyBase: "desc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      parentId: true,
      hierarchyBase: true,
    },
  });
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));

  const assignments = (actor.roleAssignments ?? []).filter(
    (assignment) =>
      isActiveRoleAssignment(assignment) &&
      assignment.role?.status === "Active" &&
      grantsEventScope(assignment.role) &&
      (assignment.scopeType !== "Unit" || assignment.unitId),
  );

  if (
    assignments.some((assignment) => assignment.scopeType === "Global") ||
    assignments.some((assignment) => assignment.scopeType === "StaffSection")
  ) {
    const rootUnits = units.filter((unit) => unit.hierarchyBase === 7000);
    return {
      ok: true,
      rootUnits,
      rootUnitIds: new Set(rootUnits.map((unit) => unit.id)),
      unitsById,
    };
  }

  const rootIds = assignments
    .map((assignment) => findNearestHierarchyRootId(assignment.unitId, unitsById))
    .filter(Boolean);
  const uniqueRootIds = [...new Set(rootIds)];
  const rootUnits = uniqueRootIds.map((id) => unitsById.get(id)).filter(Boolean);

  if (!rootUnits.length) {
    return failure("permission_denied", "No event scope is assigned to this account.");
  }

  return {
    ok: true,
    rootUnits,
    rootUnitIds: new Set(rootUnits.map((unit) => unit.id)),
    unitsById,
  };
}

async function ensureUnitServerAvailability(prisma, eventId, payload, { sourceUnitId }) {
  if (payload.location !== "UnitServer") {
    return { ok: true };
  }

  const result = await prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw`SELECT GET_LOCK(${UNIT_SERVER_LOCK_NAME}, 5) AS acquired`;
    if (Number(lock?.acquired ?? 0) !== 1) {
      return failure(
        "validation_error",
        "The unit server schedule is busy. Please try submitting the event again.",
      );
    }

    try {
      const conflict = await tx.event.findFirst({
        where: {
          id: eventId ? { not: eventId } : undefined,
          location: "UnitServer",
          status: {
            notIn: ["Cancelled", "Archived"],
          },
          startsAt: { lt: payload.endsAt },
          endsAt: { gt: payload.startsAt },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          sourceUnitId: true,
        },
      });

      if (conflict) {
        return failure(
          "validation_error",
          "The Unit Server is already reserved during that time window. Choose another time.",
        );
      }

      const unit = await tx.unit.findUnique({
        where: { id: sourceUnitId },
        select: { id: true },
      });
      if (!unit) {
        return failure("validation_error", "Selected owning unit is invalid.");
      }

      return { ok: true };
    } finally {
      await tx.$queryRaw`SELECT RELEASE_LOCK(${UNIT_SERVER_LOCK_NAME})`;
    }
  });

  return result;
}

async function isProfileEligibleForEvent(prisma, event, profile) {
  if (!profile || DISCHARGED_PERSONNEL_STATUSES.has(profile.status)) {
    return false;
  }

  if (event.attendanceScope === "Open") {
    return true;
  }
  if (!profile.currentUnitId) {
    return false;
  }

  const descendantIds = await collectUnitDescendantIds(prisma, event.sourceUnitId);
  return descendantIds.has(profile.currentUnitId);
}

async function allSignupsEligibleForUnitScope(prisma, sourceUnitId, activeSignups) {
  const allowedUnitIds = await collectUnitDescendantIds(prisma, sourceUnitId);
  return activeSignups.every((entry) =>
    Boolean(
      entry.personnelProfile?.currentUnitId &&
      allowedUnitIds.has(entry.personnelProfile.currentUnitId),
    ),
  );
}

async function collectUnitDescendantIds(prisma, sourceUnitId) {
  const units = await prisma.unit.findMany({
    where: { status: "Active" },
    select: { id: true, parentId: true },
  });
  const childrenByParentId = new Map();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const children = childrenByParentId.get(unit.parentId) ?? [];
    children.push(unit);
    childrenByParentId.set(unit.parentId, children);
  }

  const ids = new Set([sourceUnitId]);
  const stack = [...(childrenByParentId.get(sourceUnitId) ?? [])];
  while (stack.length) {
    const next = stack.pop();
    ids.add(next.id);
    stack.push(...(childrenByParentId.get(next.id) ?? []));
  }

  return ids;
}

async function findPersonnelProfileForEvents(prisma, accountId) {
  return prisma.personnelProfile.findUnique({
    where: { accountId },
    select: {
      id: true,
      status: true,
      currentUnitId: true,
    },
  });
}

function calendarQueryRange(monthKey) {
  const [year, month] = normalizeCalendarMonth(monthKey).split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 42);
  return { start, end };
}

function findNearestHierarchyRootId(unitId, unitsById) {
  let current = unitId ? unitsById.get(unitId) : null;
  while (current) {
    if (current.hierarchyBase === 7000) {
      return current.id;
    }
    current = current.parentId ? unitsById.get(current.parentId) : null;
  }
  return null;
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

function normalizeDateTime(value) {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
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

function grantsEventScope(role) {
  return role?.key === "unit-staff" || role?.key === "command-staff";
}

function failure(code, message) {
  return { ok: false, code, message };
}
