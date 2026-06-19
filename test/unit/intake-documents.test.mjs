import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { getCurrentIntakeDocuments } from "../../src/server/intake-documents.mjs";

test("intake document manifest exposes current documents in required order", () => {
  const documents = getCurrentIntakeDocuments();

  assert.deepEqual(
    documents.map((document) => document.title),
    [
      "TF20/HHC - ENLISTMENT REQUIREMENTS",
      "TF20/HHC - IN-GAME NAMES POLICY",
      "TF20/HHC - RULES AND REGULATIONS",
      "TF20/HHC - CLASSIFICATIONS AGREEMENT",
    ],
  );
  assert.deepEqual(
    documents.map((document) => document.fileName),
    [
      "TF20-HQ-ENLISTMENT REQUIREMENTS.pdf",
      "TF20-HQ-IN-GAME NAMES POLICY.pdf",
      "TF20-HQ-RULES AND REGULATIONS.pdf",
      "TF20-HQ-CLASSIFICATIONS AGREEMENT.pdf",
    ],
  );
  assert.deepEqual(
    documents.map((document) => document.sortOrder),
    [1, 2, 3, 4],
  );

  for (const document of documents) {
    assert.equal(fs.existsSync(document.filePath), true);
    assert.equal(document.documentSizeBytes > 0, true);
    assert.match(document.documentSha256, /^[a-f0-9]{64}$/);
  }
});
