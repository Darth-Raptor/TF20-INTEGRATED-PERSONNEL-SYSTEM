function hasPermission(account, permissionKey) {
  return (account.roleAssignments ?? []).some((assignment) =>
    !assignment.endsAt &&
    (assignment.role?.permissions ?? []).some((grant) => grant.permission?.key === permissionKey),
  );
}

function isHtmlRequest(req) {
  const contentType = req.headers["content-type"] ?? "";
  const accepts = req.headers.accept ?? "";
  return contentType.includes("application/x-www-form-urlencoded") || accepts.includes("text/html");
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTargetUnitId(value) {
  const text = normalizeText(value);
  return text || null;
}

function buildApplicantAnswerDefinitions() {
  return [
    { key: "preferred-callsign", label: "Preferred name", section: "Identity", order: 10 },
    { key: "age", label: "Age", section: "Basics", order: 20 },
    { key: "timezone", label: "Timezone", section: "Basics", order: 30 },
    { key: "availability", label: "Availability", section: "Availability", order: 40 },
    { key: "experience", label: "Relevant experience", section: "Experience", order: 50 },
    { key: "motivation", label: "Why do you want to join TF20?", section: "Motivation", order: 60 },
  ];
}

export function canCreateOwnApplication(account) {
  return account.status === "Pending" && hasPermission(account, "applications.create-self");
}

export function canViewOwnApplication(account) {
  return hasPermission(account, "applications.view-self");
}

export function canRecruiterReview(account) {
  return hasPermission(account, "applications.review-recruiter");
}

export function canTargetUnitReview(account) {
  return hasPermission(account, "applications.review-target-unit");
}

export function canReviewApplicationRecord(account, application) {
  if (canRecruiterReview(account)) return true;
  if (!canTargetUnitReview(account)) return false;
  return isUnitInActorScope(account, application.targetUnitId) || hasGlobalReviewOverride(account);
}

export async function getApplicationUnits(prisma) {
  return prisma.unit.findMany({
    where: { status: "Active" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true },
  });
}

export async function getOwnApplication(prisma, accountId) {
  return prisma.application.findFirst({
    where: { accountId },
    orderBy: [{ createdAt: "desc" }],
    include: applicationInclude(),
  });
}

export async function getApplicationById(prisma, applicationId) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: applicationInclude(),
  });
}

export async function listReviewQueue(prisma, account) {
  const recruiter = canRecruiterReview(account);
  const targetUnitReviewer = canTargetUnitReview(account);
  if (!recruiter && !targetUnitReviewer) return [];

  const scopedUnitIds = recruiter ? [] : activeUnitScopeIds(account);
  const where = recruiter && targetUnitReviewer
    ? {
        OR: [
          { status: "Submitted" },
          { status: { in: ["RecruiterRecommended", "TargetUnitReview"] } },
        ],
      }
    : recruiter
      ? { status: "Submitted" }
      : {
          status: { in: ["RecruiterRecommended", "TargetUnitReview"] },
          targetUnitId: { in: scopedUnitIds },
        };

  return prisma.application.findMany({
    where,
    orderBy: [{ submittedAt: "asc" }],
    include: applicationInclude(),
  });
}

export async function createOrResumeOwnApplication({ prisma, account, body }) {
  if (!canCreateOwnApplication(account)) {
    return failure("permission_denied", "Your account cannot create an application.");
  }

  const currentAccount = await prisma.account.findUnique({
    where: { id: account.id },
    include: { personnelProfile: true },
  });

  if (currentAccount?.personnelProfile) {
    return failure("already_converted", "This account already has a personnel profile.");
  }

  const activeExisting = await prisma.application.findFirst({
    where: {
      accountId: account.id,
      status: { in: ["Submitted", "RecruiterScreening", "RecruiterRecommended", "TargetUnitReview"] },
    },
    include: applicationInclude(),
    orderBy: { createdAt: "desc" },
  });

  if (activeExisting) {
    return { ok: true, created: false, application: activeExisting };
  }

  const targetUnitId = parseTargetUnitId(body.targetUnitId);
  if (!targetUnitId) {
    return failure("validation_error", "Target unit is required.");
  }

  const unit = await prisma.unit.findFirst({
    where: { id: targetUnitId, status: "Active" },
    select: { id: true },
  });

  if (!unit) {
    return failure("validation_error", "Selected target unit is invalid.");
  }

  const answers = buildApplicantAnswers(body);
  const application = await prisma.$transaction(async (tx) => {
    const created = await tx.application.create({
      data: {
        accountId: account.id,
        targetUnitId,
        status: "Submitted",
        formVersion: "applicant-v1",
        answers: {
          create: answers,
        },
        statusHistory: {
          create: {
            oldStatus: null,
            newStatus: "Submitted",
            stage: "RecruiterScreening",
            changedByAccountId: account.id,
            reason: "Pending user submitted enlistment application.",
            permissionContext: {
              actorAccountId: account.id,
              actorStatus: account.status,
            },
          },
        },
      },
      include: applicationInclude(),
    });

    await tx.auditLog.create({
      data: {
        actorAccountId: account.id,
        targetAccountId: account.id,
        module: "applications",
        action: "submit-self",
        recordType: "Application",
        recordId: created.id,
        newValue: {
          status: created.status,
          targetUnitId: created.targetUnitId,
        },
        reason: "Pending user submitted their own application.",
      },
    });

    await tx.notification.create({
      data: {
        accountId: account.id,
        category: "applications",
        workflowEvent: "application-submitted",
        title: "Application submitted",
        body: "Your enlistment application was submitted and is awaiting recruiter screening.",
        relatedRecordType: "Application",
        relatedRecordId: created.id,
      },
    });

    return created;
  });

  return { ok: true, created: true, application };
}

export async function recommendApplication({ prisma, actor, applicationId, reason, noteBody }) {
  if (!canRecruiterReview(actor)) {
    return failure("permission_denied", "Recruiter review permission is required.");
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: applicationInclude(),
  });

  if (!application) {
    return failure("not_found", "Application was not found.");
  }

  if (!["Submitted", "RecruiterScreening"].includes(application.status)) {
    return failure("invalid_transition", "Application is not in recruiter screening.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "RecruiterRecommended",
        recruiterRecommendedByAccountId: actor.id,
        recruiterRecommendedAt: new Date(),
        updatedAt: new Date(),
      },
      include: applicationInclude(),
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId,
        oldStatus: application.status,
        newStatus: "RecruiterRecommended",
        stage: "RecruiterScreening",
        changedByAccountId: actor.id,
        reason,
        permissionContext: {
          actorAccountId: actor.id,
          action: "recommend",
        },
      },
    });

    if (noteBody) {
      await tx.applicationReviewNote.create({
        data: {
          applicationId,
          authorAccountId: actor.id,
          stage: "RecruiterScreening",
          body: noteBody,
          visibility: "Staff",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: application.accountId,
        module: "applications",
        action: "recommend",
        recordType: "Application",
        recordId: applicationId,
        oldValue: { status: application.status },
        newValue: { status: "RecruiterRecommended" },
        reason,
      },
    });

    await tx.notification.create({
      data: {
        accountId: application.accountId,
        category: "applications",
        workflowEvent: "recruiter-recommended",
        title: "Application advanced",
        body: "Your application passed recruiter screening and moved to target-unit review.",
        relatedRecordType: "Application",
        relatedRecordId: applicationId,
      },
    });

    return updated;
  });

  return { ok: true, application: result };
}

export async function assignApplicationUnit({ prisma, actor, applicationId, targetUnitId, reason }) {
  if (!canRecruiterReview(actor) && !canTargetUnitReview(actor)) {
    return failure("permission_denied", "Application reassignment requires reviewer permission.");
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: applicationInclude(),
  });
  if (!application) {
    return failure("not_found", "Application was not found.");
  }

  if (!["Submitted", "RecruiterScreening", "RecruiterRecommended", "TargetUnitReview"].includes(application.status)) {
    return failure("invalid_transition", "Application can no longer be reassigned.");
  }

  const unit = await prisma.unit.findFirst({
    where: { id: targetUnitId, status: "Active" },
    select: { id: true },
  });
  if (!unit) {
    return failure("validation_error", "Selected target unit is invalid.");
  }

  if (canTargetUnitReview(actor) && !canRecruiterReview(actor) && !isUnitInActorScope(actor, targetUnitId)) {
    return failure("permission_denied", "Target-unit scope does not include the requested unit.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        targetUnitId,
        status: "TargetUnitReview",
      },
      include: applicationInclude(),
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId,
        oldStatus: application.status,
        newStatus: "TargetUnitReview",
        stage: "TargetUnitReview",
        changedByAccountId: actor.id,
        reason,
        permissionContext: {
          actorAccountId: actor.id,
          action: "assign-unit",
          targetUnitId,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: application.accountId,
        module: "applications",
        action: "assign-unit",
        recordType: "Application",
        recordId: applicationId,
        oldValue: { targetUnitId: application.targetUnitId, status: application.status },
        newValue: { targetUnitId, status: "TargetUnitReview" },
        reason,
      },
    });

    await tx.notification.create({
      data: {
        accountId: application.accountId,
        category: "applications",
        workflowEvent: "application-target-unit-updated",
        title: "Application target updated",
        body: "Your application target unit was updated and is now in target-unit review.",
        relatedRecordType: "Application",
        relatedRecordId: applicationId,
      },
    });

    return updated;
  });

  return { ok: true, application: result };
}

export async function acceptApplication({ prisma, actor, applicationId, reason, noteBody }) {
  if (!canTargetUnitReview(actor)) {
    return failure("permission_denied", "Target-unit review permission is required.");
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: applicationInclude(),
  });
  if (!application) {
    return failure("not_found", "Application was not found.");
  }

  if (!["RecruiterRecommended", "TargetUnitReview"].includes(application.status)) {
    return failure("invalid_transition", "Application is not ready for acceptance.");
  }

  if (!isUnitInActorScope(actor, application.targetUnitId) && !hasGlobalReviewOverride(actor)) {
    return failure("permission_denied", "Reviewer does not have target-unit authority for this application.");
  }

  if (application.account.status !== "Pending") {
    return failure("invalid_transition", "Only pending accounts can be accepted.");
  }

  if (application.account.personnelProfile) {
    return failure("invalid_transition", "This account already has a personnel profile.");
  }

  const memberRole = await prisma.role.findUnique({ where: { key: "member" } });
  if (!memberRole) {
    return failure("configuration_error", "Member role is missing from the seeded catalog.");
  }

  const preferredCallsign = firstAnswer(application, "preferred-callsign") ||
    application.account.displayName ||
    application.account.authIdentities.find((identity) => identity.provider === "Discord")?.displayName ||
    application.account.authIdentities.find((identity) => identity.provider === "Discord")?.username ||
    `TF20-${application.account.id.slice(-6)}`;

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const accepted = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "Accepted",
        unitDecisionByAccountId: actor.id,
        unitDecisionAt: now,
        decidedAt: now,
      },
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId,
        oldStatus: application.status,
        newStatus: "Accepted",
        stage: "FinalDecision",
        changedByAccountId: actor.id,
        reason,
        permissionContext: {
          actorAccountId: actor.id,
          action: "accept",
          targetUnitId: application.targetUnitId,
        },
      },
    });

    const profile = await tx.personnelProfile.create({
      data: {
        accountId: application.accountId,
        callsign: preferredCallsign,
        status: "Recruit",
        currentUnitId: application.targetUnitId,
        goodStanding: true,
        joinedAt: now,
        acceptedAt: now,
        createdByAccountId: actor.id,
      },
    });

    await tx.personnelStatusHistory.create({
      data: {
        personnelProfileId: profile.id,
        oldStatus: null,
        newStatus: "Recruit",
        changedByAccountId: actor.id,
        reason: "Created personnel profile from accepted application.",
      },
    });

    await tx.account.update({
      where: { id: application.accountId },
      data: {
        status: "Active",
        activatedAt: now,
        statusReason: "Activated through accepted application.",
      },
    });

    await tx.roleAssignment.updateMany({
      where: {
        accountId: application.accountId,
        endsAt: null,
        role: { key: "pending-user" },
      },
      data: {
        endsAt: now,
        reason: "Pending-user role ended after application acceptance.",
      },
    });

    const existingMemberRole = await tx.roleAssignment.findFirst({
      where: {
        accountId: application.accountId,
        roleId: memberRole.id,
        endsAt: null,
      },
    });
    if (!existingMemberRole) {
      await tx.roleAssignment.create({
        data: {
          accountId: application.accountId,
          roleId: memberRole.id,
          scopeType: "Global",
          scopeIncludesDescendants: true,
          grantedByAccountId: actor.id,
          reason: "Initial member role assignment after application acceptance.",
        },
      });
    }

    if (noteBody) {
      await tx.applicationReviewNote.create({
        data: {
          applicationId,
          authorAccountId: actor.id,
          stage: "FinalDecision",
          body: noteBody,
          visibility: "Staff",
        },
      });
    }

    const converted = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "Converted",
        convertedProfileId: profile.id,
        closedAt: now,
      },
      include: applicationInclude(),
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId,
        oldStatus: accepted.status,
        newStatus: "Converted",
        stage: "FinalDecision",
        changedByAccountId: actor.id,
        reason: "Accepted application converted into active member profile.",
        permissionContext: {
          actorAccountId: actor.id,
          action: "convert",
          personnelProfileId: profile.id,
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: application.accountId,
        targetPersonnelProfileId: profile.id,
        module: "applications",
        action: "accept-convert",
        recordType: "Application",
        recordId: applicationId,
        oldValue: { accountStatus: application.account.status, applicationStatus: application.status },
        newValue: {
          accountStatus: "Active",
          applicationStatus: "Converted",
          personnelProfileId: profile.id,
          targetUnitId: application.targetUnitId,
        },
        reason,
      },
    });

    await tx.notification.create({
      data: {
        accountId: application.accountId,
        category: "applications",
        workflowEvent: "application-accepted",
        title: "Application accepted",
        body: "Your application was accepted and your account is now active.",
        relatedRecordType: "Application",
        relatedRecordId: applicationId,
      },
    });

    return converted;
  });

  return { ok: true, application: result };
}

export async function rejectApplication({ prisma, actor, applicationId, reason, noteBody }) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: applicationInclude(),
  });
  if (!application) {
    return failure("not_found", "Application was not found.");
  }

  const isRecruiterStage = ["Submitted", "RecruiterScreening"].includes(application.status);
  const isTargetUnitStage = ["RecruiterRecommended", "TargetUnitReview"].includes(application.status);

  if (isRecruiterStage && !canRecruiterReview(actor)) {
    return failure("permission_denied", "Recruiter review permission is required.");
  }

  if (isTargetUnitStage) {
    if (!canTargetUnitReview(actor)) {
      return failure("permission_denied", "Target-unit review permission is required.");
    }
    if (!isUnitInActorScope(actor, application.targetUnitId) && !hasGlobalReviewOverride(actor)) {
      return failure("permission_denied", "Reviewer does not have target-unit authority for this application.");
    }
  }

  if (!isRecruiterStage && !isTargetUnitStage) {
    return failure("invalid_transition", "Application cannot be rejected from its current status.");
  }

  const stage = isRecruiterStage ? "RecruiterScreening" : "FinalDecision";
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "Denied",
        unitDecisionByAccountId: isTargetUnitStage ? actor.id : application.unitDecisionByAccountId,
        unitDecisionAt: isTargetUnitStage ? new Date() : application.unitDecisionAt,
        decidedAt: new Date(),
        closedAt: new Date(),
      },
      include: applicationInclude(),
    });

    await tx.applicationStatusHistory.create({
      data: {
        applicationId,
        oldStatus: application.status,
        newStatus: "Denied",
        stage,
        changedByAccountId: actor.id,
        reason,
        permissionContext: {
          actorAccountId: actor.id,
          action: "reject",
        },
      },
    });

    if (noteBody) {
      await tx.applicationReviewNote.create({
        data: {
          applicationId,
          authorAccountId: actor.id,
          stage,
          body: noteBody,
          visibility: "Staff",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorAccountId: actor.id,
        targetAccountId: application.accountId,
        module: "applications",
        action: "reject",
        recordType: "Application",
        recordId: applicationId,
        oldValue: { status: application.status },
        newValue: { status: "Denied" },
        reason,
      },
    });

    await tx.notification.create({
      data: {
        accountId: application.accountId,
        category: "applications",
        workflowEvent: "application-denied",
        title: "Application decision recorded",
        body: "Your application was denied. Contact staff if you need clarification.",
        relatedRecordType: "Application",
        relatedRecordId: applicationId,
      },
    });

    return updated;
  });

  return { ok: true, application: result };
}

export function applicantFormState(body = {}) {
  return {
    targetUnitId: normalizeText(body.targetUnitId),
    preferredCallsign: normalizeText(body.preferredCallsign),
    age: normalizeText(body.age),
    timezone: normalizeText(body.timezone),
    availability: normalizeText(body.availability),
    experience: normalizeText(body.experience),
    motivation: normalizeText(body.motivation),
  };
}

function buildApplicantAnswers(body) {
  const form = applicantFormState(body);
  return buildApplicantAnswerDefinitions().map((definition) => ({
    section: definition.section,
    questionKey: definition.key,
    questionText: definition.label,
    answer: readAnswerValue(form, definition.key),
    sortOrder: definition.order,
  }));
}

function readAnswerValue(form, key) {
  switch (key) {
    case "preferred-callsign":
      return form.preferredCallsign;
    default:
      return form[key] ?? "";
  }
}

function firstAnswer(application, key) {
  return application.answers.find((answer) => answer.questionKey === key)?.answer?.trim() ?? "";
}

function activeUnitScopeIds(account) {
  return (account.roleAssignments ?? [])
    .filter((assignment) => !assignment.endsAt && assignment.unitId)
    .map((assignment) => assignment.unitId);
}

function isUnitInActorScope(actor, unitId) {
  return (actor.roleAssignments ?? []).some((assignment) => {
    if (assignment.endsAt) return false;
    if (assignment.scopeType === "Global") return true;
    return assignment.unitId === unitId;
  });
}

function hasGlobalReviewOverride(actor) {
  return (actor.roleAssignments ?? []).some(
    (assignment) => !assignment.endsAt && assignment.scopeType === "Global",
  );
}

function failure(code, message) {
  return { ok: false, code, message };
}

function applicationInclude() {
  return {
    account: {
      include: {
        authIdentities: true,
        personnelProfile: true,
      },
    },
    targetUnit: true,
    convertedProfile: true,
    answers: {
      orderBy: { sortOrder: "asc" },
    },
    statusHistory: {
      orderBy: { createdAt: "asc" },
    },
    notes: {
      orderBy: { createdAt: "asc" },
    },
  };
}

export { hasPermission, isHtmlRequest };
