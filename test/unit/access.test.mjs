import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAccessContext } from "../../src/server/access.mjs";
import { flattenPermissions } from "../../src/server/auth-service.mjs";

test("pending accounts expose only pending modules", () => {
  const access = buildAccessContext({
    account: { status: "Pending" },
    permissions: [{ key: "accounts.view-self" }, { key: "support.create-self" }],
  });

  assert.equal(access.gateState, "pending");
  assert.deepEqual(access.visibleModules, ["applications", "support", "access", "notifications"]);
  assert.deepEqual(
    access.visibleNavigation.sections.map((section) => section.id),
    ["user"],
  );
  assert.deepEqual(
    access.visibleNavigation.sections[0].pages.map((page) => page.id),
    ["user_profile", "user_support"],
  );
  assert.equal(access.visibleNavigation.defaultPath, "/user/profile");
});

test("active accounts derive module visibility from active permissions", () => {
  const access = buildAccessContext({
    account: { status: "Active" },
    permissions: [
      { key: "accounts.view-self" },
      { key: "personnel.view-self" },
      { key: "applications.review-recruiter" },
    ],
  });

  assert.equal(access.gateState, "active");
  assert.deepEqual(access.visibleModules, [
    "accounts",
    "applications",
    "dashboard",
    "personnel",
    "profile",
  ]);
  assert.deepEqual(
    access.visibleNavigation.sections.map((section) => section.id),
    ["user", "recruiting"],
  );
});

test("archived roles and permissions do not flatten into effective access", () => {
  const account = {
    roleAssignments: [
      {
        endsAt: null,
        role: {
          status: "Archived",
          permissions: [{ permission: { key: "personnel.view-self", status: "Active" } }],
        },
      },
      {
        endsAt: null,
        role: {
          status: "Active",
          permissions: [{ permission: { key: "applications.view-self", status: "Archived" } }],
        },
      },
      {
        endsAt: new Date(),
        role: {
          status: "Active",
          permissions: [{ permission: { key: "accounts.view-self", status: "Active" } }],
        },
      },
    ],
  };

  assert.deepEqual(flattenPermissions(account), []);
});
