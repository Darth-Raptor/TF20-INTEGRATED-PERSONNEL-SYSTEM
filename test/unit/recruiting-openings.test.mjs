import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildApplicantOpeningsOptions,
  deriveLiveRecruitingOpenings,
} from "../../src/server/recruiting-openings.mjs";

test("live recruiting openings only keep units and MOS rows with open slots", () => {
  const result = deriveLiveRecruitingOpenings({
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
    mosRows: [
      {
        id: "mos-open",
        key: "11_b",
        identifier: "11B",
        name: "Infantryman",
        unitId: "unit-a",
        authorizedSlots: 2,
        unit: { id: "unit-a", key: "unit_a", name: "A Co" },
      },
      {
        id: "mos-closed",
        key: "68_w",
        identifier: "68W",
        name: "Combat Medic",
        unitId: "unit-b",
        authorizedSlots: 1,
        unit: { id: "unit-b", key: "unit_b", name: "B Co" },
      },
    ],
    assignedProfiles: [
      { currentMOSId: "mos-open", currentUnitId: "unit-a-child" },
      { currentMOSId: "mos-closed", currentUnitId: "unit-b" },
    ],
  });

  assert.deepEqual(
    result.units.map((unit) => unit.id),
    ["unit-a"],
  );
  assert.deepEqual(
    result.mos.map((row) => row.id),
    ["mos-open"],
  );
  assert.equal(result.assignedCounts.get("mos-open"), 1);
  assert.equal(result.assignedCounts.get("mos-closed"), 1);
});

test("applicant openings options include selected stale unit and MOS rows", () => {
  const result = buildApplicantOpeningsOptions({
    openings: {
      units: [{ id: "unit-a", key: "unit_a", name: "A Co", type: "Company", hierarchyBase: 7000 }],
      mos: [
        {
          id: "mos-open",
          key: "11_b",
          identifier: "11B",
          name: "Infantryman",
          unitId: "unit-a",
          unit: { id: "unit-a", key: "unit_a", name: "A Co" },
        },
      ],
    },
    selectedUnits: [
      { id: "unit-b", key: "unit_b", name: "B Co", type: "Company", hierarchyBase: 7000 },
    ],
    selectedMos: [
      {
        id: "mos-stale",
        key: "68_w",
        identifier: "68W",
        name: "Combat Medic",
        unitId: "unit-b",
        unit: { id: "unit-b", key: "unit_b", name: "B Co" },
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
    result.mos.map((row) => [row.id, row.isStale]),
    [
      ["mos-open", false],
      ["mos-stale", true],
    ],
  );
});
