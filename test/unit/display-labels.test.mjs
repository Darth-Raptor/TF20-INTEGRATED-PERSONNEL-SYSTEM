import assert from "node:assert/strict";
import { test } from "node:test";

import { personDisplayName } from "../../src/shared/display-labels.mjs";

test("person names display as first initial and final name token", () => {
  assert.equal(personDisplayName({ firstName: "Mary", lastName: "Smith" }), "M. Smith");
  assert.equal(personDisplayName({ fullName: "Mary Jane Smith" }), "M. Smith");
  assert.equal(personDisplayName({ fullName: "darthraptor" }), "darthraptor");
  assert.equal(personDisplayName({}, "Unknown member"), "Unknown member");
});
