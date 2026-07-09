import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildApplicantOpeningsOptions,
  deriveLiveRecruitingBilletOpenings,
  deriveRecruitingBilletOpeningRows,
} from "../../src/server/recruiting-openings.mjs";

test("grouped billet openings aggregate repeated billet names within a root tree", () => {
  const result = deriveRecruitingBilletOpeningRows({
    rootUnits: [
      {
        id: "unit-a",
        key: "unit_a",
        name: "A Co",
        parentId: null,
        type: "Company",
        hierarchyBase: 7000,
      },
    ],
    allUnits: [
      { id: "unit-a", parentId: null },
      { id: "unit-a-1", parentId: "unit-a" },
      { id: "unit-a-2", parentId: "unit-a" },
    ],
    billetOpenings: [
      {
        id: "opening-team-leader",
        rootUnitId: "unit-a",
        billetName: "TEAM LEADER",
        authorizedSlots: 3,
        rootUnit: { id: "unit-a", key: "unit_a", name: "A Co" },
      },
      {
        id: "opening-medic",
        rootUnitId: "unit-a",
        billetName: "MEDIC",
        authorizedSlots: 1,
        rootUnit: { id: "unit-a", key: "unit_a", name: "A Co" },
      },
    ],
    activeBillets: [
      { unitId: "unit-a-1", name: "TEAM LEADER" },
      { unitId: "unit-a-2", name: "TEAM LEADER" },
      { unitId: "unit-a-1", name: "MEDIC" },
    ],
    assignedProfiles: [
      { currentUnitId: "unit-a-1", currentBillet: { name: "TEAM LEADER" } },
      { currentUnitId: "unit-a-2", currentBillet: { name: "TEAM LEADER" } },
      { currentUnitId: "unit-a-1", currentBillet: { name: "MEDIC" } },
    ],
  });

  assert.equal(result.rows.find((row) => row.id === "opening-team-leader")?.assigned, 2);
  assert.equal(result.rows.find((row) => row.id === "opening-medic")?.assigned, 1);
});

test("live recruiting openings only keep units and billet rows with open slots", () => {
  const result = deriveLiveRecruitingBilletOpenings({
    rootUnits: [
      {
        id: "unit-a",
        key: "unit_a",
        name: "A Co",
        parentId: null,
        type: "Company",
        hierarchyBase: 7000,
      },
      {
        id: "unit-b",
        key: "unit_b",
        name: "B Co",
        parentId: null,
        type: "Company",
        hierarchyBase: 7000,
      },
    ],
    allUnits: [
      { id: "unit-a", parentId: null },
      { id: "unit-a-child", parentId: "unit-a" },
      { id: "unit-b", parentId: null },
    ],
    billetOpenings: [
      {
        id: "opening-open",
        rootUnitId: "unit-a",
        billetName: "TEAM LEADER",
        authorizedSlots: 2,
        rootUnit: { id: "unit-a", key: "unit_a", name: "A Co" },
      },
      {
        id: "opening-closed",
        rootUnitId: "unit-b",
        billetName: "MEDIC",
        authorizedSlots: 1,
        rootUnit: { id: "unit-b", key: "unit_b", name: "B Co" },
      },
    ],
    activeBillets: [
      { unitId: "unit-a-child", name: "TEAM LEADER" },
      { unitId: "unit-b", name: "MEDIC" },
    ],
    assignedProfiles: [
      { currentUnitId: "unit-a-child", currentBillet: { name: "TEAM LEADER" } },
      { currentUnitId: "unit-b", currentBillet: { name: "MEDIC" } },
    ],
  });

  assert.deepEqual(
    result.units.map((unit) => unit.id),
    ["unit-a"],
  );
  assert.deepEqual(
    result.billets.map((row) => row.id),
    ["opening-open"],
  );
  assert.equal(result.assignedCounts.get("opening-open"), 1);
  assert.equal(result.assignedCounts.get("opening-closed"), 1);
});

test("applicant openings options include selected stale unit and billet rows", () => {
  const result = buildApplicantOpeningsOptions({
    openings: {
      units: [{ id: "unit-a", key: "unit_a", name: "A Co", type: "Company", hierarchyBase: 7000 }],
      billets: [
        {
          id: "opening-open",
          billetName: "TEAM LEADER",
          rootUnitId: "unit-a",
          rootUnit: { id: "unit-a", key: "unit_a", name: "A Co" },
        },
      ],
    },
    selectedUnits: [
      { id: "unit-b", key: "unit_b", name: "B Co", type: "Company", hierarchyBase: 7000 },
    ],
    selectedBillets: [
      {
        id: "opening-stale",
        billetName: "MEDIC",
        rootUnitId: "unit-b",
        rootUnit: { id: "unit-b", key: "unit_b", name: "B Co" },
      },
    ],
  });

  assert.deepEqual(
    result.units.map((unit) => [unit.id, unit.isStale]),
    [
      ["unit-a", false],
      ["unit-b", true],
    ],
  );
  assert.deepEqual(
    result.billets.map((row) => [row.id, row.isStale]),
    [
      ["opening-open", false],
      ["opening-stale", true],
    ],
  );
});
