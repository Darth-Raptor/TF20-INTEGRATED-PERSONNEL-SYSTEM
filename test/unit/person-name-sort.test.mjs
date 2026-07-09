import assert from "node:assert/strict";
import { test } from "node:test";

import {
  comparePersonNamesByLastName,
  personNameSortParts,
} from "../../src/shared/person-name-sort.mjs";

test("person-name comparator sorts by last token before first token", () => {
  const names = ["Alex Zimmer", "Chris Baker", "Bella Adams"];
  const sorted = [...names].sort(comparePersonNamesByLastName);
  assert.deepEqual(sorted, ["Bella Adams", "Chris Baker", "Alex Zimmer"]);
});

test("person-name comparator handles formatted initials and single-token names", () => {
  const names = ["J. Prates", "A. Lampe", "darthraptor"];
  const sorted = [...names].sort(comparePersonNamesByLastName);
  assert.deepEqual(sorted, ["darthraptor", "A. Lampe", "J. Prates"]);
});

test("person-name sort parts fall back cleanly for blank values", () => {
  assert.deepEqual(personNameSortParts("", "fallback"), {
    last: "fallback",
    first: "fallback",
    full: "fallback",
  });
});
