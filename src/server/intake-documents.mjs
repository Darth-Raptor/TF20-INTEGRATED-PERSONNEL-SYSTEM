import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const intakeDocumentsDir = path.join(projectRoot, "docs", "INTAKE DOCUMENTS");

const INTAKE_DOCUMENT_MANIFEST = [
  {
    key: "enlistment_requirements",
    title: "TF20/HHC - ENLISTMENT REQUIREMENTS",
    fileName: "TF20-HQ-ENLISTMENT REQUIREMENTS.pdf",
    sortOrder: 1,
  },
  {
    key: "in_game_names_policy",
    title: "TF20/HHC - IN-GAME NAMES POLICY",
    fileName: "TF20-HQ-IN-GAME NAMES POLICY.pdf",
    sortOrder: 2,
  },
  {
    key: "rules_and_regulations",
    title: "TF20/HHC - RULES AND REGULATIONS",
    fileName: "TF20-HQ-RULES AND REGULATIONS.pdf",
    sortOrder: 3,
  },
  {
    key: "classifications_agreement",
    title: "TF20/HHC - CLASSIFICATIONS AGREEMENT",
    fileName: "TF20-HQ-CLASSIFICATIONS AGREEMENT.pdf",
    sortOrder: 4,
  },
];

let cachedDocuments = null;

export function getCurrentIntakeDocuments() {
  if (!cachedDocuments) {
    cachedDocuments = INTAKE_DOCUMENT_MANIFEST.map((entry) => {
      const filePath = path.join(intakeDocumentsDir, entry.fileName);
      const bytes = fs.readFileSync(filePath);
      return {
        ...entry,
        filePath,
        documentSizeBytes: bytes.byteLength,
        documentSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      };
    });
  }

  return cachedDocuments.map((document) => ({ ...document }));
}

export function getCurrentIntakeDocument(documentKey) {
  return getCurrentIntakeDocuments().find((document) => document.key === documentKey) ?? null;
}

export function buildIntakeDocumentStatuses(application) {
  const agreements = application?.intakeAgreements ?? [];
  return getCurrentIntakeDocuments().map((document) => {
    const currentAgreement = agreements.find(
      (agreement) =>
        agreement.documentKey === document.key &&
        agreement.documentSha256 === document.documentSha256,
    );
    const latestAgreement = latestAgreementForKey(agreements, document.key);
    const visibleAgreement = currentAgreement ?? latestAgreement;
    return {
      key: document.key,
      title: document.title,
      fileName: document.fileName,
      sortOrder: document.sortOrder,
      documentSha256: document.documentSha256,
      documentHashShort: document.documentSha256.slice(0, 12),
      documentSizeBytes: document.documentSizeBytes,
      pdfUrl: `/applications/intake-documents/${encodeURIComponent(document.key)}/pdf`,
      status: currentAgreement ? "agreed" : latestAgreement ? "stale" : "missing",
      agreement: visibleAgreement
        ? {
            id: visibleAgreement.id,
            agreedAt: visibleAgreement.agreedAt,
            documentSha256: visibleAgreement.documentSha256,
            documentHashShort: visibleAgreement.documentSha256.slice(0, 12),
            documentTitle: visibleAgreement.documentTitle,
            fileName: visibleAgreement.fileName,
            accountId: visibleAgreement.accountId,
            ipAddress: visibleAgreement.ipAddress,
            userAgent: visibleAgreement.userAgent,
          }
        : null,
    };
  });
}

export function hasCurrentIntakeAgreements(application) {
  return buildIntakeDocumentStatuses(application).every((document) => document.status === "agreed");
}

export function attachIntakeDocumentStatuses(application) {
  if (!application) return null;
  return {
    ...application,
    intakeDocuments: buildIntakeDocumentStatuses(application),
  };
}

function latestAgreementForKey(agreements, documentKey) {
  return agreements
    .filter((agreement) => agreement.documentKey === documentKey)
    .sort((left, right) => new Date(right.agreedAt).getTime() - new Date(left.agreedAt).getTime())
    .at(0);
}
