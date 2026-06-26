import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCalendarMonth,
  eventAttendanceScopeLabel,
  eventDateKeys,
  eventLocationLabel,
  eventTypeLabel,
  nextCalendarMonth,
  previousCalendarMonth,
} from "../../src/shared/events.mjs";

test("event display helpers return approved human-readable labels", () => {
  assert.equal(eventTypeLabel("CombatOperation"), "Combat Operation");
  assert.equal(eventTypeLabel("QualificationCourse"), "Qualification Course");
  assert.equal(eventLocationLabel("UnitServer"), "Unit Server");
  assert.equal(eventLocationLabel("TeamSpeak"), "Team Speak");
  assert.equal(eventAttendanceScopeLabel("Open"), "Open Attendance");
  assert.equal(eventAttendanceScopeLabel("UnitOnly"), "Unit Only Attendance");
});

test("calendar month helpers build a six-row month grid and adjacent month navigation", () => {
  const month = buildCalendarMonth("2026-06");

  assert.equal(month.monthKey, "2026-06");
  assert.equal(month.days.length, 42);
  assert.equal(month.days[0].key, "2026-05-31");
  assert.equal(month.days.at(-1)?.key, "2026-07-11");
  assert.equal(month.days.filter((day) => day.inMonth).length, 30);
  assert.equal(previousCalendarMonth("2026-06"), "2026-05");
  assert.equal(nextCalendarMonth("2026-06"), "2026-07");
});

test("event date keys preserve every local day spanned by an event", () => {
  assert.deepEqual(eventDateKeys("2026-06-10T19:00:00", "2026-06-10T23:00:00"), ["2026-06-10"]);
  assert.deepEqual(eventDateKeys("2026-06-10T19:00:00", "2026-06-12T01:00:00"), [
    "2026-06-10",
    "2026-06-11",
    "2026-06-12",
  ]);
});
