import assert from "node:assert/strict";
import { test } from "node:test";

import {
  REMOVED_PERSONNEL_STATUSES,
  summarizeRemovedPersonnelStatusRows,
} from "../../scripts/check-removed-personnel-statuses.mjs";

test("retired personnel status preflight covers only the five removed values", () => {
  assert.deepEqual(REMOVED_PERSONNEL_STATUSES, [
    "Probationary",
    "Inactive",
    "Separated",
    "Discharged",
    "DoNotRehire",
  ]);
  assert.equal(
    summarizeRemovedPersonnelStatusRows({ profiles: [{ id: "p1" }], history: [{ id: "h1" }] })
      .count,
    2,
  );
});
