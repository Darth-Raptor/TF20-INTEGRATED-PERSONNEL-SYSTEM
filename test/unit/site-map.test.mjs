import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
  normalizeSiteMapKey,
  resolveVisibleNavigation,
  validateSiteMapText,
} from "../../src/shared/site-map.mjs";

const siteMapText = fs.readFileSync(new URL("../../docs/SITE_MAP.TXT", import.meta.url), "utf8");

test("sitemap key normalization corrects first-pass document typos", () => {
  assert.equal(normalizeSiteMapKey("recruiting_dashbaord"), "recruiting_dashboard");
  assert.equal(normalizeSiteMapKey("admin_dashbaord"), "admin_dashboard");
  assert.equal(normalizeSiteMapKey("staff_personnelManagement"), "staff_personnel_management");
  assert.equal(normalizeSiteMapKey("user_"), "user");
});

test("implementation sitemap matches SITE_MAP.TXT after normalization", () => {
  const result = validateSiteMapText(siteMapText);

  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.parsed.sections, ["user", "staff", "recruiting", "training", "admin"]);
  assert.equal(result.parsed.pages.length, 13);
  assert.equal(result.parsed.subpages.length, 5);
});

test("active member navigation keeps user self pages separate from staff pages", () => {
  const navigation = resolveVisibleNavigation("Active", [
    "personnel.view-self",
    "loa.create-self",
    "events.view-self",
    "support.create-self",
  ]);

  assert.deepEqual(
    navigation.sections.map((section) => section.id),
    ["user"],
  );
  assert.deepEqual(
    navigation.sections[0].pages.map((page) => page.id),
    [
      "user_dashboard",
      "user_profile",
      "user_leave",
      "user_training",
      "user_events",
      "user_support",
    ],
  );
});

test("staff personnel management subpages are filtered independently", () => {
  const navigation = resolveVisibleNavigation("Active", [
    "personnel.view-self",
    "personnel.view-scoped",
    "personnel.update-scoped",
    "loa.review-scoped",
  ]);
  const staff = navigation.sections.find((section) => section.id === "staff");
  const personnelManagement = staff.pages.find((page) => page.id === "staff_personnel_management");

  assert.deepEqual(
    personnelManagement.subpages.map((subpage) => subpage.id),
    [
      "staff_personnel_management_qualifications",
      "staff_personnel_management_promotions",
      "staff_personnel_management_awards",
      "staff_personnel_management_leave",
      "staff_personnel_management_intake",
    ],
  );
});

test("specialized sections require their sitemap permissions", () => {
  const recruiter = resolveVisibleNavigation("Active", ["applications.review-recruiter"]);
  const targetUnitReviewer = resolveVisibleNavigation("Active", [
    "applications.review-target-unit",
  ]);
  const trainer = resolveVisibleNavigation("Active", ["training.view-scoped"]);
  const admin = resolveVisibleNavigation("Active", ["access.sessions.revoke"]);
  const blocked = resolveVisibleNavigation("Disabled", ["access.sessions.revoke"]);

  assert.ok(recruiter.sections.some((section) => section.id === "recruiting"));
  assert.ok(targetUnitReviewer.sections.some((section) => section.id === "recruiting"));
  assert.ok(trainer.sections.some((section) => section.id === "training"));
  assert.ok(admin.sections.some((section) => section.id === "admin"));
  assert.deepEqual(blocked.sections, []);
});

test("pending applicants can reach their application page", () => {
  const navigation = resolveVisibleNavigation("Pending", [
    "applications.create-self",
    "applications.view-self",
  ]);

  assert.deepEqual(
    navigation.sections.map((section) => section.id),
    ["user"],
  );
  assert.ok(navigation.sections[0].pages.some((page) => page.id === "user_application"));
});
