import {
  loadPhase2ReviewCsvs,
  summarizePhase2ReviewCsvs,
  validatePhase2ReviewCsvs,
} from "../prisma/phase2-review-csv-loader.mjs";
import { buildCatalogSource } from "../prisma/phase2-catalog-source-builder.mjs";
import { catalogSource } from "../prisma/catalog-source.mjs";

const source = loadPhase2ReviewCsvs({ projectRoot: process.cwd() });
validatePhase2ReviewCsvs(source);
const expectedCatalogSource = buildCatalogSource(source);

if (JSON.stringify(catalogSource) !== JSON.stringify(expectedCatalogSource)) {
  console.error(
    "catalog-source.mjs is out of sync with the approved Phase 2 review CSVs. Run `npm run phase2:catalog:generate`.",
  );
  process.exit(1);
}

const summary = summarizePhase2ReviewCsvs(source);
console.log(
  `Phase 2 review CSV check passed: ${summary.roles} roles, ${summary.permissions} permissions, ${summary.units} units, ${summary.ranks} ranks, ${summary.billets} billets, ${summary.staffSelections} staff selections, ${summary.mos} MOS entries, ${summary.trainingCourses} training courses, ${summary.qualifications} qualifications, ${summary.awards} awards, ${summary.enums} enums (${summary.enumValues} values).`,
);
if (summary.enumDisplayMappings > 0) {
  console.log(
    `Enum normalization preview prepared for ${summary.enumDisplayMappings} values.`,
  );
}
