import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { catalogSource } from "../../prisma/catalog-source.mjs";
import {
  SITE_MAP_SECTIONS,
  findNavigationNodeByPath,
  findSiteMapNodeByPath,
  isSectionDashboardMatch,
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
  assert.equal(result.parsed.pages.length, 14);
  assert.equal(result.parsed.subpages.length, 5);
});

test("active member navigation keeps user self pages separate from staff pages", () => {
  const navigation = resolveVisibleNavigation("Active", [
    "accounts.view-self",
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

test("section dashboard stat cards are limited to section dashboard pages", () => {
  const dashboardMatches = SITE_MAP_SECTIONS.map((section) =>
    findSiteMapNodeByPath(section.path),
  ).filter(isSectionDashboardMatch);

  assert.deepEqual(
    dashboardMatches.map((match) => match.node.id),
    ["staff_dashboard", "recruiting_dashboard", "admin_dashboard"],
  );
  assert.ok(dashboardMatches.every(isSectionDashboardMatch));

  const nonDashboardMatches = SITE_MAP_SECTIONS.flatMap((section) =>
    section.pages.flatMap((page) => [
      ...(page.id.endsWith("_dashboard") ? [] : [findSiteMapNodeByPath(page.path)]),
      ...(page.subpages ?? []).map((subpage) => findSiteMapNodeByPath(subpage.path)),
    ]),
  );

  assert.ok(nonDashboardMatches.length > 0);
  assert.ok(nonDashboardMatches.every((match) => !isSectionDashboardMatch(match)));
});

test("recruiting application detail route keeps applications navigation active", () => {
  const navigation = resolveVisibleNavigation("Active", ["applications.review-recruiter"]);
  const visibleMatch = findNavigationNodeByPath(
    navigation,
    "/recruiting/applications/test-application-id",
  );
  const siteMapMatch = findSiteMapNodeByPath("/recruiting/applications/test-application-id");

  assert.equal(visibleMatch.type, "detail");
  assert.equal(visibleMatch.section.id, "recruiting");
  assert.equal(visibleMatch.page.id, "recruiting_applications");
  assert.equal(visibleMatch.node.id, "recruiting_application_detail");
  assert.equal(visibleMatch.node.label, "Application Detail");
  assert.equal(visibleMatch.params.applicationId, "test-application-id");
  assert.equal(siteMapMatch.page.id, "recruiting_applications");
  assert.equal(isSectionDashboardMatch(visibleMatch), false);
});

test("staff applicant review detail route keeps applicant review navigation active", () => {
  const navigation = resolveVisibleNavigation("Active", [
    "personnel.view-scoped",
    "applications.review-target-unit",
  ]);
  const visibleMatch = findNavigationNodeByPath(
    navigation,
    "/staff/applicant-review/test-application-id",
  );
  const siteMapMatch = findSiteMapNodeByPath("/staff/applicant-review/test-application-id");

  assert.equal(visibleMatch.type, "detail");
  assert.equal(visibleMatch.section.id, "staff");
  assert.equal(visibleMatch.page.id, "staff_applicant_review");
  assert.equal(visibleMatch.node.id, "staff_applicant_review_detail");
  assert.equal(visibleMatch.node.label, "Applicant Detail");
  assert.equal(visibleMatch.params.applicationId, "test-application-id");
  assert.equal(siteMapMatch.page.id, "staff_applicant_review");
  assert.equal(isSectionDashboardMatch(visibleMatch), false);
});

test("staff personnel profile detail route keeps personnel management navigation active", () => {
  const navigation = resolveVisibleNavigation("Active", ["personnel.view-scoped"]);
  const visibleMatch = findNavigationNodeByPath(
    navigation,
    "/staff/personnel-management/test-personnel-id",
  );
  const siteMapMatch = findSiteMapNodeByPath("/staff/personnel-management/test-personnel-id");

  assert.equal(visibleMatch.type, "detail");
  assert.equal(visibleMatch.section.id, "staff");
  assert.equal(visibleMatch.page.id, "staff_personnel_management");
  assert.equal(visibleMatch.node.id, "staff_personnel_profile_detail");
  assert.equal(visibleMatch.node.label, "Personnel Profile");
  assert.equal(visibleMatch.params.personnelId, "test-personnel-id");
  assert.equal(siteMapMatch.page.id, "staff_personnel_management");
  assert.equal(isSectionDashboardMatch(visibleMatch), false);
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
  const unitStaff = resolveVisibleNavigation("Active", [
    "applications.review-target-unit",
    "personnel.view-scoped",
  ]);
  const trainer = resolveVisibleNavigation("Active", ["training.view-scoped"]);
  const admin = resolveVisibleNavigation("Active", ["access.sessions.revoke"]);
  const blocked = resolveVisibleNavigation("Disabled", ["access.sessions.revoke"]);

  assert.ok(recruiter.sections.some((section) => section.id === "recruiting"));
  assert.equal(
    unitStaff.sections.some((section) => section.id === "recruiting"),
    false,
  );
  assert.ok(unitStaff.sections.some((section) => section.id === "staff"));
  assert.ok(trainer.sections.some((section) => section.id === "training"));
  assert.ok(admin.sections.some((section) => section.id === "admin"));
  assert.deepEqual(blocked.sections, []);
});

test("least-privilege role permissions resolve expected navigation sections", () => {
  assert.deepEqual(sectionIdsForRole("member"), ["user"]);
  assert.deepEqual(sectionIdsForRole("recruiter"), ["user", "recruiting"]);
  assert.deepEqual(sectionIdsForRole("trainer"), ["user", "training"]);
  assert.deepEqual(sectionIdsForRole("unit-staff"), ["user", "staff"]);
  assert.deepEqual(sectionIdsForRole("command-staff"), ["user", "staff", "recruiting", "training"]);
  assert.deepEqual(sectionIdsForRole("system-admin"), ["admin"]);
  assert.deepEqual(
    sectionIdsForPermissions([...rolePermissions("system-admin"), ...rolePermissions("member")]),
    ["user", "admin"],
  );
});

test("training records page replaces reserved training dashboard", () => {
  const navigation = resolveVisibleNavigation("Active", ["training.record-scoped"]);
  const visibleMatch = findNavigationNodeByPath(navigation, "/training");
  const siteMapMatch = findSiteMapNodeByPath("/training");

  assert.equal(visibleMatch.type, "page");
  assert.equal(visibleMatch.section.id, "training");
  assert.equal(visibleMatch.node.id, "training_records");
  assert.equal(visibleMatch.node.label, "Training Records");
  assert.equal(siteMapMatch.node.id, "training_records");
  assert.equal(isSectionDashboardMatch(visibleMatch), false);
});

test("pending applicants can reach their application page", () => {
  const navigation = resolveVisibleNavigation("Pending", [
    "accounts.view-self",
    "applications.create-self",
    "applications.view-self",
  ]);

  assert.deepEqual(
    navigation.sections.map((section) => section.id),
    ["user"],
  );
  assert.ok(navigation.sections[0].pages.some((page) => page.id === "user_application"));
});

function sectionIdsForRole(roleKey) {
  return sectionIdsForPermissions(rolePermissions(roleKey));
}

function sectionIdsForPermissions(permissions) {
  return resolveVisibleNavigation("Active", permissions).sections.map((section) => section.id);
}

function rolePermissions(roleKey) {
  return catalogSource.roles.find((role) => role.key === roleKey)?.permissionKeys ?? [];
}
