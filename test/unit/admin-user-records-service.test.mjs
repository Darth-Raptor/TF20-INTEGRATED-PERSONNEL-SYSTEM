import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldIncludeAdminUserRecord } from "../../src/server/admin-user-records-service.mjs";

test("fresh discord-only user remains on the admin user-records list", () => {
  assert.equal(
    shouldIncludeAdminUserRecord({
      accountStatus: "Pending",
      applicationStatuses: [],
      personnelStatus: null,
    }),
    true,
  );
});

test("draft applicants remain on the admin user-records list", () => {
  assert.equal(
    shouldIncludeAdminUserRecord({
      accountStatus: "Pending",
      applicationStatuses: ["Draft"],
      personnelStatus: null,
    }),
    true,
  );
});

test("submitted and in-review applicants are removed from the admin user-records list", () => {
  for (const status of [
    "Submitted",
    "MoreInfoRequested",
    "RecruiterScreening",
    "RecruiterRecommended",
    "TargetUnitReview",
    "Accepted",
  ]) {
    assert.equal(
      shouldIncludeAdminUserRecord({
        accountStatus: "Pending",
        applicationStatuses: [status],
        personnelStatus: null,
      }),
      false,
      status,
    );
  }
});

test("closed no-profile applicants return to the admin user-records list", () => {
  for (const status of ["Denied", "Withdrawn", "Closed"]) {
    assert.equal(
      shouldIncludeAdminUserRecord({
        accountStatus: "Pending",
        applicationStatuses: [status],
        personnelStatus: null,
      }),
      true,
      status,
    );
  }
});

test("only discharged personnel statuses remain on the admin user-records list", () => {
  for (const status of [
    "Applicant",
    "Recruit",
    "Active",
    "Reserve",
    "LeaveOfAbsence",
    "ExtendedLeaveOfAbsence",
    "AWOL",
  ]) {
    assert.equal(
      shouldIncludeAdminUserRecord({
        accountStatus: "Active",
        applicationStatuses: [],
        personnelStatus: status,
      }),
      false,
      status,
    );
  }

  for (const status of [
    "HonorableDischarge",
    "OtherThanHonorableDischarge",
    "DishonorableDischarge",
  ]) {
    assert.equal(
      shouldIncludeAdminUserRecord({
        accountStatus: "Active",
        applicationStatuses: [],
        personnelStatus: status,
      }),
      true,
      status,
    );
  }
});

test("archived accounts are excluded from the admin user-records list", () => {
  assert.equal(
    shouldIncludeAdminUserRecord({
      accountStatus: "Archived",
      applicationStatuses: [],
      personnelStatus: null,
    }),
    false,
  );
});
