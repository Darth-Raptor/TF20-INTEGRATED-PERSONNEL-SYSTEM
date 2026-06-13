import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseRosterCsv,
  roleScopeForImport,
  unitOwnsOrContainsAssignment,
  validateRosterImport,
} from "../../scripts/import-current-roster.mjs";

test("current roster parser treats comma-separated MOS as primary and secondary", () => {
  const csv = [
    "DISCORD ID #,DISCORD NAME,firstname,lastname,PersonnelStatus,rank_key,unit_key,billet_key,MOS,joinedAt,promotedat,ROLES,qualifications,award_key",
    '123,joshua,Joshua,Howie,Active,sgm,tf20_hhc,tf20_ncoic,"18_z,68_w",2025-10-10,2025-10-10,"command-staff,trainer",rfr,emqb',
  ].join("\n");

  const { rows } = parseRosterCsv(csv);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].primaryMOSKey, "18_z");
  assert.equal(rows[0].secondaryMOSKey, "68_w");
  assert.deepEqual(rows[0].roleKeys, ["command-staff", "trainer"]);
});

test("current roster validation allows ancestor-owned mission billets and reports rank waivers", () => {
  const csv = [
    "DISCORD ID #,DISCORD NAME,firstname,lastname,PersonnelStatus,rank_key,unit_key,billet_key,MOS,joinedAt,promotedat,ROLES,qualifications,award_key",
    "456,winnie,Winnifred,Feisha,Active,pfc,team_b,uaso,15_w,2026-06-04,2026-06-04,member,rfr,emqb",
  ].join("\n");
  const { headers, rows } = parseRosterCsv(csv);

  const result = validateRosterImport({ headers, rows, context: testContext() });

  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, "rank-waiver-required");
});

test("current roster validation blocks legacy qualification keys", () => {
  const csv = [
    "DISCORD ID #,DISCORD NAME,firstname,lastname,PersonnelStatus,rank_key,unit_key,billet_key,MOS,joinedAt,promotedat,ROLES,qualifications,award_key",
    "789,legacy,Legacy,Key,Active,spc,platoon,uaso,15_w,2026-06-04,2026-06-04,member,cbrn_defence,",
  ].join("\n");
  const { headers, rows } = parseRosterCsv(csv);

  const result = validateRosterImport({ headers, rows, context: testContext() });

  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, "qualifications");
  assert.match(result.errors[0].message, /cbrn_defence/);
});

test("current roster role scope maps staff roles to unit scope", () => {
  assert.deepEqual(roleScopeForImport("trainer", "unit-1"), {
    scopeType: "Unit",
    scopeIncludesDescendants: true,
    unitId: "unit-1",
    staffSectionId: null,
  });
  assert.deepEqual(roleScopeForImport("recruiter", "unit-1"), {
    scopeType: "Global",
    scopeIncludesDescendants: true,
    unitId: null,
    staffSectionId: null,
  });
});

test("unit ownership helper follows parent chain", () => {
  const unitsById = new Map([
    ["company", { id: "company", parentId: null }],
    ["platoon", { id: "platoon", parentId: "company" }],
    ["team", { id: "team", parentId: "platoon" }],
  ]);

  assert.equal(unitOwnsOrContainsAssignment("company", "team", unitsById), true);
  assert.equal(unitOwnsOrContainsAssignment("platoon", "team", unitsById), true);
  assert.equal(unitOwnsOrContainsAssignment("team", "company", unitsById), false);
});

function testContext() {
  const ranks = [
    { id: "rank-pfc", key: "pfc", precedence: 20 },
    { id: "rank-spc", key: "spc", precedence: 30 },
    { id: "rank-sgm", key: "sgm", precedence: 90 },
  ];
  const units = [
    { id: "platoon", key: "platoon", parentId: null },
    { id: "team_b", key: "team_b", parentId: "platoon" },
    { id: "tf20_hhc", key: "tf20_hhc", parentId: null },
  ];
  const billets = [
    { id: "uaso", key: "uaso", unitId: "platoon", minimumRankId: "rank-spc" },
    { id: "tf20_ncoic", key: "tf20_ncoic", unitId: "tf20_hhc", minimumRankId: "rank-sgm" },
  ];
  const mos = [
    { id: "15_w", key: "15_w" },
    { id: "18_z", key: "18_z" },
    { id: "68_w", key: "68_w" },
  ];
  const roles = [
    { id: "member", key: "member" },
    { id: "trainer", key: "trainer" },
    { id: "command-staff", key: "command-staff" },
  ];
  const qualifications = [
    { id: "rfr", key: "rfr" },
    { id: "cbrn_defense", key: "cbrn_defense" },
  ];
  const awards = [{ id: "emqb", key: "emqb" }];

  return {
    ranksByKey: mapBy(ranks, "key"),
    ranksById: mapBy(ranks, "id"),
    unitsByKey: mapBy(units, "key"),
    unitsById: mapBy(units, "id"),
    billetsByKey: mapBy(billets, "key"),
    mosByKey: mapBy(mos, "key"),
    rolesByKey: mapBy(roles, "key"),
    qualificationsByKey: mapBy(qualifications, "key"),
    awardsByKey: mapBy(awards, "key"),
  };
}

function mapBy(items, field) {
  return new Map(items.map((item) => [item[field], item]));
}
