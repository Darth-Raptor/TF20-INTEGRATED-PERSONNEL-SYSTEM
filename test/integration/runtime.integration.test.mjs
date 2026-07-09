import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { catalogSource } from "../../prisma/catalog-source.mjs";
import { syncCatalogs } from "../../prisma/seed.mjs";
import { importCurrentRoster } from "../../scripts/import-current-roster.mjs";
import {
  acceptApplication,
  assignApplicationUnit,
  claimApplication,
  createOrResumeDraftApplication,
  getApplicationById,
  getRecruitingOptions,
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
  submitOwnApplication,
  updateOwnApplication,
  withdrawOwnApplication,
} from "../../src/server/application-service.mjs";
import {
  backfillCurrentDiscordGuildMembers,
  backfillPendingDiscordAccountsFromMembershipEvents,
  ingestDiscordMembershipEvent,
} from "../../src/server/discord-membership-service.mjs";
import { flattenPermissions, resolveAuthenticatedAccount } from "../../src/server/auth-service.mjs";
import {
  getAdminUserRecord,
  listAdminUserRecords,
  saveAdminUserRecordNote,
  updateAdminUserRecord,
} from "../../src/server/admin-user-records-service.mjs";
import { getCurrentIntakeDocuments } from "../../src/server/intake-documents.mjs";
import {
  getPersonnelEditOptions,
  getStaffUnitOverview,
  listPublicUnitOpenings,
  listScopedPersonnel,
  updateUnitMOSSlots,
  updatePersonnelProfile,
} from "../../src/server/personnel-service.mjs";
import {
  assignAccountRole,
  getRoleManagementAccount,
  listRoleManagementOptions,
  removeAccountRole,
} from "../../src/server/role-management-service.mjs";
import {
  createTrainingSession,
  getTrainingOptions,
  listTrainingSessions,
  listOwnTrainingRecords,
  updateTrainingSession,
} from "../../src/server/training-service.mjs";
import {
  cancelEvent,
  createEvent,
  getEventDetail,
  getEventOptions,
  listEventsForMonth,
  signupForEvent,
  updateEvent,
  withdrawFromEvent,
} from "../../src/server/event-service.mjs";

const prisma = new PrismaClient();
let sequence = 0;
const TEST_DISCORD_GUILD_ID = "test-approved-guild";
const TEST_DISCORD_CONFIG = {
  discord: {
    approvedGuildId: TEST_DISCORD_GUILD_ID,
  },
};

test.before(async () => {
  await syncCatalogs(prisma, catalogSource, { mode: "sync" });
});

test.after(async () => {
  await prisma.$disconnect();
});

test("recruiting options expose only active open 7000-level units", async () => {
  const options = await getRecruitingOptions(prisma);

  assert.ok(options.units.length > 0);
  assert.deepEqual(options.timeZones, ["UTC", "EST", "CST", "MST", "PST", "GMT", "CET", "AEST"]);
  assert.equal(options.availabilitySlots.length, 9);
  assert.equal(options.availabilitySlots[0].id, "monday_evenings");
  assert.equal(
    options.units.every((unit) => unit.hierarchyBase === 7000),
    true,
  );
  assert.equal(
    options.units.some((unit) => unit.key === "tf20_1rrc"),
    true,
  );
});

test("applicant recruiting options only show live-open units and MOS rows", async () => {
  const openUnit = await activeUnit("tf20_ranger_a");
  const openMos = await ensureOpenRecruitingMOS(openUnit.id);
  const closedUnit = await activeUnit("tf20_soar_b160");
  const closedMos = await recruitingMOSForUnit(closedUnit.id);

  await prisma.mOS.update({
    where: { id: closedMos.id },
    data: { authorizedSlots: 0 },
  });

  const options = await getRecruitingOptions(prisma, { liveOnly: true });

  assert.ok(options.units.some((unit) => unit.id === openUnit.id));
  assert.ok(options.mos.some((mos) => mos.id === openMos.id));
  assert.equal(
    options.units.some((unit) => unit.id === closedUnit.id),
    false,
  );
  assert.equal(
    options.mos.some((mos) => mos.id === closedMos.id),
    false,
  );
});

test("TEAM 1 RRC stays out of live openings until slots are configured", async () => {
  const rrcUnit = await activeUnit("tf20_1rrc");
  const rrcMos = await recruitingMOSForUnit(rrcUnit.id);

  const initialLiveOptions = await getRecruitingOptions(prisma, { liveOnly: true });
  assert.equal(
    initialLiveOptions.units.some((unit) => unit.id === rrcUnit.id),
    false,
  );
  assert.equal(
    initialLiveOptions.mos.some((mos) => mos.id === rrcMos.id),
    false,
  );

  const initialPublicOpenings = await listPublicUnitOpenings(prisma);
  assert.equal(initialPublicOpenings.ok, true);
  assert.equal(
    initialPublicOpenings.items.some((group) => group.unit.id === rrcUnit.id),
    false,
  );

  await prisma.mOS.update({
    where: { id: rrcMos.id },
    data: { authorizedSlots: 1 },
  });

  const openedLiveOptions = await getRecruitingOptions(prisma, { liveOnly: true });
  assert.equal(
    openedLiveOptions.units.some((unit) => unit.id === rrcUnit.id),
    true,
  );
  assert.equal(
    openedLiveOptions.mos.some((mos) => mos.id === rrcMos.id),
    true,
  );

  const openedPublicOpenings = await listPublicUnitOpenings(prisma);
  assert.equal(openedPublicOpenings.ok, true);
  const rrcGroup = openedPublicOpenings.items.find((group) => group.unit.id === rrcUnit.id);
  assert.ok(rrcGroup);
  assert.ok(rrcGroup.mos.some((mos) => mos.id === rrcMos.id));
});

test("intake agreements are required before applicant draft, update, or submit", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const body = await applicationBody(targetUnit.id, "Intake Gate");

  const draft = await createOrResumeDraftApplication({ prisma, account: pending });
  assert.equal(draft.ok, false);
  assert.equal(draft.code, "intake_agreement_required");

  const update = await updateOwnApplication({ prisma, account: pending, body });
  assert.equal(update.ok, false);
  assert.equal(update.code, "intake_agreement_required");

  const submit = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submit.ok, false);
  assert.equal(submit.code, "intake_agreement_required");

  const agreement = await agreeToCurrentIntakeDocuments(pending);
  assert.equal(
    agreement.documents.every((document) => document.status === "agreed"),
    true,
  );

  const unlocked = await updateOwnApplication({ prisma, account: pending, body });
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.application.firstName, "Intake");
});

test("application drafts allow new applicant questions to remain blank", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const body = await applicationBody(targetUnit.id, "Draft Preview");
  delete body.age;
  delete body.timeZone;
  delete body.reasonForJoining;
  delete body.availabilitySlotKeys;
  await agreeToCurrentIntakeDocuments(pending);

  const result = await updateOwnApplication({ prisma, account: pending, body });

  assert.equal(result.ok, true);
  assert.equal(result.application.age, null);
  assert.equal(result.application.timeZone, null);
  assert.equal(result.application.reasonForJoining, null);
  assert.deepEqual(result.application.availabilitySlots, []);
});

test("application submit requires and validates new applicant questions", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pendingMissing = await createAccountWithRole("pending-user", "Pending");
  const missingBody = await applicationBody(targetUnit.id, "Missing Questions");
  delete missingBody.age;
  delete missingBody.timeZone;
  delete missingBody.reasonForJoining;
  delete missingBody.availabilitySlotKeys;
  await agreeToCurrentIntakeDocuments(pendingMissing);

  const missing = await submitOwnApplication({
    prisma,
    account: pendingMissing,
    body: missingBody,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "validation_error");
  assert.match(missing.message, /Age is required/);
  assert.match(missing.message, /Time zone is required/);
  assert.match(missing.message, /Reason for joining is required/);
  assert.match(missing.message, /availability time slot is required/i);

  const pendingInvalid = await createAccountWithRole("pending-user", "Pending");
  await agreeToCurrentIntakeDocuments(pendingInvalid);
  const invalid = await submitOwnApplication({
    prisma,
    account: pendingInvalid,
    body: {
      ...(await applicationBody(targetUnit.id, "Invalid Questions")),
      age: "twenty",
      timeZone: "Mars/Phobos",
      availabilitySlotKeys: ["made_up_slot"],
    },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "validation_error");
  assert.match(invalid.message, /Age must be a positive whole number/);
  assert.match(invalid.message, /Time zone is invalid/);
  assert.match(invalid.message, /availability time slots are invalid/i);
});

test("stale draft unit and MOS selections remain visible but are blocked on submit", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const targetMos = await ensureOpenRecruitingMOS(targetUnit.id);
  const pending = await createAccountWithRole("pending-user", "Pending");
  const body = await applicationBody(targetUnit.id, "Stale Openings");
  body.desiredMOSIds = [targetMos.id];

  await agreeToCurrentIntakeDocuments(pending);

  const draft = await updateOwnApplication({ prisma, account: pending, body });
  assert.equal(draft.ok, true);

  await prisma.mOS.update({
    where: { id: targetMos.id },
    data: { authorizedSlots: 0 },
  });

  const applicantOptions = await getRecruitingOptions(prisma, {
    liveOnly: true,
    selectedUnitIds: draft.application.interestedUnits.map((entry) => entry.unitId),
    selectedMOSIds: draft.application.desiredMOS.map((entry) => entry.mosId),
  });
  assert.equal(
    applicantOptions.units.some((unit) => unit.id === targetUnit.id && unit.isStale),
    true,
  );
  assert.equal(
    applicantOptions.mos.some((mos) => mos.id === targetMos.id && mos.isStale),
    true,
  );

  const updated = await updateOwnApplication({ prisma, account: pending, body });
  assert.equal(updated.ok, true);

  const submit = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submit.ok, false);
  assert.equal(submit.code, "validation_error");
  assert.match(submit.message, /current openings/i);
});

test("pending account can draft, submit, and convert into an active member", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const recruiter = await createAccountWithRole("recruiter", "Active");
  const unitReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const body = await applicationBody(targetUnit.id, "Raptor One");

  const agreement = await agreeToCurrentIntakeDocuments(pending);
  const draft = await createOrResumeDraftApplication({ prisma, account: pending });
  assert.equal(draft.ok, true);
  assert.equal(draft.created, false);
  assert.equal(draft.application.id, agreement.application.id);
  assert.equal(draft.application.status, "Draft");

  const updatedDraft = await updateOwnApplication({ prisma, account: pending, body });
  assert.equal(updatedDraft.ok, true);
  assert.equal(updatedDraft.application.firstName, "Raptor");
  assert.equal(updatedDraft.application.lastName, "One");
  assert.equal(updatedDraft.application.age, 24);
  assert.equal(updatedDraft.application.timeZone, "CST");
  assert.equal(
    updatedDraft.application.reasonForJoining,
    "I want to contribute to a structured Task Force 20 team.",
  );
  assert.equal(updatedDraft.application.servicePeriods.length, 1);
  assert.equal(updatedDraft.application.armaUnits.length, 1);
  assert.deepEqual(
    updatedDraft.application.availabilitySlots.map((entry) => entry.slotKey),
    ["tuesday_evenings", "thursday_evenings"],
  );

  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.application.status, "Submitted");

  const resumed = await createOrResumeDraftApplication({ prisma, account: pending });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.created, false);
  assert.equal(resumed.application.id, draft.application.id);
  assert.equal(resumed.application.status, "Submitted");

  const claimed = await claimApplication({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.application.claimedByAccountId, recruiter.id);

  const recommended = await recommendApplication({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
    reason: "Integration recruiter recommendation.",
  });
  assert.equal(recommended.ok, true);
  assert.equal(recommended.application.status, "RecruiterRecommended");

  const assigned = await assignApplicationUnit({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
    targetUnitId: targetUnit.id,
    reason: "Integration target-unit assignment.",
  });
  assert.equal(assigned.ok, true);
  assert.equal(assigned.application.status, "TargetUnitReview");

  const accepted = await acceptApplication({
    prisma,
    actor: unitReviewer,
    applicationId: submitted.application.id,
    reason: "Integration target-unit acceptance.",
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.application.status, "Converted");

  const convertedAccount = await prisma.account.findUniqueOrThrow({
    where: { id: pending.id },
    include: {
      personnelProfile: true,
      roleAssignments: { include: { role: true } },
    },
  });

  assert.equal(convertedAccount.status, "Active");
  assert.equal(convertedAccount.personnelProfile?.name, "Raptor One");
  assert.equal(convertedAccount.personnelProfile?.source, "Discord");
  assert.equal(convertedAccount.personnelProfile?.militaryService, true);
  assert.equal(convertedAccount.personnelProfile?.currentUnitId, targetUnit.id);
  assert.ok(
    convertedAccount.roleAssignments.some(
      (assignment) => !assignment.endsAt && assignment.role.key === "member",
    ),
  );
  assert.ok(
    convertedAccount.roleAssignments.some(
      (assignment) => assignment.endsAt && assignment.role.key === "pending-user",
    ),
  );
});

test("application workflow queues recruiting discord delivery jobs", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const recruiter = await createAccountWithRole("recruiter", "Active");
  const unitReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const body = await applicationBody(targetUnit.id, "Discord Queue");
  await agreeToCurrentIntakeDocuments(pending);

  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);

  const claimed = await claimApplication({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
  });
  assert.equal(claimed.ok, true);

  const infoRequested = await requestApplicationInfo({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
    reason: "Need updated application details.",
  });
  assert.equal(infoRequested.ok, true);

  const resubmitted = await submitOwnApplication({
    prisma,
    account: pending,
    body: { ...body, leadershipDetails: "Updated leadership details." },
  });
  assert.equal(resubmitted.ok, true);

  const recommended = await recommendApplication({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
    targetUnitId: targetUnit.id,
  });
  assert.equal(recommended.ok, true);

  const accepted = await acceptApplication({
    prisma,
    actor: unitReviewer,
    applicationId: submitted.application.id,
    reason: "Accepted by target unit.",
  });
  assert.equal(accepted.ok, true);

  const jobs = await prisma.discordDeliveryJob.findMany({
    where: { payload: { path: "$.applicationId", equals: submitted.application.id } },
    orderBy: { createdAt: "asc" },
  });

  assert.deepEqual(
    jobs.map((job) => job.eventType),
    [
      "application_submitted",
      "application_claimed",
      "application_resubmitted",
      "target_unit_review_completed",
    ],
  );
  assert.equal(
    jobs.every((job) => job.status === "Pending"),
    true,
  );
});

test("recruiter can request more information and applicant can resubmit or withdraw", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const reviewer = await createAccountWithRole("recruiter", "Active");
  const body = await applicationBody(targetUnit.id, "Request Info");
  await agreeToCurrentIntakeDocuments(pending);

  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);
  assert.equal(submitted.application.status, "Submitted");

  const claimed = await claimApplication({
    prisma,
    actor: reviewer,
    applicationId: submitted.application.id,
  });
  assert.equal(claimed.ok, true);

  const infoRequested = await requestApplicationInfo({
    prisma,
    actor: reviewer,
    applicationId: submitted.application.id,
    reason: "Integration needs updated details.",
  });
  assert.equal(infoRequested.ok, true);
  assert.equal(infoRequested.application.status, "MoreInfoRequested");

  const updated = await updateOwnApplication({
    prisma,
    account: pending,
    body: { ...body, lastName: "Updated" },
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.application.lastName, "Updated");

  const resubmitted = await submitOwnApplication({
    prisma,
    account: pending,
    body: { ...body, lastName: "Updated" },
  });
  assert.equal(resubmitted.ok, true);
  assert.equal(resubmitted.application.status, "Submitted");

  const withdrawn = await withdrawOwnApplication({
    prisma,
    account: pending,
    reason: "Integration applicant withdrawal.",
  });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.application.status, "Withdrawn");
});

test("reviewer notes are saved separately from status actions", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const reviewer = await createAccountWithRole("recruiter", "Active");
  const body = await applicationBody(targetUnit.id, "Recruiting Notes");
  await agreeToCurrentIntakeDocuments(pending);
  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);

  const claimed = await claimApplication({
    prisma,
    actor: reviewer,
    applicationId: submitted.application.id,
  });
  assert.equal(claimed.ok, true);

  const savedNote = await saveApplicationReviewNote({
    prisma,
    actor: reviewer,
    applicationId: submitted.application.id,
    body: "Applicant seems ready for unit review.",
  });
  assert.equal(savedNote.ok, true);
  assert.equal(savedNote.application.notes.length, 1);
  assert.equal(savedNote.application.notes[0].body, "Applicant seems ready for unit review.");

  const recommended = await recommendApplication({
    prisma,
    actor: reviewer,
    applicationId: submitted.application.id,
    targetUnitId: targetUnit.id,
  });
  assert.equal(recommended.ok, true);
  assert.equal(recommended.application.status, "TargetUnitReview");
  assert.equal(recommended.application.notes.length, 1);

  const reloaded = await prisma.application.findUniqueOrThrow({
    where: { id: submitted.application.id },
    include: {
      notes: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
    },
  });
  assert.equal(reloaded.notes.length, 1);
  assert.equal(
    reloaded.statusHistory.at(-1).reason,
    "Recruiter recommended applicant to target unit.",
  );

  const emptyNote = await saveApplicationReviewNote({
    prisma,
    actor: reviewer,
    applicationId: submitted.application.id,
    body: "",
  });
  assert.equal(emptyNote.ok, false);
  assert.equal(emptyNote.code, "validation_error");
});

test("recruiter application claims gate recruiter-side writes", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const recruiterOne = await createAccountWithRole("recruiter", "Active");
  const recruiterTwo = await createAccountWithRole("recruiter", "Active");
  const body = await applicationBody(targetUnit.id, "Claim Gate");
  await agreeToCurrentIntakeDocuments(pending);
  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);

  const unclaimedNote = await saveApplicationReviewNote({
    prisma,
    actor: recruiterOne,
    applicationId: submitted.application.id,
    body: "Trying to write before claim.",
  });
  assert.equal(unclaimedNote.ok, false);
  assert.equal(unclaimedNote.code, "claim_required");

  const claimed = await claimApplication({
    prisma,
    actor: recruiterOne,
    applicationId: submitted.application.id,
  });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.application.claimedByAccountId, recruiterOne.id);
  assert.ok(claimed.application.claimedAt);

  const duplicateClaim = await claimApplication({
    prisma,
    actor: recruiterTwo,
    applicationId: submitted.application.id,
  });
  assert.equal(duplicateClaim.ok, false);
  assert.equal(duplicateClaim.code, "already_claimed");

  const nonClaimantNote = await saveApplicationReviewNote({
    prisma,
    actor: recruiterTwo,
    applicationId: submitted.application.id,
    body: "Non-claimant note.",
  });
  assert.equal(nonClaimantNote.ok, false);
  assert.equal(nonClaimantNote.code, "permission_denied");

  const nonClaimantRequest = await requestApplicationInfo({
    prisma,
    actor: recruiterTwo,
    applicationId: submitted.application.id,
    reason: "Non-claimant request.",
  });
  assert.equal(nonClaimantRequest.ok, false);
  assert.equal(nonClaimantRequest.code, "permission_denied");

  const nonClaimantRecommend = await recommendApplication({
    prisma,
    actor: recruiterTwo,
    applicationId: submitted.application.id,
    targetUnitId: targetUnit.id,
  });
  assert.equal(nonClaimantRecommend.ok, false);
  assert.equal(nonClaimantRecommend.code, "permission_denied");

  const nonClaimantReject = await rejectApplication({
    prisma,
    actor: recruiterTwo,
    applicationId: submitted.application.id,
    reason: "Non-claimant reject.",
  });
  assert.equal(nonClaimantReject.ok, false);
  assert.equal(nonClaimantReject.code, "permission_denied");

  const claimantNote = await saveApplicationReviewNote({
    prisma,
    actor: recruiterOne,
    applicationId: submitted.application.id,
    body: "Claimant note.",
  });
  assert.equal(claimantNote.ok, true);
  assert.equal(claimantNote.application.notes.at(-1).body, "Claimant note.");

  const released = await releaseApplicationClaim({
    prisma,
    actor: recruiterOne,
    applicationId: submitted.application.id,
  });
  assert.equal(released.ok, true);
  assert.equal(released.application.claimedByAccountId, null);
  assert.equal(released.application.claimedAt, null);

  const reclaimed = await claimApplication({
    prisma,
    actor: recruiterTwo,
    applicationId: submitted.application.id,
  });
  assert.equal(reclaimed.ok, true);
  assert.equal(reclaimed.application.claimedByAccountId, recruiterTwo.id);

  const formerClaimantNote = await saveApplicationReviewNote({
    prisma,
    actor: recruiterOne,
    applicationId: submitted.application.id,
    body: "Former claimant note.",
  });
  assert.equal(formerClaimantNote.ok, false);
  assert.equal(formerClaimantNote.code, "permission_denied");
});

test("recruiter records include closed applications and reopening requires recruiter plus system-admin", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const unitReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const recruiterOnly = await createAccountWithRole("recruiter", "Active");
  const dualRole = await assignAdditionalRole(
    await createAccountWithRole("recruiter", "Active"),
    "system-admin",
  );

  const deniedPending = await createAccountWithRole("pending-user", "Pending");
  await agreeToCurrentIntakeDocuments(deniedPending);
  const deniedSubmitted = await submitOwnApplication({
    prisma,
    account: deniedPending,
    body: await applicationBody(targetUnit.id, "Denied Record"),
  });
  assert.equal(deniedSubmitted.ok, true);
  const deniedClaim = await claimApplication({
    prisma,
    actor: recruiterOnly,
    applicationId: deniedSubmitted.application.id,
  });
  assert.equal(deniedClaim.ok, true);
  const denied = await rejectApplication({
    prisma,
    actor: recruiterOnly,
    applicationId: deniedSubmitted.application.id,
    reason: "Denied for integration coverage.",
  });
  assert.equal(denied.ok, true);

  const withdrawnPending = await createAccountWithRole("pending-user", "Pending");
  await agreeToCurrentIntakeDocuments(withdrawnPending);
  const withdrawnSubmitted = await submitOwnApplication({
    prisma,
    account: withdrawnPending,
    body: await applicationBody(targetUnit.id, "Withdrawn Record"),
  });
  assert.equal(withdrawnSubmitted.ok, true);
  const withdrawn = await withdrawOwnApplication({
    prisma,
    account: withdrawnPending,
    reason: "Withdrawn for integration coverage.",
  });
  assert.equal(withdrawn.ok, true);

  const convertedPending = await createAccountWithRole("pending-user", "Pending");
  const converted = await createConvertedApplication({
    pending: convertedPending,
    reviewer: unitReviewer,
    targetUnit,
    preferredName: "Converted Record",
  });
  assert.equal(converted.status, "Converted");

  const closedPending = await createAccountWithRole("pending-user", "Pending");
  await agreeToCurrentIntakeDocuments(closedPending);
  const closedSubmitted = await submitOwnApplication({
    prisma,
    account: closedPending,
    body: await applicationBody(targetUnit.id, "Closed Record"),
  });
  assert.equal(closedSubmitted.ok, true);
  const closedAt = new Date("2026-06-20T12:00:00.000Z");
  const closed = await prisma.application.update({
    where: { id: closedSubmitted.application.id },
    data: {
      status: "Closed",
      closedAt,
      decidedAt: closedAt,
    },
  });
  assert.equal(closed.status, "Closed");

  const activePending = await createAccountWithRole("pending-user", "Pending");
  await agreeToCurrentIntakeDocuments(activePending);
  const activeSubmitted = await submitOwnApplication({
    prisma,
    account: activePending,
    body: await applicationBody(targetUnit.id, "Active Record Exclusion"),
  });
  assert.equal(activeSubmitted.ok, true);

  const records = await listReviewRecords(prisma, recruiterOnly);
  const recordIds = new Set(records.map((item) => item.id));
  assert.ok(recordIds.has(denied.application.id));
  assert.ok(recordIds.has(withdrawn.application.id));
  assert.ok(recordIds.has(converted.id));
  assert.ok(recordIds.has(closed.id));
  assert.equal(recordIds.has(activeSubmitted.application.id), false);

  const forbiddenReopen = await reopenApplication({
    prisma,
    actor: recruiterOnly,
    applicationId: denied.application.id,
    reason: "Recruiter-only reopen attempt.",
  });
  assert.equal(forbiddenReopen.ok, false);
  assert.equal(forbiddenReopen.code, "permission_denied");

  const reopened = await reopenApplication({
    prisma,
    actor: dualRole,
    applicationId: denied.application.id,
    reason: "Reopening denied record for review.",
  });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.application.status, "Submitted");
  assert.equal(reopened.application.targetUnitId, null);
  assert.equal(reopened.application.claimedByAccountId, null);
  assert.equal(reopened.application.closedAt, null);

  const convertedReopen = await reopenApplication({
    prisma,
    actor: dualRole,
    applicationId: converted.id,
    reason: "Converted reopen attempt.",
  });
  assert.equal(convertedReopen.ok, false);
  assert.equal(convertedReopen.code, "invalid_transition");
});

test("least-privilege roles block cross-section application, personnel, and training authority", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const unitStaff = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const recruiter = await createAccountWithRole("recruiter", "Active");
  const systemAdmin = await createAccountWithRole("system-admin", "Active");
  const body = await applicationBody(targetUnit.id, "Least Privilege");
  await agreeToCurrentIntakeDocuments(pending);
  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);

  assert.deepEqual(await listReviewQueue(prisma, unitStaff), []);

  const unitStaffClaim = await claimApplication({
    prisma,
    actor: unitStaff,
    applicationId: submitted.application.id,
  });
  assert.equal(unitStaffClaim.ok, false);
  assert.equal(unitStaffClaim.code, "permission_denied");

  const unitStaffRecruiterNote = await saveApplicationReviewNote({
    prisma,
    actor: unitStaff,
    applicationId: submitted.application.id,
    body: "Trying recruiter note.",
  });
  assert.equal(unitStaffRecruiterNote.ok, false);
  assert.equal(unitStaffRecruiterNote.code, "permission_denied");

  const unitStaffRecruiterInfo = await requestApplicationInfo({
    prisma,
    actor: unitStaff,
    applicationId: submitted.application.id,
    reason: "Trying recruiter info request.",
  });
  assert.equal(unitStaffRecruiterInfo.ok, false);
  assert.equal(unitStaffRecruiterInfo.code, "permission_denied");

  const unitStaffTrainingOptions = await getTrainingOptions(prisma, unitStaff);
  assert.equal(unitStaffTrainingOptions.ok, false);
  assert.equal(unitStaffTrainingOptions.code, "permission_denied");

  const unitStaffTrainingCreate = await createTrainingSession({
    prisma,
    actor: unitStaff,
    body: {},
  });
  assert.equal(unitStaffTrainingCreate.ok, false);
  assert.equal(unitStaffTrainingCreate.code, "permission_denied");

  const recruiterPersonnel = await listScopedPersonnel(prisma, recruiter);
  assert.equal(recruiterPersonnel.ok, false);
  assert.equal(recruiterPersonnel.code, "permission_denied");
  assert.deepEqual(await listUnitReviewQueue(prisma, recruiter), []);

  const adminClaim = await claimApplication({
    prisma,
    actor: systemAdmin,
    applicationId: submitted.application.id,
  });
  assert.equal(adminClaim.ok, false);
  assert.equal(adminClaim.code, "permission_denied");

  const adminPersonnel = await listScopedPersonnel(prisma, systemAdmin);
  assert.equal(adminPersonnel.ok, false);
  assert.equal(adminPersonnel.code, "permission_denied");

  const adminTrainingOptions = await getTrainingOptions(prisma, systemAdmin);
  assert.equal(adminTrainingOptions.ok, false);
  assert.equal(adminTrainingOptions.code, "permission_denied");

  const targetReview = await createTargetUnitReviewApplication({
    targetUnit,
    applicationUnit: targetUnit,
    preferredName: "Unit Review Access",
  });
  const unitQueue = await listUnitReviewQueue(prisma, unitStaff);
  assert.ok(unitQueue.some((item) => item.id === targetReview.application.id));

  const unitPersonnel = await listScopedPersonnel(prisma, unitStaff);
  assert.equal(unitPersonnel.ok, true);
});

test("person-oriented lists and training attendee rows sort by last name", async () => {
  const unit = await activeUnit("tf20_ranger_a");
  const reviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: unit.id,
  });
  const admin = await createAccountWithRole("system-admin", "Active");
  const trainer = await createAccountWithRole("trainer", "Active", {
    scopeType: "Unit",
    unitId: unit.id,
  });
  const course = await prisma.trainingCourse.findFirstOrThrow({
    where: { status: "Active" },
  });

  const createdPeople = [];
  for (const name of ["Alex Zimmer", "Chris Baker", "Bella Adams"]) {
    const account = await createAccountWithRole("member", "Active");
    const profile = await prisma.personnelProfile.create({
      data: {
        accountId: account.id,
        name,
        status: "Active",
        currentUnitId: unit.id,
      },
    });
    createdPeople.push({ accountId: account.id, profileId: profile.id, name });
  }

  const expectedNames = ["Bella Adams", "Chris Baker", "Alex Zimmer"];
  const createdAccountIds = new Set(createdPeople.map((person) => person.accountId));
  const createdProfileIds = new Set(createdPeople.map((person) => person.profileId));

  const roster = await listScopedPersonnel(prisma, reviewer);
  assert.equal(roster.ok, true);
  assert.deepEqual(
    roster.items.filter((item) => createdProfileIds.has(item.id)).map((item) => item.name),
    expectedNames,
  );

  const roleOptions = await listRoleManagementOptions(prisma, admin);
  assert.equal(roleOptions.ok, true);
  assert.deepEqual(
    roleOptions.accounts
      .filter((account) => createdAccountIds.has(account.id))
      .map((account) => account.personnelProfile?.name ?? account.displayName),
    expectedNames,
  );

  const trainingOptions = await getTrainingOptions(prisma, trainer);
  assert.equal(trainingOptions.ok, true);
  assert.deepEqual(
    trainingOptions.options.personnel
      .filter((profile) => createdProfileIds.has(profile.id))
      .map((profile) => profile.name),
    expectedNames,
  );

  const createdSession = await createTrainingSession({
    prisma,
    actor: trainer,
    body: {
      courseId: course.id,
      completedAt: "2026-07-08",
      notes: "Sorting verification.",
      attendees: [
        { personnelProfileId: createdPeople[0].profileId, outcome: "Pass" },
        { personnelProfileId: createdPeople[1].profileId, outcome: "Pass" },
        { personnelProfileId: createdPeople[2].profileId, outcome: "Fail" },
      ],
    },
  });
  assert.equal(createdSession.ok, true);
  assert.deepEqual(
    createdSession.session.records.map((record) => record.personnelProfile.name),
    expectedNames,
  );

  const sessions = await listTrainingSessions(prisma, trainer);
  assert.equal(sessions.ok, true);
  const listedSession = sessions.items.find((item) => item.id === createdSession.session.id);
  assert.ok(listedSession);
  assert.deepEqual(
    listedSession.records.map((record) => record.personnelProfile.name),
    expectedNames,
  );
});

test("staff unit overview resolves to the nearest 7000 root and updates MOS slots in scope", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const childUnit = await activeUnit("tf20_ranger_a_1p");
  const squadUnit = await activeUnit("tf20_ranger_a_1p_1s");
  const teamUnit = await activeUnit("tf20_ranger_a_1p_1s_at");
  const unitStaff = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: childUnit.id,
  });
  const commandStaff = await createAccountWithRole("command-staff", "Active");
  const rootMos = await recruitingMOSForUnit(rootUnit.id);
  const rootMember = await createActivePersonnel("Root Scope");
  const childMember = await createActivePersonnel("Child Scope");
  const squadMember = await createActivePersonnel("Squad Lead");
  const teamMember = await createActivePersonnel("Team Member");
  const [highBillet, lowBillet, captainRank, sergeantRank] = await Promise.all([
    prisma.billet.findFirstOrThrow({
      where: { status: "Active" },
      orderBy: [{ commandPrecedence: "desc" }, { name: "asc" }],
    }),
    prisma.billet.findFirstOrThrow({
      where: { status: "Active" },
      orderBy: [{ commandPrecedence: "asc" }, { name: "asc" }],
    }),
    prisma.rank.findFirstOrThrow({
      where: { status: "Active" },
      orderBy: [{ precedence: "desc" }, { name: "asc" }],
    }),
    prisma.rank.findFirstOrThrow({
      where: { status: "Active" },
      orderBy: [{ precedence: "asc" }, { name: "asc" }],
    }),
  ]);

  await prisma.personnelProfile.update({
    where: { id: rootMember.profile.id },
    data: {
      currentUnitId: rootUnit.id,
      currentMOSId: rootMos.id,
    },
  });
  await prisma.personnelProfile.update({
    where: { id: childMember.profile.id },
    data: {
      currentUnitId: childUnit.id,
      currentMOSId: rootMos.id,
    },
  });
  await prisma.personnelProfile.update({
    where: { id: squadMember.profile.id },
    data: {
      currentUnitId: squadUnit.id,
      currentMOSId: rootMos.id,
      currentBilletId: highBillet.id,
      currentRankId: captainRank.id,
    },
  });
  await prisma.personnelProfile.update({
    where: { id: teamMember.profile.id },
    data: {
      currentUnitId: teamUnit.id,
      currentMOSId: rootMos.id,
      currentBilletId: lowBillet.id,
      currentRankId: sergeantRank.id,
    },
  });

  const overview = await getStaffUnitOverview(prisma, unitStaff, rootUnit.id);
  assert.equal(overview.ok, true);
  assert.equal(overview.data.selectedUnit.id, rootUnit.id);
  assert.ok(overview.data.roots.some((unit) => unit.id === rootUnit.id));
  assert.ok(overview.data.rosterGroups.some((group) => group.unit.id === childUnit.id));
  assert.equal(
    overview.data.rosterGroups.some((group) => group.unit.id === teamUnit.id),
    false,
  );
  const squadGroup = overview.data.rosterGroups.find((group) => group.unit.id === squadUnit.id);
  assert.ok(squadGroup);
  assert.deepEqual(
    squadGroup.members.map((member) => member.id),
    [squadMember.profile.id, teamMember.profile.id],
  );
  assert.equal(
    squadGroup.members.find((member) => member.id === teamMember.profile.id)?.teamLabel,
    "A",
  );
  assert.equal(overview.data.strengthRows.find((row) => row.id === rootMos.id)?.assigned, 4);

  const globalOverview = await getStaffUnitOverview(prisma, commandStaff);
  assert.equal(globalOverview.ok, true);
  assert.ok(globalOverview.data.roots.some((unit) => unit.id === rootUnit.id));
  assert.ok(globalOverview.data.roots.some((unit) => unit.key === "tf20_1rrc"));

  const updatedSlots = await updateUnitMOSSlots({
    prisma,
    actor: unitStaff,
    unitId: rootUnit.id,
    mosId: rootMos.id,
    authorizedSlots: 5,
  });
  assert.equal(updatedSlots.ok, true);
  assert.equal(updatedSlots.row.authorizedSlots, 5);

  const outsideRoot = await activeUnit("tf20_sfod_1a");
  const outsideMos = await recruitingMOSForUnit(outsideRoot.id);
  const deniedUpdate = await updateUnitMOSSlots({
    prisma,
    actor: unitStaff,
    unitId: outsideRoot.id,
    mosId: outsideMos.id,
    authorizedSlots: 1,
  });
  assert.equal(deniedUpdate.ok, false);
  assert.equal(deniedUpdate.code, "permission_denied");
});

test("application detail preserves full discord join and leave cycles in order", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const created = await createTargetUnitReviewApplication({
    targetUnit,
    applicationUnit: targetUnit,
    preferredName: "Discord History Applicant",
  });
  const discordIdentity = created.pending.authIdentities[0];

  for (const event of [
    {
      eventId: uniqueKey("discord-join"),
      eventType: "join",
      occurredAt: "2026-06-18T00:00:00.000Z",
    },
    {
      eventId: uniqueKey("discord-leave"),
      eventType: "leave",
      occurredAt: "2026-06-19T00:00:00.000Z",
    },
    {
      eventId: uniqueKey("discord-rejoin"),
      eventType: "join",
      occurredAt: "2026-06-20T00:00:00.000Z",
    },
  ]) {
    const result = await ingestDiscordMembershipEvent({
      prisma,
      config: TEST_DISCORD_CONFIG,
      payload: {
        ...event,
        discordUserId: discordIdentity.providerAccountId,
        guildId: TEST_DISCORD_GUILD_ID,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.created, true);
  }

  const detail = await getApplicationById(prisma, created.application.id);
  const discordEntries = detail.statusHistory.filter((entry) =>
    ["Discord Server - Join", "Discord Server - Left"].includes(entry.displayLabel),
  );
  assert.deepEqual(
    discordEntries.map((entry) => entry.displayLabel),
    ["Discord Server - Join", "Discord Server - Left", "Discord Server - Join"],
  );
  assert.deepEqual(
    discordEntries.map((entry) => new Date(entry.createdAt).toISOString()),
    ["2026-06-18T00:00:00.000Z", "2026-06-19T00:00:00.000Z", "2026-06-20T00:00:00.000Z"],
  );
});

test("discord membership ingest is idempotent by external event ID", async () => {
  const pending = await createAccountWithRole("pending-user", "Pending");
  const payload = {
    eventId: uniqueKey("discord-idempotent"),
    eventType: "join",
    discordUserId: pending.authIdentities[0].providerAccountId,
    guildId: TEST_DISCORD_GUILD_ID,
    occurredAt: "2026-06-21T12:00:00.000Z",
  };

  const first = await ingestDiscordMembershipEvent({
    prisma,
    config: TEST_DISCORD_CONFIG,
    payload,
  });
  assert.equal(first.ok, true);
  assert.equal(first.created, true);

  const second = await ingestDiscordMembershipEvent({
    prisma,
    config: TEST_DISCORD_CONFIG,
    payload,
  });
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(
    await prisma.discordMembershipEvent.count({
      where: { externalEventId: payload.eventId },
    }),
    1,
  );
});

test("discord guild join creates a pending account and admin user record", async () => {
  const discordUserId = uniqueKey("discord-prelogin");
  const ingested = await ingestDiscordMembershipEvent({
    prisma,
    config: TEST_DISCORD_CONFIG,
    payload: {
      eventId: uniqueKey("discord-prelogin-join"),
      eventType: "join",
      discordUserId,
      guildId: TEST_DISCORD_GUILD_ID,
      occurredAt: "2026-06-17T09:30:00.000Z",
    },
  });
  assert.equal(ingested.ok, true);
  assert.ok(ingested.event.accountId);
  assert.equal(ingested.pendingAccountCreated, true);

  const createdAccount = await prisma.account.findUniqueOrThrow({
    where: { id: ingested.event.accountId },
    include: {
      authIdentities: true,
      roleAssignments: {
        where: { endsAt: null },
        include: { role: true },
      },
    },
  });
  assert.equal(createdAccount.status, "Pending");
  assert.equal(
    createdAccount.authIdentities.some(
      (identity) => identity.provider === "Discord" && identity.providerAccountId === discordUserId,
    ),
    true,
  );
  assert.equal(
    createdAccount.roleAssignments.some((assignment) => assignment.role.key === "pending-user"),
    true,
  );

  const admin = await createAccountWithRole("system-admin", "Active");
  const list = await listAdminUserRecords(prisma, admin);
  assert.equal(list.ok, true);
  assert.equal(
    list.items.some((item) => item.id === createdAccount.id),
    true,
  );

  const resolved = await resolveAuthenticatedAccount({
    prisma,
    discordUser: {
      id: discordUserId,
      username: "prelogin-user",
      global_name: "Prelogin User",
    },
    guildPayload: { joined_at: "2026-06-17T09:30:00.000Z" },
    approvedGuildId: TEST_DISCORD_GUILD_ID,
  });
  assert.equal(resolved.created, false);
  assert.equal(resolved.account.id, createdAccount.id);

  const linkedEvent = await prisma.discordMembershipEvent.findUniqueOrThrow({
    where: { id: ingested.event.id },
  });
  assert.equal(linkedEvent.accountId, resolved.account.id);
  assert.equal(
    await prisma.discordMembershipEvent.count({
      where: { providerAccountId: discordUserId, eventType: "Join" },
    }),
    1,
  );
});

test("unattached discord leave events link to the account after first oauth", async () => {
  const discordUserId = uniqueKey("discord-prelogin-leave");
  const ingested = await ingestDiscordMembershipEvent({
    prisma,
    config: TEST_DISCORD_CONFIG,
    payload: {
      eventId: uniqueKey("discord-prelogin-leave"),
      eventType: "leave",
      discordUserId,
      guildId: TEST_DISCORD_GUILD_ID,
      occurredAt: "2026-06-17T09:30:00.000Z",
    },
  });
  assert.equal(ingested.ok, true);
  assert.equal(ingested.event.accountId, null);

  const resolved = await resolveAuthenticatedAccount({
    prisma,
    discordUser: {
      id: discordUserId,
      username: "prelogin-leave-user",
      global_name: "Prelogin Leave User",
    },
    guildPayload: { joined_at: "2026-06-17T09:30:00.000Z" },
    approvedGuildId: TEST_DISCORD_GUILD_ID,
  });

  const linkedEvent = await prisma.discordMembershipEvent.findUniqueOrThrow({
    where: { id: ingested.event.id },
  });
  assert.equal(linkedEvent.accountId, resolved.account.id);
});

test("explicit discord join events suppress oauth fallback join creation", async () => {
  const member = await createActivePersonnel("Explicit Join Member");
  const identity = member.account.authIdentities[0];

  const ingested = await ingestDiscordMembershipEvent({
    prisma,
    config: TEST_DISCORD_CONFIG,
    payload: {
      eventId: uniqueKey("discord-explicit-join"),
      eventType: "join",
      discordUserId: identity.providerAccountId,
      guildId: TEST_DISCORD_GUILD_ID,
      occurredAt: "2026-06-13T00:00:00.000Z",
    },
  });
  assert.equal(ingested.ok, true);

  const resolved = await resolveAuthenticatedAccount({
    prisma,
    discordUser: {
      id: identity.providerAccountId,
      username: "explicit-join",
      global_name: "Explicit Join",
    },
    guildPayload: { joined_at: "2026-06-13T00:00:00.000Z" },
    approvedGuildId: TEST_DISCORD_GUILD_ID,
  });

  assert.equal(resolved.created, false);
  assert.equal(
    await prisma.discordMembershipEvent.count({
      where: { providerAccountId: identity.providerAccountId, eventType: "Join" },
    }),
    1,
  );
});

test("application detail falls back to discord joined_at metadata when no join log exists", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const created = await createTargetUnitReviewApplication({
    targetUnit,
    applicationUnit: targetUnit,
    preferredName: "Discord Metadata Applicant",
  });

  const discordIdentity = await prisma.authIdentity.findFirstOrThrow({
    where: {
      accountId: created.pending.id,
      provider: "Discord",
    },
  });

  await prisma.authIdentity.update({
    where: { id: discordIdentity.id },
    data: {
      metadata: {
        joined_at: "2026-06-20T14:30:00.000Z",
      },
    },
  });

  const detail = await getApplicationById(prisma, created.application.id);
  const joinEntry = detail.statusHistory.find(
    (entry) => entry.displayLabel === "Discord Server - Join",
  );
  assert.ok(joinEntry);
  assert.equal(new Date(joinEntry.createdAt).toISOString(), "2026-06-20T14:30:00.000Z");
});

test("discord membership backfill creates pending accounts for legacy unattached join events", async () => {
  const providerAccountId = uniqueKey("discord-backfill");
  await prisma.discordMembershipEvent.createMany({
    data: [
      {
        externalEventId: uniqueKey("discord-backfill-join"),
        providerAccountId,
        accountId: null,
        guildId: TEST_DISCORD_GUILD_ID,
        eventType: "Join",
        source: "BotBridge",
        username: "backfill-user",
        displayName: "Backfill User",
        occurredAt: new Date("2026-06-12T00:00:00.000Z"),
      },
      {
        externalEventId: uniqueKey("discord-backfill-leave"),
        providerAccountId,
        accountId: null,
        guildId: TEST_DISCORD_GUILD_ID,
        eventType: "Leave",
        source: "BotBridge",
        username: "backfill-user",
        displayName: "Backfill User",
        occurredAt: new Date("2026-06-13T00:00:00.000Z"),
      },
    ],
  });

  const dryRun = await backfillPendingDiscordAccountsFromMembershipEvents({ prisma, apply: false });
  assert.equal(dryRun.creatableAccountCount >= 1, true);

  const applied = await backfillPendingDiscordAccountsFromMembershipEvents({ prisma, apply: true });
  assert.equal(applied.appliedAccountsCreated >= 1, true);
  assert.equal(applied.appliedEventsAttached >= 2, true);

  const createdIdentity = await prisma.authIdentity.findUniqueOrThrow({
    where: {
      provider_providerAccountId: {
        provider: "Discord",
        providerAccountId,
      },
    },
    include: {
      account: {
        include: {
          roleAssignments: {
            where: { endsAt: null },
            include: { role: true },
          },
        },
      },
    },
  });
  assert.equal(createdIdentity.account.status, "Pending");
  assert.equal(
    createdIdentity.account.roleAssignments.some(
      (assignment) => assignment.role.key === "pending-user",
    ),
    true,
  );
  assert.equal(
    await prisma.discordMembershipEvent.count({
      where: { providerAccountId, accountId: createdIdentity.accountId },
    }),
    2,
  );
});

test("current discord guild roster backfill creates pending accounts and refreshes existing members", async () => {
  const providerAccountId = uniqueKey("discord-current-member");
  const activeMember = await createActivePersonnel("Guild Roster Refresh");
  const activeIdentity = activeMember.account.authIdentities[0];
  const admin = await createAccountWithRole("system-admin", "Active");

  await prisma.authIdentity.update({
    where: { id: activeIdentity.id },
    data: {
      username: "stale-user",
      displayName: "Stale Display",
      unlinkedAt: new Date("2026-01-01T00:00:00.000Z"),
      lastGuildVerifiedAt: null,
      metadata: null,
    },
  });

  const listMembers = async () => [
    {
      providerAccountId,
      guildId: TEST_DISCORD_GUILD_ID,
      username: "current-user",
      displayName: "Current User",
      serverNickname: "Roster Nick",
      joinedAt: "2026-06-01T00:00:00.000Z",
      isBot: false,
    },
    {
      providerAccountId: activeIdentity.providerAccountId,
      guildId: TEST_DISCORD_GUILD_ID,
      username: "refreshed-user",
      displayName: "Refreshed User",
      serverNickname: "Refreshed Nick",
      joinedAt: "2026-05-01T00:00:00.000Z",
      isBot: false,
    },
    {
      providerAccountId: uniqueKey("discord-current-bot"),
      guildId: TEST_DISCORD_GUILD_ID,
      username: "bot-user",
      displayName: "Bot User",
      joinedAt: "2026-06-02T00:00:00.000Z",
      isBot: true,
    },
  ];

  const dryRun = await backfillCurrentDiscordGuildMembers({
    prisma,
    config: TEST_DISCORD_CONFIG,
    apply: false,
    listMembers,
  });
  assert.equal(dryRun.guildMemberCount, 3);
  assert.equal(dryRun.skippedBotCount, 1);
  assert.equal(dryRun.creatableAccountCount, 1);
  assert.equal(dryRun.refreshOnlyCount, 1);
  assert.equal(dryRun.joinEventCreateCount, 2);

  const applied = await backfillCurrentDiscordGuildMembers({
    prisma,
    config: TEST_DISCORD_CONFIG,
    apply: true,
    listMembers,
  });
  assert.equal(applied.appliedAccountsCreated, 1);
  assert.equal(applied.appliedJoinEventsCreated, 2);

  const createdIdentity = await prisma.authIdentity.findUniqueOrThrow({
    where: {
      provider_providerAccountId: {
        provider: "Discord",
        providerAccountId,
      },
    },
    include: {
      account: true,
    },
  });
  assert.equal(createdIdentity.account.status, "Pending");

  const refreshedIdentity = await prisma.authIdentity.findUniqueOrThrow({
    where: { id: activeIdentity.id },
  });
  assert.equal(refreshedIdentity.unlinkedAt, null);
  assert.equal(refreshedIdentity.username, "refreshed-user");
  assert.equal(refreshedIdentity.displayName, "Refreshed User");
  assert.equal(refreshedIdentity.metadata.joined_at, "2026-05-01T00:00:00.000Z");

  const list = await listAdminUserRecords(prisma, admin);
  assert.equal(list.ok, true);
  assert.equal(
    list.items.some((item) => item.id === createdIdentity.accountId),
    true,
  );

  const reapplied = await backfillCurrentDiscordGuildMembers({
    prisma,
    config: TEST_DISCORD_CONFIG,
    apply: true,
    listMembers,
  });
  assert.equal(reapplied.appliedAccountsCreated, 0);
  assert.equal(reapplied.appliedJoinEventsCreated, 0);
  assert.equal(
    await prisma.account.count({
      where: {
        authIdentities: {
          some: {
            provider: "Discord",
            providerAccountId,
          },
        },
      },
    }),
    1,
  );
});

test("application availability selections persist and appear in review detail", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const created = await createTargetUnitReviewApplication({
    targetUnit,
    applicationUnit: targetUnit,
    preferredName: "Availability Review Applicant",
  });

  const detail = await getApplicationById(prisma, created.application.id);
  assert.deepEqual(
    detail.availabilitySlots.map((entry) => entry.slotKey),
    ["tuesday_evenings", "thursday_evenings"],
  );
  assert.deepEqual(
    detail.availabilitySlots.map((entry) => entry.slotLabel),
    ["Tuesday Evenings (19:00 CST - 23:00 CST)", "Thursday Evenings (19:00 CST - 23:00 CST)"],
  );
});

test("public unit openings only include units with open MOS slots", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const childUnit = await activeUnit("tf20_ranger_a_1p");
  const rootMos = await recruitingMOSForUnit(rootUnit.id);
  const member = await createActivePersonnel("Openings Scope");

  await prisma.personnelProfile.update({
    where: { id: member.profile.id },
    data: {
      currentUnitId: childUnit.id,
      currentMOSId: rootMos.id,
    },
  });

  await prisma.mOS.update({
    where: { id: rootMos.id },
    data: { authorizedSlots: 0 },
  });

  const closedOpenings = await listPublicUnitOpenings(prisma);
  assert.equal(closedOpenings.ok, true);
  assert.equal(
    closedOpenings.items.some((group) => group.unit.id === rootUnit.id),
    false,
  );

  await prisma.mOS.update({
    where: { id: rootMos.id },
    data: { authorizedSlots: 99 },
  });

  const openOpenings = await listPublicUnitOpenings(prisma);
  assert.equal(openOpenings.ok, true);
  const rootGroup = openOpenings.items.find((group) => group.unit.id === rootUnit.id);
  assert.ok(rootGroup);
  assert.ok(rootGroup.mos.some((row) => row.id === rootMos.id));
});

test("target-unit acceptance is denied outside scope and allowed inside scope", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const outsideUnit = await activeUnit("tf20_ranger_a_1p");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const recruiter = await createAccountWithRole("recruiter", "Active");
  const outsideReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: outsideUnit.id,
  });
  const insideReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const body = await applicationBody(targetUnit.id, "Scoped Recruit");
  await agreeToCurrentIntakeDocuments(pending);
  const submitted = await submitOwnApplication({ prisma, account: pending, body });
  assert.equal(submitted.ok, true);

  const claimed = await claimApplication({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
  });
  assert.equal(claimed.ok, true);

  const recommended = await recommendApplication({
    prisma,
    actor: recruiter,
    applicationId: submitted.application.id,
    targetUnitId: targetUnit.id,
  });
  assert.equal(recommended.ok, true);
  assert.equal(recommended.application.status, "TargetUnitReview");
  assert.equal(recommended.application.targetUnitId, targetUnit.id);

  const outsideAcceptance = await acceptApplication({
    prisma,
    actor: outsideReviewer,
    applicationId: submitted.application.id,
    reason: "Integration out-of-scope acceptance.",
  });
  assert.equal(outsideAcceptance.ok, false);
  assert.equal(outsideAcceptance.code, "permission_denied");

  const insideAcceptance = await acceptApplication({
    prisma,
    actor: insideReviewer,
    applicationId: submitted.application.id,
    reason: "Integration in-scope acceptance.",
  });
  assert.equal(insideAcceptance.ok, true);
  assert.equal(insideAcceptance.application.status, "Converted");
});

test("staff applicant review is scoped and supports notes, request-info, and acceptance", async () => {
  const parentUnit = await activeUnit("tf20_ranger_a");
  const targetUnit = await activeUnit("tf20_ranger_a_1p");
  const outsideUnit = await activeUnit("tf20_ranger_a_1p_1s");
  const insideReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: parentUnit.id,
  });
  const outsideReviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: outsideUnit.id,
  });
  const { application, body, pending } = await createTargetUnitReviewApplication({
    targetUnit,
    applicationUnit: parentUnit,
    preferredName: "Staff Review",
  });

  const insideQueue = await listUnitReviewQueue(prisma, insideReviewer);
  assert.ok(insideQueue.some((item) => item.id === application.id));

  const outsideQueue = await listUnitReviewQueue(prisma, outsideReviewer);
  assert.equal(
    outsideQueue.some((item) => item.id === application.id),
    false,
  );

  const outsideNote = await saveApplicationUnitReviewNote({
    prisma,
    actor: outsideReviewer,
    applicationId: application.id,
    body: "Out-of-scope note.",
  });
  assert.equal(outsideNote.ok, false);
  assert.equal(outsideNote.code, "permission_denied");

  const outsideRequest = await requestApplicationInfoFromUnit({
    prisma,
    actor: outsideReviewer,
    applicationId: application.id,
    reason: "Out-of-scope request.",
  });
  assert.equal(outsideRequest.ok, false);
  assert.equal(outsideRequest.code, "permission_denied");

  const outsideAccept = await acceptApplication({
    prisma,
    actor: outsideReviewer,
    applicationId: application.id,
    reason: "Out-of-scope acceptance.",
  });
  assert.equal(outsideAccept.ok, false);
  assert.equal(outsideAccept.code, "permission_denied");

  const outsideReject = await rejectApplication({
    prisma,
    actor: outsideReviewer,
    applicationId: application.id,
    reason: "Out-of-scope reject.",
  });
  assert.equal(outsideReject.ok, false);
  assert.equal(outsideReject.code, "permission_denied");

  const savedNote = await saveApplicationUnitReviewNote({
    prisma,
    actor: insideReviewer,
    applicationId: application.id,
    body: "Unit staff note.",
  });
  assert.equal(savedNote.ok, true);
  assert.equal(savedNote.application.notes.at(-1).stage, "TargetUnitReview");
  assert.equal(savedNote.application.notes.at(-1).body, "Unit staff note.");

  const infoRequested = await requestApplicationInfoFromUnit({
    prisma,
    actor: insideReviewer,
    applicationId: application.id,
    reason: "Unit needs more information.",
  });
  assert.equal(infoRequested.ok, true);
  assert.equal(infoRequested.application.status, "MoreInfoRequested");
  assert.equal(infoRequested.application.statusHistory.at(-1).stage, "TargetUnitReview");

  const resubmitted = await submitOwnApplication({
    prisma,
    account: pending,
    body: { ...body, reasonForJoining: "Updated unit review response." },
  });
  assert.equal(resubmitted.ok, true);
  assert.equal(resubmitted.application.status, "TargetUnitReview");
  assert.equal(resubmitted.application.targetUnitId, targetUnit.id);

  const accepted = await acceptApplication({
    prisma,
    actor: insideReviewer,
    applicationId: application.id,
    reason: "Unit staff acceptance.",
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.application.status, "Converted");

  const profile = await prisma.personnelProfile.findUniqueOrThrow({
    where: { id: accepted.application.convertedProfileId },
  });
  assert.equal(profile.currentUnitId, targetUnit.id);
});

test("staff applicant review can reject an in-scope target-unit application", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const reviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const { application } = await createTargetUnitReviewApplication({
    targetUnit,
    applicationUnit: targetUnit,
    preferredName: "Staff Reject",
  });

  const rejected = await rejectApplication({
    prisma,
    actor: reviewer,
    applicationId: application.id,
    reason: "Unit staff rejection.",
  });
  assert.equal(rejected.ok, true);
  assert.equal(rejected.application.status, "Denied");
});

test("personnel updates require reason, enforce MOS/name fields, and reject low-rank billet assignment", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const otherUnit = await activeUnit("tf20_soar_b160");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const reviewer = await createAccountWithRole("unit-staff", "Active");
  const application = await createConvertedApplication({
    pending,
    reviewer,
    targetUnit,
    preferredName: "Falcon One",
  });
  const profile = await prisma.personnelProfile.findUniqueOrThrow({
    where: { id: application.convertedProfileId },
  });

  const rank = await prisma.rank.findFirstOrThrow({
    where: { status: "Active" },
    orderBy: { precedence: "asc" },
  });
  const mos = await recruitingMOSForUnit(targetUnit.id);
  const outsideMos = await recruitingMOSForUnit(otherUnit.id);

  const missingReason = await updatePersonnelProfile({
    prisma,
    actor: reviewer,
    personnelProfileId: profile.id,
    body: {
      name: "Falcon",
      status: "Recruit",
      currentUnitId: targetUnit.id,
      currentRankId: rank.id,
      currentBilletId: "",
      currentMOSId: mos.id,
    },
  });

  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.code, "validation_error");

  const updated = await updatePersonnelProfile({
    prisma,
    actor: reviewer,
    personnelProfileId: profile.id,
    body: {
      name: "Falcon Two",
      status: "Active",
      currentUnitId: targetUnit.id,
      currentRankId: rank.id,
      currentBilletId: "",
      currentMOSId: mos.id,
      reason: "Integration personnel update.",
    },
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.profile.name, "Falcon Two");
  assert.equal(updated.profile.currentMOSId, mos.id);
  assert.equal(updated.profile.goodStanding, true);
  assert.equal(
    await prisma.personnelMOSHistory.count({
      where: { personnelProfileId: profile.id, mosId: mos.id },
    }),
    1,
  );

  const invalidMos = await updatePersonnelProfile({
    prisma,
    actor: reviewer,
    personnelProfileId: profile.id,
    body: {
      name: "Falcon Invalid",
      status: "Active",
      currentUnitId: targetUnit.id,
      currentRankId: rank.id,
      currentBilletId: "",
      currentMOSId: outsideMos.id,
      reason: "Integration invalid MOS check.",
    },
  });

  assert.equal(invalidMos.ok, false);
  assert.equal(invalidMos.code, "validation_error");
  assert.match(invalidMos.message, /primary MOS does not belong/i);

  const billet = await prisma.billet.findFirstOrThrow({
    where: {
      status: "Active",
      minimumRankId: { not: null },
      unitId: targetUnit.id,
    },
    include: { minimumRank: true },
    orderBy: { commandPrecedence: "desc" },
  });
  const lowRank = await prisma.rank.findFirstOrThrow({
    where: { status: "Active", precedence: { lt: billet.minimumRank.precedence } },
    orderBy: { precedence: "asc" },
  });

  const lowRankBillet = await updatePersonnelProfile({
    prisma,
    actor: reviewer,
    personnelProfileId: profile.id,
    body: {
      name: "Falcon Three",
      status: "Active",
      currentUnitId: billet.unitId,
      currentRankId: lowRank.id,
      currentBilletId: billet.id,
      currentMOSId: mos.id,
      reason: "Integration low-rank billet check.",
    },
  });

  assert.equal(lowRankBillet.ok, false);
  assert.equal(lowRankBillet.code, "validation_error");
  assert.match(lowRankBillet.message, /requires rank/);
});

test("personnel edit options expose scoped human-readable dropdown choices", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const targetUnit = await activeUnit("tf20_ranger_a_1p");
  const reviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });

  const result = await getPersonnelEditOptions(prisma, reviewer);

  assert.equal(result.ok, true);
  assert.ok(result.options.units.some((unit) => unit.id === targetUnit.id));
  assert.ok(result.options.ranks.every((rank) => rank.name));
  assert.ok(result.options.billets.every((billet) => billet.name));
  assert.ok(result.options.mos.every((mos) => mos.name || mos.identifier));
  assert.ok(result.options.billetOptionsByUnitId[targetUnit.id]?.length > 0);
  assert.ok(
    result.options.billetOptionsByUnitId[targetUnit.id].some(
      (billet) => billet.unitId === rootUnit.id,
    ),
  );
  assert.ok(
    result.options.mosOptionsByUnitId[targetUnit.id].every((mos) => mos.unitId === rootUnit.id),
  );
  assert.equal(result.options.standingOptions, undefined);
});

test("personnel standing is derived from status and discharged profiles drop off the roster", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const reviewer = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: targetUnit.id,
  });
  const target = await createAccountWithRole("member", "Active");
  const mos = await prisma.mOS.findFirstOrThrow({ where: { status: "Active" } });
  const rank = await prisma.rank.findFirstOrThrow({ where: { status: "Active" } });
  const profile = await prisma.personnelProfile.create({
    data: {
      accountId: target.id,
      name: "Standing Check",
      status: "Active",
      currentUnitId: targetUnit.id,
      currentRankId: rank.id,
      currentMOSId: mos.id,
      goodStanding: false,
    },
  });

  const awol = await updatePersonnelProfile({
    prisma,
    actor: reviewer,
    personnelProfileId: profile.id,
    body: {
      name: "Standing Check",
      status: "AWOL",
      currentUnitId: targetUnit.id,
      currentRankId: rank.id,
      currentBilletId: "",
      currentMOSId: mos.id,
      reason: "Mark AWOL.",
    },
  });
  assert.equal(awol.ok, true);
  assert.equal(awol.profile.goodStanding, false);

  const discharged = await updatePersonnelProfile({
    prisma,
    actor: reviewer,
    personnelProfileId: profile.id,
    body: {
      name: "Standing Check",
      status: "HonorableDischarge",
      currentUnitId: targetUnit.id,
      currentRankId: rank.id,
      currentBilletId: "",
      currentMOSId: mos.id,
      reason: "Discharge member.",
    },
  });
  assert.equal(discharged.ok, true);
  assert.equal(discharged.profile.goodStanding, true);

  const roster = await listScopedPersonnel(prisma, reviewer);
  assert.equal(roster.ok, true);
  assert.equal(
    roster.items.some((item) => item.id === profile.id),
    false,
  );
});

test("unit-staff personnel scope ignores unrelated global member assignments", async () => {
  const assignedUnit = await activeUnit("tf20_ranger_a_1p");
  const descendantUnit = await activeUnit("tf20_ranger_a_1p_1s");
  const outsideUnit = await activeUnit("tf20_ranger_a");
  const actor = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: assignedUnit.id,
  });
  const memberRole = await prisma.role.findUniqueOrThrow({ where: { key: "member" } });
  await prisma.roleAssignment.create({
    data: {
      accountId: actor.id,
      roleId: memberRole.id,
      scopeType: "Global",
      scopeIncludesDescendants: true,
      reason: "Baseline member access.",
    },
  });
  const insideAccount = await createAccountWithRole("member", "Active");
  const outsideAccount = await createAccountWithRole("member", "Active");
  const insideProfile = await prisma.personnelProfile.create({
    data: {
      accountId: insideAccount.id,
      name: "Scoped Inside",
      status: "Active",
      currentUnitId: descendantUnit.id,
    },
  });
  const outsideProfile = await prisma.personnelProfile.create({
    data: {
      accountId: outsideAccount.id,
      name: "Scoped Outside",
      status: "Active",
      currentUnitId: outsideUnit.id,
    },
  });

  const refreshedActor = await prisma.account.findUniqueOrThrow({
    where: { id: actor.id },
    include: {
      authIdentities: true,
      roleAssignments: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const scoped = await listScopedPersonnel(prisma, refreshedActor);
  assert.equal(scoped.ok, true);
  assert.equal(
    scoped.items.some((item) => item.id === insideProfile.id),
    true,
  );
  assert.equal(
    scoped.items.some((item) => item.id === outsideProfile.id),
    false,
  );
});

test("system admins manage audited roles with member and unit-scope safeguards", async () => {
  const unit = await activeUnit("tf20_ranger_a");
  const admin = await createAccountWithRole("system-admin", "Active");
  const unauthorized = await createAccountWithRole("member", "Active");
  const target = await createAccountWithRole(null, "Active");
  await prisma.personnelProfile.create({
    data: {
      accountId: target.id,
      name: "Role Target",
      status: "Active",
      currentUnitId: unit.id,
    },
  });

  const options = await listRoleManagementOptions(prisma, admin);
  assert.equal(options.ok, true);
  assert.ok(options.accounts.some((account) => account.id === target.id));

  const denied = await listRoleManagementOptions(prisma, unauthorized);
  assert.equal(denied.ok, false);
  assert.equal(denied.code, "permission_denied");

  const recruiterRole = await prisma.role.findUniqueOrThrow({ where: { key: "recruiter" } });
  const unitStaffRole = await prisma.role.findUniqueOrThrow({ where: { key: "unit-staff" } });
  const missingReason = await assignAccountRole({
    prisma,
    actor: admin,
    accountId: target.id,
    roleId: recruiterRole.id,
    reason: "",
  });
  assert.equal(missingReason.ok, false);
  assert.equal(missingReason.code, "validation_error");

  const recruiterAssignment = await assignAccountRole({
    prisma,
    actor: admin,
    accountId: target.id,
    roleId: recruiterRole.id,
    reason: "Assign recruiting duties.",
  });
  assert.equal(recruiterAssignment.ok, true);
  assert.deepEqual(
    recruiterAssignment.account.roleAssignments.map((assignment) => assignment.role.key).sort(),
    ["member", "recruiter"],
  );

  const scopedAssignment = await assignAccountRole({
    prisma,
    actor: admin,
    accountId: target.id,
    roleId: unitStaffRole.id,
    reason: "Assign unit staff duties.",
  });
  assert.equal(scopedAssignment.ok, true);
  const unitStaff = scopedAssignment.account.roleAssignments.find(
    (assignment) => assignment.role.key === "unit-staff",
  );
  assert.equal(unitStaff.scopeType, "Unit");
  assert.equal(unitStaff.unitId, unit.id);
  assert.equal(unitStaff.scopeIncludesDescendants, true);

  const member = scopedAssignment.account.roleAssignments.find(
    (assignment) => assignment.role.key === "member",
  );
  const blockedMemberRemoval = await removeAccountRole({
    prisma,
    actor: admin,
    accountId: target.id,
    assignmentId: member.id,
    reason: "Try to remove member baseline.",
  });
  assert.equal(blockedMemberRemoval.ok, false);
  assert.equal(blockedMemberRemoval.code, "invalid_transition");

  const recruiter = scopedAssignment.account.roleAssignments.find(
    (assignment) => assignment.role.key === "recruiter",
  );
  const removed = await removeAccountRole({
    prisma,
    actor: admin,
    accountId: target.id,
    assignmentId: recruiter.id,
    reason: "Recruiting duties ended.",
  });
  assert.equal(removed.ok, true);
  assert.equal(
    removed.account.roleAssignments.some((assignment) => assignment.role.key === "recruiter"),
    false,
  );
  assert.ok(
    await prisma.auditLog.findFirst({
      where: { targetAccountId: target.id, action: "remove-role" },
    }),
  );
});

test("unit-scoped roles follow personnel unit changes", async () => {
  const firstUnit = await activeUnit("tf20_ranger_a");
  const nextUnit = await activeUnit("tf20_ranger_a_1p");
  const admin = await createAccountWithRole("system-admin", "Active");
  const personnelActor = await createAccountWithRole("command-staff", "Active");
  const target = await createAccountWithRole("member", "Active");
  const profile = await prisma.personnelProfile.create({
    data: {
      accountId: target.id,
      name: "Scope Follow",
      status: "Active",
      currentUnitId: firstUnit.id,
    },
  });
  const trainerRole = await prisma.role.findUniqueOrThrow({ where: { key: "trainer" } });
  const assigned = await assignAccountRole({
    prisma,
    actor: admin,
    accountId: target.id,
    roleId: trainerRole.id,
    reason: "Assign trainer duties.",
  });
  assert.equal(assigned.ok, true);

  const updated = await updatePersonnelProfile({
    prisma,
    actor: personnelActor,
    personnelProfileId: profile.id,
    body: {
      name: profile.name,
      status: "Active",
      currentUnitId: nextUnit.id,
      currentRankId: "",
      currentBilletId: "",
      currentMOSId: "",
      currentSecondaryMOSId: "",
      reason: "Transfer trainer to new unit.",
    },
  });
  assert.equal(updated.ok, true);

  const refreshed = await getRoleManagementAccount(prisma, admin, target.id);
  const trainer = refreshed.account.roleAssignments.find(
    (assignment) => assignment.role.key === "trainer",
  );
  assert.equal(trainer.unitId, nextUnit.id);
  assert.equal(
    await prisma.roleAssignment.count({
      where: { accountId: target.id, roleId: trainerRole.id, endsAt: { not: null } },
    }),
    1,
  );
});

test("the final active system admin assignment is protected", async () => {
  const admin = await createAccountWithRole("system-admin", "Active");
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { key: "system-admin" } });
  await prisma.account.updateMany({
    where: {
      id: { not: admin.id },
      roleAssignments: { some: { roleId: adminRole.id, endsAt: null } },
    },
    data: { status: "Disabled" },
  });
  const assignment = await prisma.roleAssignment.findFirstOrThrow({
    where: { accountId: admin.id, roleId: adminRole.id, endsAt: null },
  });

  const result = await removeAccountRole({
    prisma,
    actor: admin,
    accountId: admin.id,
    assignmentId: assignment.id,
    reason: "Attempt final admin removal.",
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_transition");
});

test("system admins manage account-first admin user records with notes and status history", async () => {
  const admin = await createAccountWithRole("system-admin", "Active");
  const unauthorized = await createAccountWithRole("member", "Active");

  const freshDiscordOnly = await createAccountWithRole("pending-user", "Pending");
  const draftDiscordOnly = await createAccountWithRole("pending-user", "Pending");
  const submittedDiscordOnly = await createAccountWithRole("pending-user", "Pending");
  const closedDiscordOnly = await createAccountWithRole("pending-user", "Pending");
  const dischargedAccount = await createAccountWithRole("member", "Active");
  const awolAccount = await createAccountWithRole("member", "Active");
  const editablePersonnelAccount = await createAccountWithRole("member", "Active");

  await prisma.application.create({
    data: {
      accountId: draftDiscordOnly.id,
      status: "Draft",
      formVersion: "enlistment-v4",
    },
  });
  await prisma.application.create({
    data: {
      accountId: submittedDiscordOnly.id,
      status: "Submitted",
      formVersion: "enlistment-v4",
      submittedAt: new Date(),
    },
  });
  await prisma.application.create({
    data: {
      accountId: closedDiscordOnly.id,
      status: "Closed",
      formVersion: "enlistment-v4",
      closedAt: new Date(),
    },
  });

  await prisma.personnelProfile.create({
    data: {
      accountId: dischargedAccount.id,
      name: "Discharged Account",
      status: "HonorableDischarge",
      goodStanding: true,
    },
  });
  await prisma.personnelProfile.create({
    data: {
      accountId: awolAccount.id,
      name: "Awol Account",
      status: "AWOL",
      goodStanding: false,
    },
  });
  const editableProfile = await prisma.personnelProfile.create({
    data: {
      accountId: editablePersonnelAccount.id,
      name: "Editable Personnel",
      status: "Active",
      goodStanding: true,
    },
  });

  const deniedList = await listAdminUserRecords(prisma, unauthorized);
  assert.equal(deniedList.ok, false);
  assert.equal(deniedList.code, "permission_denied");

  const list = await listAdminUserRecords(prisma, admin);
  assert.equal(list.ok, true);
  assert.equal(
    list.items.some((item) => item.id === freshDiscordOnly.id),
    true,
  );
  assert.equal(
    list.items.some((item) => item.id === draftDiscordOnly.id),
    true,
  );
  assert.equal(
    list.items.some((item) => item.id === closedDiscordOnly.id),
    true,
  );
  assert.equal(
    list.items.some((item) => item.id === dischargedAccount.id),
    true,
  );
  assert.equal(
    list.items.some((item) => item.id === submittedDiscordOnly.id),
    false,
  );
  assert.equal(
    list.items.some((item) => item.id === awolAccount.id),
    false,
  );
  assert.equal(
    list.items.some((item) => item.id === editablePersonnelAccount.id),
    false,
  );

  const directDetail = await getAdminUserRecord(prisma, admin, submittedDiscordOnly.id);
  assert.equal(directDetail.ok, true);
  assert.equal(directDetail.record.latestApplication?.status, "Submitted");

  const lockedAccount = await updateAdminUserRecord({
    prisma,
    actor: admin,
    accountId: freshDiscordOnly.id,
    body: {
      accountStatus: "Locked",
      personnelStatus: "",
      reason: "Lock fresh Discord-only record.",
    },
  });
  assert.equal(lockedAccount.ok, true);
  assert.equal(lockedAccount.record.status, "Locked");
  assert.equal(lockedAccount.record.lockedAt instanceof Date, true);
  assert.equal(lockedAccount.record.personnelProfile, null);

  const firstNote = await saveAdminUserRecordNote({
    prisma,
    actor: admin,
    accountId: freshDiscordOnly.id,
    noteBody: "First admin note.",
  });
  assert.equal(firstNote.ok, true);
  const secondNote = await saveAdminUserRecordNote({
    prisma,
    actor: admin,
    accountId: freshDiscordOnly.id,
    noteBody: "Second admin note.",
  });
  assert.equal(secondNote.ok, true);
  assert.deepEqual(
    secondNote.record.adminNotes.map((note) => note.body),
    ["First admin note.", "Second admin note."],
  );

  const updatedPersonnel = await updateAdminUserRecord({
    prisma,
    actor: admin,
    accountId: editablePersonnelAccount.id,
    body: {
      accountStatus: "Disabled",
      personnelStatus: "Reserve",
      reason: "Move user out of active service.",
    },
  });
  assert.equal(updatedPersonnel.ok, true);
  assert.equal(updatedPersonnel.record.status, "Disabled");
  assert.equal(updatedPersonnel.record.personnelProfile.status, "Reserve");
  assert.equal(updatedPersonnel.record.personnelProfile.goodStanding, true);
  assert.ok(
    await prisma.personnelStatusHistory.findFirst({
      where: {
        personnelProfileId: editableProfile.id,
        newStatus: "Reserve",
      },
    }),
  );
});

test("trainer records pass/fail course sessions and owns corrections", async () => {
  const trainer = await createAccountWithRole("trainer", "Active");
  const otherTrainer = await createAccountWithRole("trainer", "Active");
  const passedMember = await createActivePersonnel("Training Pass Member");
  const failedMember = await createActivePersonnel("Training Fail Member");
  const qualification = await prisma.qualification.create({
    data: {
      key: uniqueKey("training-qual"),
      name: "Integration Training Qualification",
      status: "Active",
    },
  });
  const course = await prisma.trainingCourse.create({
    data: {
      key: uniqueKey("training-course"),
      name: "Integration Training Course",
      status: "Active",
    },
  });
  await prisma.courseQualification.create({
    data: {
      courseId: course.id,
      qualificationId: qualification.id,
    },
  });

  const created = await createTrainingSession({
    prisma,
    actor: trainer,
    body: {
      courseId: course.id,
      completedAt: "2026-06-13",
      notes: "Integration training session.",
      attendees: [
        { personnelProfileId: passedMember.profile.id, outcome: "Pass" },
        { personnelProfileId: failedMember.profile.id, outcome: "Fail", notes: "Retest needed." },
      ],
    },
  });

  assert.equal(created.ok, true);
  assert.equal(created.session.summary.total, 2);
  assert.equal(created.session.summary.passed, 1);
  assert.equal(created.session.summary.failed, 1);

  const passQualification = await prisma.personnelQualification.findUnique({
    where: {
      personnelProfileId_qualificationId: {
        personnelProfileId: passedMember.profile.id,
        qualificationId: qualification.id,
      },
    },
  });
  assert.equal(passQualification?.status, "Active");
  assert.ok(passQualification.trainingRecordId);

  const failQualification = await prisma.personnelQualification.findUnique({
    where: {
      personnelProfileId_qualificationId: {
        personnelProfileId: failedMember.profile.id,
        qualificationId: qualification.id,
      },
    },
  });
  assert.equal(failQualification, null);

  const passedHistory = await listOwnTrainingRecords(prisma, passedMember.account);
  const failedHistory = await listOwnTrainingRecords(prisma, failedMember.account);
  assert.equal(passedHistory.ok, true);
  assert.equal(failedHistory.ok, true);
  assert.equal(passedHistory.items[0].outcome, "Pass");
  assert.equal(failedHistory.items[0].outcome, "Fail");

  const blockedEdit = await updateTrainingSession({
    prisma,
    actor: otherTrainer,
    sessionId: created.session.id,
    body: {
      courseId: course.id,
      completedAt: "2026-06-13",
      attendees: [{ personnelProfileId: passedMember.profile.id, outcome: "Fail" }],
    },
  });
  assert.equal(blockedEdit.ok, false);
  assert.equal(blockedEdit.code, "permission_denied");

  const corrected = await updateTrainingSession({
    prisma,
    actor: trainer,
    sessionId: created.session.id,
    body: {
      courseId: course.id,
      completedAt: "2026-06-13",
      attendees: [
        { personnelProfileId: passedMember.profile.id, outcome: "Fail", notes: "Corrected." },
        { personnelProfileId: failedMember.profile.id, outcome: "Fail", notes: "Retest needed." },
      ],
    },
  });
  assert.equal(corrected.ok, true);
  assert.equal(corrected.session.summary.passed, 0);
  assert.equal(corrected.session.summary.failed, 2);

  const revokedQualification = await prisma.personnelQualification.findUnique({
    where: {
      personnelProfileId_qualificationId: {
        personnelProfileId: passedMember.profile.id,
        qualificationId: qualification.id,
      },
    },
  });
  assert.equal(revokedQualification?.status, "Revoked");

  const correctedHistory = await listOwnTrainingRecords(prisma, passedMember.account);
  assert.equal(correctedHistory.items.length, 1);
  assert.equal(correctedHistory.items[0].outcome, "Fail");
});

test("staff create events, members view them, and RSVP rules are enforced", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const otherUnit = await activeUnit("tf20_soar_b160");
  const staff = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: rootUnit.id,
  });
  const openMember = await createActivePersonnel("Open Event Member");
  const eligibleUnitMember = await createActivePersonnel("Eligible Unit Member");
  const outsider = await createActivePersonnel("Outside Unit Member");

  await assignPersonnelCurrentUnit(eligibleUnitMember.profile.id, rootUnit.id);
  await assignPersonnelCurrentUnit(outsider.profile.id, otherUnit.id);

  const openEvent = await createEvent({
    prisma,
    actor: staff,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Open Attendance Event",
      attendanceScope: "Open",
    }),
  });
  assert.equal(openEvent.ok, true);

  const visibleMonth = await listEventsForMonth(prisma, openMember.account, "2026-07");
  assert.equal(visibleMonth.ok, true);
  assert.equal(
    visibleMonth.items.some((item) => item.id === openEvent.event.id),
    true,
  );

  const openSignup = await signupForEvent({
    prisma,
    actor: openMember.account,
    eventId: openEvent.event.id,
  });
  assert.equal(openSignup.ok, true);

  const staffDetail = await getEventDetail(prisma, staff, openEvent.event.id);
  assert.equal(staffDetail.ok, true);
  assert.equal(staffDetail.event.signups.length, 1);
  assert.equal(staffDetail.event.signups[0].personnelProfileId, openMember.profile.id);

  const withdrawn = await withdrawFromEvent({
    prisma,
    actor: openMember.account,
    eventId: openEvent.event.id,
  });
  assert.equal(withdrawn.ok, true);
  assert.equal(withdrawn.event.signups.length, 0);

  const unitOnlyEvent = await createEvent({
    prisma,
    actor: staff,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Unit Only Event",
      attendanceScope: "UnitOnly",
      startsAt: "2026-07-13T19:00",
      endsAt: "2026-07-13T21:00",
    }),
  });
  assert.equal(unitOnlyEvent.ok, true);

  const eligibleSignup = await signupForEvent({
    prisma,
    actor: eligibleUnitMember.account,
    eventId: unitOnlyEvent.event.id,
  });
  assert.equal(eligibleSignup.ok, true);

  const blockedSignup = await signupForEvent({
    prisma,
    actor: outsider.account,
    eventId: unitOnlyEvent.event.id,
  });
  assert.equal(blockedSignup.ok, false);
  assert.equal(blockedSignup.code, "permission_denied");
});

test("global event managers receive root-unit event options", async () => {
  const globalStaff = await createAccountWithRole("unit-staff", "Active");

  const result = await getEventOptions(prisma, globalStaff);

  assert.equal(result.ok, true);
  assert.ok((result.options.units ?? []).length > 1);
  assert.equal(
    result.options.units.some((unit) => unit.name === "A Co, 1/75th Ranger Regiment"),
    true,
  );
});

test("unit server scheduling rejects overlaps and out-of-scope staff cannot change another unit event", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const otherUnit = await activeUnit("tf20_soar_b160");
  const owner = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: rootUnit.id,
  });
  const outsiderStaff = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: otherUnit.id,
  });

  const first = await createEvent({
    prisma,
    actor: owner,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Reserved Unit Server Window",
      location: "UnitServer",
      startsAt: "2026-07-14T19:00",
      endsAt: "2026-07-14T21:00",
    }),
  });
  assert.equal(first.ok, true);

  const overlapping = await createEvent({
    prisma,
    actor: owner,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Conflicting Unit Server Window",
      location: "UnitServer",
      startsAt: "2026-07-14T20:00",
      endsAt: "2026-07-14T22:00",
    }),
  });
  assert.equal(overlapping.ok, false);
  assert.equal(overlapping.code, "validation_error");

  const blockedUpdate = await updateEvent({
    prisma,
    actor: outsiderStaff,
    eventId: first.event.id,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Unauthorized Update",
      location: "Discord",
      startsAt: "2026-07-14T19:00",
      endsAt: "2026-07-14T21:00",
    }),
  });
  assert.equal(blockedUpdate.ok, false);
  assert.equal(blockedUpdate.code, "permission_denied");

  const blockedCancel = await cancelEvent({
    prisma,
    actor: outsiderStaff,
    eventId: first.event.id,
  });
  assert.equal(blockedCancel.ok, false);
  assert.equal(blockedCancel.code, "permission_denied");
});

test("event edits cannot invalidate active signups and cancelled events remain visible", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const otherUnit = await activeUnit("tf20_soar_b160");
  const staff = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: rootUnit.id,
  });
  const outsider = await createActivePersonnel("Open Signup Outsider");
  await assignPersonnelCurrentUnit(outsider.profile.id, otherUnit.id);

  const created = await createEvent({
    prisma,
    actor: staff,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Editable Open Attendance Event",
      attendanceScope: "Open",
      startsAt: "2026-07-15T19:00",
      endsAt: "2026-07-15T21:00",
    }),
  });
  assert.equal(created.ok, true);

  const signup = await signupForEvent({
    prisma,
    actor: outsider.account,
    eventId: created.event.id,
  });
  assert.equal(signup.ok, true);

  const blockedRestriction = await updateEvent({
    prisma,
    actor: staff,
    eventId: created.event.id,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Editable Open Attendance Event",
      attendanceScope: "UnitOnly",
      startsAt: "2026-07-15T19:00",
      endsAt: "2026-07-15T21:00",
    }),
  });
  assert.equal(blockedRestriction.ok, false);
  assert.equal(blockedRestriction.code, "validation_error");

  const cancelled = await cancelEvent({
    prisma,
    actor: staff,
    eventId: created.event.id,
  });
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.event.status, "Cancelled");

  const visibleAfterCancel = await getEventDetail(prisma, outsider.account, created.event.id);
  assert.equal(visibleAfterCancel.ok, true);
  assert.equal(visibleAfterCancel.event.status, "Cancelled");
});

test("event signups close when the event start time has passed", async () => {
  const rootUnit = await activeUnit("tf20_ranger_a");
  const staff = await createAccountWithRole("unit-staff", "Active", {
    scopeType: "Unit",
    unitId: rootUnit.id,
  });
  const member = await createActivePersonnel("Late RSVP Member");

  const pastEvent = await createEvent({
    prisma,
    actor: staff,
    body: eventBody({
      sourceUnitId: rootUnit.id,
      title: "Past Event Window",
      startsAt: "2026-01-10T19:00",
      endsAt: "2026-01-10T21:00",
    }),
  });
  assert.equal(pastEvent.ok, true);

  const result = await signupForEvent({
    prisma,
    actor: member.account,
    eventId: pastEvent.event.id,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_transition");
});

test("current members claim imported accounts through Discord authentication", async () => {
  const member = await createActivePersonnel("Claimable Member");
  const identity = member.account.authIdentities[0];

  const resolved = await resolveAuthenticatedAccount({
    prisma,
    discordUser: {
      id: identity.providerAccountId,
      username: "claimed-member",
      global_name: "Claimed Member",
    },
    guildPayload: { joined_at: "2026-06-13T00:00:00.000Z" },
    approvedGuildId: TEST_DISCORD_GUILD_ID,
  });

  assert.equal(resolved.created, false);
  assert.equal(resolved.account.id, member.account.id);
  assert.equal(resolved.account.status, "Active");
  assert.ok(resolved.account.claimedAt);

  const profile = await prisma.personnelProfile.findUniqueOrThrow({
    where: { id: member.profile.id },
  });
  assert.ok(profile.claimedAt);

  const claimAudit = await prisma.auditLog.findFirst({
    where: {
      targetAccountId: member.account.id,
      targetPersonnelProfileId: member.profile.id,
      action: "claim-current-member-account",
    },
  });
  assert.ok(claimAudit);

  const secondLogin = await resolveAuthenticatedAccount({
    prisma,
    discordUser: {
      id: identity.providerAccountId,
      username: "claimed-member",
      global_name: "Claimed Member",
    },
    guildPayload: { joined_at: "2026-06-13T00:00:00.000Z" },
    approvedGuildId: TEST_DISCORD_GUILD_ID,
  });
  assert.equal(secondLogin.created, false);
  assert.equal(
    await prisma.discordMembershipEvent.count({
      where: {
        providerAccountId: identity.providerAccountId,
        eventType: "Join",
      },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: {
        targetAccountId: member.account.id,
        action: "claim-current-member-account",
      },
    }),
    1,
  );
});

test("current roster import creates and merges member profiles idempotently", async () => {
  const existingDiscordId = uniqueKey("existing-discord");
  const importedDiscordId = uniqueKey("import-discord");
  const existingAccount = await prisma.account.create({
    data: {
      displayName: "Existing Import Account",
      status: "Active",
      authIdentities: {
        create: {
          provider: "Discord",
          providerAccountId: existingDiscordId,
          username: "existing-import",
          displayName: "existing-import",
        },
      },
    },
  });
  const filePath = writeTempRosterCsv([
    [
      existingDiscordId,
      "existing-import",
      "Joshua",
      "Howie",
      "Active",
      "sgm",
      "tf20_hhc",
      "tf20_ncoic",
      "18_z,68_w",
      "2025-10-10",
      "2025-10-10",
      "command-staff,trainer,recruiter",
      "rfr",
      "",
    ],
    [
      importedDiscordId,
      "new-import",
      "Joseph",
      "Edwards",
      "Active",
      "pfc",
      "tf20_ranger_a_1p",
      "tf20_rangerA_1p_med",
      "68_w",
      "2026-06-09",
      "2026-06-09",
      "member",
      "rfr,cbrn_defense",
      "emqb,carbinebar",
    ],
  ]);

  const dryRun = await importCurrentRoster({ prisma, filePath });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.summary.accountsToCreate, 1);
  assert.equal(dryRun.summary.accountsToUpdate, 1);
  assert.equal(dryRun.summary.profilesToCreate, 2);
  assert.equal(dryRun.summary.secondaryMOSRows, 1);
  assert.equal(dryRun.summary.rankWaiverNotes, 1);

  const applied = await importCurrentRoster({ prisma, filePath, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.summary.totalRows, 2);

  const mergedAccount = await prisma.account.findUniqueOrThrow({
    where: { id: existingAccount.id },
    include: {
      personnelProfile: {
        include: {
          currentMOS: true,
          currentSecondaryMOS: true,
          mosHistory: true,
        },
      },
      roleAssignments: { include: { role: true } },
    },
  });
  assert.equal(mergedAccount.personnelProfile?.name, "Joshua Howie");
  assert.equal(mergedAccount.personnelProfile?.currentMOS.key, "18_z");
  assert.equal(mergedAccount.personnelProfile?.currentSecondaryMOS.key, "68_w");
  assert.equal(
    mergedAccount.personnelProfile?.mosHistory.some(
      (entry) => entry.assignmentType === "Secondary" && !entry.endedAt,
    ),
    true,
  );

  const hhc = await activeUnit("tf20_hhc");
  const trainerAssignment = mergedAccount.roleAssignments.find(
    (assignment) => assignment.role.key === "trainer" && !assignment.endsAt,
  );
  const recruiterAssignment = mergedAccount.roleAssignments.find(
    (assignment) => assignment.role.key === "recruiter" && !assignment.endsAt,
  );
  assert.equal(trainerAssignment?.scopeType, "Unit");
  assert.equal(trainerAssignment?.unitId, hhc.id);
  assert.equal(recruiterAssignment?.scopeType, "Global");
  assert.equal(recruiterAssignment?.unitId, null);

  const importedIdentity = await prisma.authIdentity.findUniqueOrThrow({
    where: {
      provider_providerAccountId: {
        provider: "Discord",
        providerAccountId: importedDiscordId,
      },
    },
    include: {
      account: {
        include: {
          personnelProfile: {
            include: {
              administrativeNotes: true,
              awardRecords: { include: { award: true } },
              qualifications: { include: { qualification: true } },
            },
          },
        },
      },
    },
  });
  const importedProfile = importedIdentity.account.personnelProfile;
  assert.equal(importedProfile?.name, "Joseph Edwards");
  assert.equal(
    importedProfile?.administrativeNotes.some((note) => note.noteType === "rank-waiver-required"),
    true,
  );
  assert.deepEqual(importedProfile?.qualifications.map((entry) => entry.qualification.key).sort(), [
    "cbrn_defense",
    "rfr",
  ]);
  assert.deepEqual(importedProfile?.awardRecords.map((entry) => entry.award.key).sort(), [
    "carbinebar",
    "emqb",
  ]);

  const profileIds = [mergedAccount.personnelProfile.id, importedProfile.id];
  const countsBefore = await currentRosterImportCounts(profileIds);
  const reapplied = await importCurrentRoster({ prisma, filePath, apply: true });
  assert.equal(reapplied.ok, true);
  assert.deepEqual(await currentRosterImportCounts(profileIds), countsBefore);
});

test("archived roles do not grant application access", async () => {
  const permission = await prisma.permission.findUniqueOrThrow({
    where: { key: "applications.create-self" },
  });
  const archivedRole = await prisma.role.create({
    data: {
      key: uniqueKey("archived-role"),
      name: "Archived Role",
      status: "Archived",
      permissions: {
        create: {
          permissionId: permission.id,
        },
      },
    },
  });
  const account = await createAccountWithRole(null, "Pending", { roleId: archivedRole.id });
  const targetUnit = await activeUnit("tf20_ranger_a");
  const body = await applicationBody(targetUnit.id, "No Access");

  assert.deepEqual(flattenPermissions(account), []);

  const result = await submitOwnApplication({
    prisma,
    account,
    body,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "permission_denied");
});

async function agreeToCurrentIntakeDocuments(account) {
  const documentKeys = getCurrentIntakeDocuments().map((document) => document.key);
  const result = await recordApplicationIntakeAgreements({
    prisma,
    account,
    documentKeys,
    ipAddress: "127.0.0.1",
    userAgent: "integration-test",
  });

  assert.equal(result.ok, true);
  return result;
}

async function createConvertedApplication({ pending, reviewer, targetUnit, preferredName }) {
  const recruiter = await createAccountWithRole("recruiter", "Active");
  await agreeToCurrentIntakeDocuments(pending);
  const created = await submitOwnApplication({
    prisma,
    account: pending,
    body: await applicationBody(targetUnit.id, preferredName),
  });
  assert.equal(created.ok, true);

  const claimed = await claimApplication({
    prisma,
    actor: recruiter,
    applicationId: created.application.id,
  });
  assert.equal(claimed.ok, true);

  const recommended = await recommendApplication({
    prisma,
    actor: recruiter,
    applicationId: created.application.id,
    targetUnitId: targetUnit.id,
    reason: "Integration recommendation.",
  });
  assert.equal(recommended.ok, true);

  const accepted = await acceptApplication({
    prisma,
    actor: reviewer,
    applicationId: created.application.id,
    reason: "Integration acceptance.",
  });
  assert.equal(accepted.ok, true);

  return accepted.application;
}

async function createTargetUnitReviewApplication({ applicationUnit, preferredName, targetUnit }) {
  const pending = await createAccountWithRole("pending-user", "Pending");
  const reviewer = await createAccountWithRole("recruiter", "Active");
  const body = await applicationBody(applicationUnit.id, preferredName);
  await agreeToCurrentIntakeDocuments(pending);
  const created = await submitOwnApplication({
    prisma,
    account: pending,
    body,
  });
  assert.equal(created.ok, true);

  const claimed = await claimApplication({
    prisma,
    actor: reviewer,
    applicationId: created.application.id,
  });
  assert.equal(claimed.ok, true);

  const recommended = await recommendApplication({
    prisma,
    actor: reviewer,
    applicationId: created.application.id,
    targetUnitId: targetUnit.id,
  });
  assert.equal(recommended.ok, true);
  assert.equal(recommended.application.status, "TargetUnitReview");
  assert.equal(recommended.application.targetUnitId, targetUnit.id);

  return {
    application: recommended.application,
    body,
    pending,
    reviewer,
  };
}

async function createAccountWithRole(roleKey, status, options = {}) {
  const account = await prisma.account.create({
    data: {
      displayName: uniqueKey("account"),
      status,
      authIdentities: {
        create: {
          provider: "Discord",
          providerAccountId: uniqueKey("discord"),
          username: uniqueKey("user"),
          displayName: uniqueKey("display"),
        },
      },
    },
  });

  const roleId =
    options.roleId ??
    (roleKey ? (await prisma.role.findUniqueOrThrow({ where: { key: roleKey } })).id : null);
  if (roleId) {
    await prisma.roleAssignment.create({
      data: {
        accountId: account.id,
        roleId,
        scopeType: options.scopeType ?? "Global",
        scopeIncludesDescendants: options.scopeIncludesDescendants ?? true,
        unitId: options.unitId,
        reason: "Integration test role assignment.",
      },
    });
  }

  return prisma.account.findUniqueOrThrow({
    where: { id: account.id },
    include: {
      authIdentities: true,
      roleAssignments: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

async function assignAdditionalRole(account, roleKey, options = {}) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  await prisma.roleAssignment.create({
    data: {
      accountId: account.id,
      roleId: role.id,
      scopeType: options.scopeType ?? "Global",
      scopeIncludesDescendants: options.scopeIncludesDescendants ?? true,
      unitId: options.unitId,
      reason: "Integration test additional role assignment.",
    },
  });

  return prisma.account.findUniqueOrThrow({
    where: { id: account.id },
    include: {
      authIdentities: true,
      roleAssignments: {
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

async function createActivePersonnel(name) {
  const account = await createAccountWithRole("member", "Active");
  const profile = await prisma.personnelProfile.create({
    data: {
      accountId: account.id,
      name: `${name} ${uniqueKey("profile")}`,
      status: "Active",
      joinedAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  return { account, profile };
}

async function assignPersonnelCurrentUnit(personnelProfileId, unitId) {
  await prisma.personnelProfile.update({
    where: { id: personnelProfileId },
    data: {
      currentUnitId: unitId,
    },
  });
}

async function activeUnit(key) {
  return prisma.unit.findFirstOrThrow({ where: { key, status: "Active" } });
}

async function recruitingMOSForUnit(unitId) {
  return prisma.mOS.findFirstOrThrow({
    where: { unitId, status: "Active", recruitingOpen: true },
    orderBy: { identifier: "asc" },
  });
}

async function ensureOpenRecruitingMOS(unitId) {
  const mos = await recruitingMOSForUnit(unitId);
  await prisma.mOS.update({
    where: { id: mos.id },
    data: { authorizedSlots: 99 },
  });
  return prisma.mOS.findUniqueOrThrow({ where: { id: mos.id } });
}

async function applicationBody(targetUnitId, preferredName) {
  const mos = await ensureOpenRecruitingMOS(targetUnitId);
  const [firstName, ...lastNameParts] = preferredName.split(/\s+/);
  return {
    firstName,
    lastName: lastNameParts.join(" ") || firstName,
    age: "24",
    timeZone: "CST",
    reasonForJoining: "I want to contribute to a structured Task Force 20 team.",
    source: "Discord",
    priorService: true,
    servicePeriods: [{ branch: "Army", mos: "11B", years: 4 }],
    priorArma: true,
    armaUnits: [
      {
        unitName: "Integration Arma Unit",
        joinedAt: "2024-01",
        leftAt: "2024-06",
        stillMember: false,
        reasonLeft: "Integration test transfer.",
      },
    ],
    leadership: true,
    leadershipDetails: "Integration test fireteam leadership.",
    interestedUnitIds: [targetUnitId],
    availabilitySlotKeys: ["tuesday_evenings", "thursday_evenings"],
    desiredMOSIds: [mos.id],
  };
}

function eventBody(overrides = {}) {
  return {
    title: uniqueKey("integration-event"),
    eventType: "Meeting",
    location: "Discord",
    attendanceScope: "Open",
    sourceUnitId: "",
    startsAt: "2026-07-10T19:00",
    endsAt: "2026-07-10T21:00",
    details: "Integration event detail.",
    ...overrides,
  };
}

function writeTempRosterCsv(rows) {
  const headers = [
    "DISCORD ID #",
    "DISCORD NAME",
    "firstname",
    "lastname",
    "PersonnelStatus",
    "rank_key",
    "unit_key",
    "billet_key",
    "MOS",
    "joinedAt",
    "promotedat",
    "ROLES",
    "qualifications",
    "award_key",
  ];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tf20-roster-import-"));
  const filePath = path.join(directory, "current_roster_import.csv");
  const lines = [headers, ...rows]
    .map((row) => row.map((value) => csvCell(value)).join(","))
    .join("\n");
  fs.writeFileSync(filePath, `${lines}\n`, "utf8");
  return filePath;
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

async function currentRosterImportCounts(personnelProfileIds) {
  const where = { personnelProfileId: { in: personnelProfileIds } };
  return {
    statusHistory: await prisma.personnelStatusHistory.count({ where }),
    rankHistory: await prisma.personnelRankHistory.count({ where }),
    unitAssignments: await prisma.personnelUnitAssignment.count({ where }),
    billetAssignments: await prisma.personnelBilletAssignment.count({ where }),
    mosHistory: await prisma.personnelMOSHistory.count({ where }),
    qualifications: await prisma.personnelQualification.count({ where }),
    awardRecords: await prisma.awardRecord.count({ where }),
    waiverNotes: await prisma.administrativeNote.count({
      where: { ...where, noteType: "rank-waiver-required" },
    }),
  };
}

function uniqueKey(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}
