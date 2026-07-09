import assert from "node:assert/strict";
import { test } from "node:test";

import {
  resolveCompatibleBilletOptionsForUnit,
  resolveCompatibleMOSOptionsForUnit,
} from "../../src/server/personnel-service.mjs";

const ALL_UNITS = [
  { id: "root", parentId: null, hierarchyBase: 7000 },
  { id: "child", parentId: "root", hierarchyBase: 5000 },
  { id: "squad", parentId: "child", hierarchyBase: 3000 },
  { id: "other-root", parentId: null, hierarchyBase: 7000 },
  { id: "standalone", parentId: null, hierarchyBase: 5000 },
];

test("compatible billet options include ancestor-owned billets for descendant assignments", () => {
  const billets = [
    { id: "root-billet", unitId: "root", name: "Root Billet" },
    { id: "child-billet", unitId: "child", name: "Child Billet" },
    { id: "other-billet", unitId: "other-root", name: "Other Billet" },
  ];

  const options = resolveCompatibleBilletOptionsForUnit({
    allUnits: ALL_UNITS,
    billets,
    unitId: "squad",
  });

  assert.deepEqual(
    options.map((option) => option.id),
    ["root-billet", "child-billet"],
  );
});

test("compatible MOS options resolve to the nearest recruiting root", () => {
  const mos = [
    { id: "root-mos", unitId: "root", identifier: "11B", name: "Infantryman" },
    { id: "other-mos", unitId: "other-root", identifier: "15T", name: "Crew Chief" },
  ];

  const descendantOptions = resolveCompatibleMOSOptionsForUnit({
    allUnits: ALL_UNITS,
    mos,
    unitId: "squad",
  });
  assert.deepEqual(
    descendantOptions.map((option) => option.id),
    ["root-mos"],
  );

  const noRootOptions = resolveCompatibleMOSOptionsForUnit({
    allUnits: ALL_UNITS,
    mos,
    unitId: "standalone",
  });
  assert.deepEqual(noRootOptions, []);
});
