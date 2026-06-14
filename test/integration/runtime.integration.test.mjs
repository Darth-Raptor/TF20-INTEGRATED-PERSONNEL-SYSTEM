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
  getRecruitingOptions,
  listReviewQueue,
  listUnitReviewQueue,
  recommendApplication,
  releaseApplicationClaim,
  requestApplicationInfo,
  requestApplicationInfoFromUnit,
  rejectApplication,
  saveApplicationReviewNote,
  saveApplicationUnitReviewNote,
  submitOwnApplication,
  updateOwnApplication,
  withdrawOwnApplication,
} from "../../src/server/application-service.mjs";
import { flattenPermissions, resolveAuthenticatedAccount } from "../../src/server/auth-service.mjs";
import {
  getPersonnelEditOptions,
  listScopedPersonnel,
  updatePersonnelProfile,
} from "../../src/server/personnel-service.mjs";
import {
  createTrainingSession,
  getTrainingOptions,
  listOwnTrainingRecords,
  updateTrainingSession,
} from "../../src/server/training-service.mjs";

const prisma = new PrismaClient();
let sequence = 0;

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
  assert.equal(
    options.units.every((unit) => unit.hierarchyBase === 7000),
    true,
  );
});

test("application drafts allow new applicant questions to remain blank", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const body = await applicationBody(targetUnit.id, "Draft Preview");
  delete body.age;
  delete body.timeZone;
  delete body.reasonForJoining;

  const result = await updateOwnApplication({ prisma, account: pending, body });

  assert.equal(result.ok, true);
  assert.equal(result.application.age, null);
  assert.equal(result.application.timeZone, null);
  assert.equal(result.application.reasonForJoining, null);
});

test("application submit requires and validates new applicant questions", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pendingMissing = await createAccountWithRole("pending-user", "Pending");
  const missingBody = await applicationBody(targetUnit.id, "Missing Questions");
  delete missingBody.age;
  delete missingBody.timeZone;
  delete missingBody.reasonForJoining;

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

  const pendingInvalid = await createAccountWithRole("pending-user", "Pending");
  const invalid = await submitOwnApplication({
    prisma,
    account: pendingInvalid,
    body: {
      ...(await applicationBody(targetUnit.id, "Invalid Questions")),
      age: "twenty",
      timeZone: "Mars/Phobos",
    },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "validation_error");
  assert.match(invalid.message, /Age must be a positive whole number/);
  assert.match(invalid.message, /Time zone is invalid/);
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

  const draft = await createOrResumeDraftApplication({ prisma, account: pending });
  assert.equal(draft.ok, true);
  assert.equal(draft.created, true);
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

test("recruiter can request more information and applicant can resubmit or withdraw", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
  const pending = await createAccountWithRole("pending-user", "Pending");
  const reviewer = await createAccountWithRole("recruiter", "Active");
  const body = await applicationBody(targetUnit.id, "Request Info");

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
  const mos = await prisma.mOS.findFirstOrThrow({ where: { status: "Active" } });

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
      goodStanding: "true",
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
      goodStanding: "true",
      reason: "Integration personnel update.",
    },
  });

  assert.equal(updated.ok, true);
  assert.equal(updated.profile.name, "Falcon Two");
  assert.equal(updated.profile.currentMOSId, mos.id);
  assert.equal(
    await prisma.personnelMOSHistory.count({
      where: { personnelProfileId: profile.id, mosId: mos.id },
    }),
    1,
  );

  const billet = await prisma.billet.findFirstOrThrow({
    where: { status: "Active", minimumRankId: { not: null }, unitId: { not: null } },
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
      goodStanding: "true",
      reason: "Integration low-rank billet check.",
    },
  });

  assert.equal(lowRankBillet.ok, false);
  assert.equal(lowRankBillet.code, "validation_error");
  assert.match(lowRankBillet.message, /requires rank/);
});

test("personnel edit options expose scoped human-readable dropdown choices", async () => {
  const targetUnit = await activeUnit("tf20_ranger_a");
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
  assert.deepEqual(result.options.standingOptions, [
    { value: "true", label: "Good" },
    { value: "false", label: "Restricted" },
  ]);
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
  });
  assert.equal(secondLogin.created, false);
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

async function createConvertedApplication({ pending, reviewer, targetUnit, preferredName }) {
  const recruiter = await createAccountWithRole("recruiter", "Active");
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

async function activeUnit(key) {
  return prisma.unit.findFirstOrThrow({ where: { key, status: "Active" } });
}

async function recruitingMOSForUnit(unitId) {
  return prisma.mOS.findFirstOrThrow({
    where: { unitId, status: "Active", recruitingOpen: true },
    orderBy: { identifier: "asc" },
  });
}

async function applicationBody(targetUnitId, preferredName) {
  const mos = await recruitingMOSForUnit(targetUnitId);
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
    desiredMOSIds: [mos.id],
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
