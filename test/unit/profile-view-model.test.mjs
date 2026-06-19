import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPersonnelProfileViewModel,
  formatCompactDate,
  formatWholeMonthDuration,
  resolveUnitDisplay,
  splitAwardRecords,
} from "../../src/shared/profile-view-model.mjs";

test("profile dates render as DDMMMYYYY", () => {
  assert.equal(formatCompactDate("2026-06-01T12:00:00.000Z"), "01JUN2026");
  assert.equal(formatCompactDate("2026-09-25"), "25SEP2026");
  assert.equal(formatCompactDate(null), "Not recorded");
});

test("profile durations count complete calendar months", () => {
  assert.equal(formatWholeMonthDuration("2026-06-01", "2027-08-01"), "14 Months");
  assert.equal(formatWholeMonthDuration("2026-09-25", "2026-11-25"), "2 Months");
  assert.equal(formatWholeMonthDuration("2026-09-25", "2026-11-24"), "1 Month");
  assert.equal(formatWholeMonthDuration(null, "2026-11-25"), "Not recorded");
});

test("unit hierarchy separates unit from platoon squad team assignment", () => {
  const currentUnit = {
    id: "team-a",
    name: "A Team",
    type: "Team",
    parent: {
      id: "squad-2",
      name: "2nd Squad",
      type: "Squad",
      parent: {
        id: "platoon-1",
        name: "1st Platoon",
        type: "Platoon",
        parent: {
          id: "company-a",
          name: "A CO 1/75th Ranger Regiment",
          type: "Company",
          parent: null,
        },
      },
    },
  };

  assert.deepEqual(resolveUnitDisplay(currentUnit), {
    unit: "A CO 1/75th Ranger Regiment",
    assignment: "1st Platoon, 2nd Squad, A Team",
  });
});

test("award records split ribbons from other award types", () => {
  assert.deepEqual(
    splitAwardRecords([
      { award: { abbreviation: "AAM", name: "Army Achievement Medal", type: "medal" } },
      { award: { abbreviation: "OSR", name: "Overseas Service Ribbon", type: "ribbon" } },
      { award: { name: "Combat Infantryman Badge", type: "badge" } },
    ]),
    {
      awards: ["Army Achievement Medal", "Combat Infantryman Badge"],
      ribbons: ["Overseas Service Ribbon"],
    },
  );
});

test("profile view model uses safe fallbacks for missing data", () => {
  const viewModel = buildPersonnelProfileViewModel(
    null,
    {
      account: { displayName: "TF20 Full Member" },
      authIdentity: { username: "tf20-full-member" },
    },
    new Date("2026-11-25T00:00:00.000Z"),
  );

  assert.deepEqual(viewModel.profileFields, [
    ["RANK", "RANK"],
    ["NAME", "T. Member"],
    ["TIS", "Not recorded"],
    ["TIG", "Not recorded"],
    ["UNIT", "Unassigned"],
    ["ASSIGNMENT", "Unassigned"],
    ["PRIMARY MOS", "Unassigned"],
    ["SECONDARY MOS", "None"],
  ]);
  assert.deepEqual(viewModel.qualifications, []);
  assert.deepEqual(viewModel.awards, []);
  assert.deepEqual(viewModel.ribbons, []);
  assert.deepEqual(viewModel.achievements, []);
});

test("profile view model uses current billet as assignment", () => {
  const viewModel = buildPersonnelProfileViewModel({
    name: "Raptor One",
    status: "Active",
    goodStanding: true,
    currentRank: { abbreviation: "SGT", name: "Sergeant" },
    currentUnit: {
      id: "team-a",
      name: "A Team",
      type: "Team",
      parent: {
        id: "squad-2",
        name: "2nd Squad",
        type: "Squad",
        parent: {
          id: "platoon-1",
          name: "1st Platoon",
          type: "Platoon",
          parent: {
            id: "company-a",
            name: "A CO 1/75th Ranger Regiment",
            type: "Company",
            parent: null,
          },
        },
      },
    },
    currentBillet: { name: "Team Leader" },
    currentMOS: { identifier: "11B", name: "Infantryman" },
  });

  assert.deepEqual(viewModel.profileFields, [
    ["RANK", "SGT"],
    ["NAME", "R. One"],
    ["TIS", "Not recorded"],
    ["TIG", "Not recorded"],
    ["UNIT", "A CO 1/75th Ranger Regiment"],
    ["ASSIGNMENT", "Team Leader"],
    ["PRIMARY MOS", "11B - Infantryman"],
    ["SECONDARY MOS", "None"],
  ]);
  assert.deepEqual(viewModel.administrativeStatus, [
    ["STATUS", "Active"],
    ["STANDING", "Good"],
  ]);
});

test("profile view model renders secondary MOS when present", () => {
  const viewModel = buildPersonnelProfileViewModel({
    name: "Joshua Howie",
    currentMOS: { identifier: "18Z", name: "Special Forces Senior Sergeant" },
    currentSecondaryMOS: { identifier: "68W", name: "Combat Medic" },
  });

  assert.deepEqual(viewModel.profileFields.slice(6), [
    ["PRIMARY MOS", "18Z - Special Forces Senior Sergeant"],
    ["SECONDARY MOS", "68W - Combat Medic"],
  ]);
});
