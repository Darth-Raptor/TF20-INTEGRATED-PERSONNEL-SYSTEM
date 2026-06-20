import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPLICATION_AVAILABILITY_COPY,
  APPLICATION_AVAILABILITY_SLOTS,
  applicationAvailabilityLabel,
} from "../../src/shared/application-availability.mjs";

test("application availability slots are unique and stay in the required order", () => {
  assert.equal(APPLICATION_AVAILABILITY_SLOTS.length, 9);
  assert.deepEqual(
    APPLICATION_AVAILABILITY_SLOTS.map((slot) => slot.key),
    [
      "monday_evenings",
      "tuesday_evenings",
      "wednesday_evenings",
      "thursday_evenings",
      "friday_evenings",
      "saturday_afternoon",
      "saturday_evenings",
      "sunday_afternoon",
      "sunday_evenings",
    ],
  );
  assert.equal(
    new Set(APPLICATION_AVAILABILITY_SLOTS.map((slot) => slot.key)).size,
    APPLICATION_AVAILABILITY_SLOTS.length,
  );
});

test("application availability copy and labels are human-readable", () => {
  assert.match(APPLICATION_AVAILABILITY_COPY, /training sessions or operations/i);
  assert.equal(
    applicationAvailabilityLabel("sunday_afternoon"),
    "Sunday Afternoon (13:00 CST - 18:00 CST)",
  );
  assert.equal(applicationAvailabilityLabel("missing_slot"), "");
});
