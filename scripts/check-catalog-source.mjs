import fs from "node:fs";
import path from "node:path";
import { catalogSource } from "../prisma/catalog-source.mjs";

const projectRoot = process.cwd();
const seedPath = path.join(projectRoot, "prisma", "seed.mjs");
const governancePath = path.join(projectRoot, "docs", "catalog-governance.md");
const smokePath = path.join(projectRoot, "scripts", "smoke.mjs");
const seed = fs.readFileSync(seedPath, "utf8");
const governance = fs.readFileSync(governancePath, "utf8");
const smoke = fs.readFileSync(smokePath, "utf8");

const requiredFamilies = [
  "roles",
  "permissions",
  "units",
  "ranks",
  "billets",
  "staffSections",
  "mos",
  "trainingCourses",
  "qualifications",
  "awards",
];

for (const family of requiredFamilies) {
  if (!Array.isArray(catalogSource[family])) {
    fail(`Catalog source is missing required family ${family}.`);
  }
}

assertUnique(catalogSource.roles, "roles", "key");
assertUnique(catalogSource.permissions, "permissions", "key");
assertUnique(catalogSource.units, "units", "key");
assertUnique(catalogSource.ranks, "ranks", "key");
assertUnique(catalogSource.billets, "billets", "key");
assertUnique(catalogSource.staffSections, "staffSections", "key");
assertUnique(catalogSource.mos, "mos", "key");
assertUnique(catalogSource.trainingCourses, "trainingCourses", "key");
assertUnique(catalogSource.qualifications, "qualifications", "key");
assertUnique(catalogSource.awards, "awards", "key");

const unitKeys = new Set(catalogSource.units.map((unit) => unit.key));
for (const unit of catalogSource.units) {
  if (unit.parentKey && !unitKeys.has(unit.parentKey)) {
    fail(`Unit ${unit.key} references missing parentKey ${unit.parentKey}.`);
  }
}

const permissionKeys = new Set(catalogSource.permissions.map((permission) => permission.key));
const rankKeys = new Set(catalogSource.ranks.map((rank) => rank.key));
for (const role of catalogSource.roles) {
  for (const permissionKey of role.permissionKeys ?? []) {
    if (!permissionKeys.has(permissionKey)) {
      fail(`Role ${role.key} references missing permission ${permissionKey}.`);
    }
  }
}

for (const billet of catalogSource.billets) {
  if (billet.unitKey && !unitKeys.has(billet.unitKey)) {
    fail(`Billet ${billet.key} references missing unitKey ${billet.unitKey}.`);
  }
  if (billet.minimumRankKey && !rankKeys.has(billet.minimumRankKey)) {
    fail(`Billet ${billet.key} references missing minimumRankKey ${billet.minimumRankKey}.`);
  }
}

for (const mos of catalogSource.mos) {
  if (mos.unitKey && !unitKeys.has(mos.unitKey)) {
    fail(`MOS ${mos.key} references missing unitKey ${mos.unitKey}.`);
  }
}

const allowedModules = new Set([
  "accounts",
  "access",
  "catalogs",
  "applications",
  "personnel",
  "events",
  "attendance",
  "loa",
  "training",
  "serviceRecords",
  "support",
  "audit",
  "notifications",
  "integrations",
]);

const allowedSensitiveCategories = new Set([
  "identity",
  "recovery",
  "access-management",
  "disciplinary",
  "administrative-notes",
  "private-loa",
  "audit",
  "integration",
  null,
]);

for (const permission of catalogSource.permissions) {
  if (!allowedModules.has(permission.module)) {
    fail(`Permission ${permission.key} uses unsupported module ${permission.module}.`);
  }
  if (!allowedSensitiveCategories.has(permission.sensitiveCategory ?? null)) {
    fail(
      `Permission ${permission.key} uses unsupported sensitive category ${permission.sensitiveCategory}.`,
    );
  }
}

const placeholderPattern = /\b(todo|tbd|placeholder|replace-with|example\.invalid)\b/i;
for (const [familyName, items] of Object.entries(catalogSource)) {
  if (!Array.isArray(items)) continue;
  for (const item of items) {
    const serialized = JSON.stringify(item);
    if (placeholderPattern.test(serialized)) {
      fail(`Catalog source family ${familyName} contains placeholder content: ${serialized}`);
    }
  }
}

if (!/catalog-source\.mjs/.test(seed)) {
  fail("Seed script does not read from the authoritative catalog source.");
}

if (!governance.includes("Later additions follow the same process:")) {
  fail("Catalog governance doc is missing the future expansion process.");
}

if (!/check-catalog-source\.mjs/.test(smoke)) {
  fail("Smoke script must verify the catalog validator exists.");
}

console.log("Catalog source check passed.");

function assertUnique(items, familyName, fieldName) {
  const seen = new Set();
  for (const item of items) {
    const value = item?.[fieldName];
    if (value == null) continue;
    if (seen.has(value)) {
      fail(`Catalog family ${familyName} has duplicate ${fieldName} ${value}.`);
    }
    seen.add(value);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
