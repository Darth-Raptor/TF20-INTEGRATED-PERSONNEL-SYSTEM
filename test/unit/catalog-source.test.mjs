import assert from "node:assert/strict";
import { test } from "node:test";

import { catalogSource } from "../../prisma/catalog-source.mjs";
import { validateCatalogSource } from "../../prisma/seed.mjs";

test("catalog source validates with the approved Phase 2 data", () => {
  assert.doesNotThrow(() => validateCatalogSource(catalogSource));
  assert.equal(catalogSource.roles.length, 7);
  assert.equal(catalogSource.permissions.length, 30);
  assert.equal(catalogSource.units.length, 14);
  assert.equal(catalogSource.mos.length, 33);
});

test("catalog roles use the explicit least-privilege permission matrix", () => {
  const permissionsByRole = Object.fromEntries(
    catalogSource.roles.map((role) => [role.key, role.permissionKeys]),
  );

  assert.deepEqual(permissionsByRole, {
    "pending-user": [
      "access.recovery.request",
      "accounts.view-self",
      "applications.create-self",
      "applications.view-self",
      "notifications.archive-self",
      "notifications.view-self",
      "support.create-self",
    ],
    member: [
      "access.recovery.request",
      "accounts.view-self",
      "applications.create-self",
      "applications.view-self",
      "attendance.view-self",
      "events.view-self",
      "loa.create-self",
      "notifications.archive-self",
      "notifications.view-self",
      "personnel.view-self",
      "support.create-self",
    ],
    recruiter: [
      "access.recovery.request",
      "accounts.view-self",
      "applications.create-self",
      "applications.review-recruiter",
      "applications.view-self",
      "attendance.view-self",
      "events.view-self",
      "loa.create-self",
      "notifications.archive-self",
      "notifications.view-self",
      "personnel.view-self",
      "support.create-self",
    ],
    trainer: [
      "access.recovery.request",
      "accounts.view-self",
      "applications.create-self",
      "applications.view-self",
      "attendance.view-self",
      "events.view-self",
      "loa.create-self",
      "notifications.archive-self",
      "notifications.view-self",
      "personnel.view-self",
      "support.create-self",
      "training.record-scoped",
      "training.view-scoped",
    ],
    "unit-staff": [
      "access.recovery.request",
      "accounts.view-self",
      "applications.create-self",
      "applications.review-target-unit",
      "applications.view-self",
      "attendance.view-self",
      "events.manage-scoped",
      "events.view-self",
      "loa.create-self",
      "notifications.archive-self",
      "notifications.view-self",
      "personnel.update-scoped",
      "personnel.view-scoped",
      "personnel.view-self",
      "support.create-self",
    ],
    "command-staff": [
      "access.recovery.request",
      "accounts.view-self",
      "applications.create-self",
      "applications.review-recruiter",
      "applications.review-target-unit",
      "applications.view-self",
      "attendance.review-scoped",
      "attendance.view-self",
      "events.manage-scoped",
      "events.view-self",
      "loa.create-self",
      "loa.review-scoped",
      "notifications.archive-self",
      "notifications.view-self",
      "personnel.update-scoped",
      "personnel.view-scoped",
      "personnel.view-self",
      "serviceRecords.manage-scoped",
      "support.create-self",
      "training.record-scoped",
      "training.view-scoped",
    ],
    "system-admin": [
      "access.bootstrap.complete",
      "access.recovery.review",
      "access.roles.manage",
      "access.sessions.revoke",
      "audit.view",
      "catalogs.manage",
      "integrations.manage",
      "integrations.view",
      "support.manage-queue",
    ],
  });
});

test("catalog validation rejects broken role permission references", () => {
  const brokenSource = structuredClone(catalogSource);
  brokenSource.roles[0].permissionKeys = ["missing.permission"];

  assert.throws(
    () => validateCatalogSource(brokenSource),
    /references missing permission missing\.permission/,
  );
});
