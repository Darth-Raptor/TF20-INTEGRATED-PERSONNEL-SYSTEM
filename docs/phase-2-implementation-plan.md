# Phase 2 Implementation Plan

## Summary

Implement the approved Phase 2 review CSVs from `phase two review files` as
the **only decision source** for Phase 2, while keeping
`prisma/catalog-source.mjs` as the repo's long-term source of truth.

Locked decisions for this phase:

- CSV files are review inputs only; approved values are pushed into
  `prisma/catalog-source.mjs`
- schema changes are allowed and required where CSV shapes demand them
- CSV keys become final identifiers
- unit hierarchy expands to the full depth shown in `units.csv`
- `role_precedence` becomes real authority-order logic
- `minimum_role_key` becomes a rule used to derive permission grants
- `minimum_rank_key` and `command_precedence` become real backend-supported
  billet rules
- training courses, qualifications, and awards are fully seeded
- CSV enum values are final authority, but values that are not valid Prisma
  identifiers must be normalized into valid backend enum identifiers while
  preserving human display wording separately
- `MOS` fully replaces `Specialty` in schema/model/field naming
- implementation must happen in planned subpasses
- suspicious or contradictory CSV values must be flagged and stop the pass for
  review
- the reuploaded CSVs are the only Phase 2 decision source, not the markdown
  workbook

## Key Changes

### 1. Add a CSV ingestion and validation layer

- Build a Phase 2 import path that reads the approved CSV files from the
  review folder and converts them into normalized backend inputs.
- Validate each CSV for:
  - required columns
  - duplicate keys
  - missing references
  - invalid hierarchy references
  - invalid enum names
  - contradictory authority metadata
- Add an explicit stop condition: if a CSV value looks suspicious,
  contradictory, or structurally unsafe, stop the pass and report the exact
  row and issue instead of guessing.

### 2. Update the canonical catalog source from the approved CSVs

- Regenerate the contents of `prisma/catalog-source.mjs` from the approved CSV
  inputs.
- Adopt CSV identifiers as final for:
  - roles
  - permissions
  - units
  - ranks
  - billets
  - MOS
  - staff selections/sections
  - training courses
  - qualifications
  - awards
- Preserve human-readable display values from the CSVs in the canonical source
  alongside stable backend keys.
- Replace current placeholder or partial catalog content completely where the
  CSVs provide the final set.

### 3. Reshape the schema to support the approved CSV model

- Rename the `Specialty` domain to `MOS` throughout the schema and related
  runtime references.
- Add or update schema support for:
  - role precedence
  - unit hierarchy base / deeper hierarchy support
  - billet minimum-rank rules
  - billet command precedence
  - any additional catalog metadata required by the approved CSV columns
- Update enum definitions from `enumns.csv`, using valid Prisma-safe
  identifiers such as `HonorableDischarge` while preserving the CSV's human
  wording separately for display/docs.
- Expand the current unit structure to the full company/platoon/squad/team
  depth represented in the CSVs.

### 4. Update authority and derivation logic

- Treat `role_precedence` as real authority-order logic, not display-only
  metadata.
- Derive role permission grants from `minimum_role_key` according to the
  approved role ordering.
- Treat `command_precedence` as real chain-of-command ordering logic for
  billets.
- Treat `minimum_rank_key` as a real assignment/eligibility rule for billets.
- Update runtime assumptions, validators, and planning docs so the backend
  logic matches the new authority model.

### 5. Reconcile runtime, validators, and docs with the new backend truth

- Update runtime code and backend docs anywhere old identifiers or old catalog
  assumptions remain.
- Update validators so they enforce:
  - CSV-derived canonical catalog content
  - renamed MOS schema surfaces
  - new enum sets
  - new hierarchy depth
  - new precedence fields and authority rules
- Keep the runtime behavior aligned with the new enum and catalog authority
  even where it differs from the current local implementation.

## Planned Subpasses

### Subpass 1: CSV validation and normalization

- parse all approved CSVs
- validate structure and cross-references
- normalize enum values into valid backend identifiers
- stop on suspicious rows

### Subpass 2: Schema and identifier refactor

- rename `Specialty` to `MOS`
- add precedence and hierarchy-support fields
- update enums from CSV authority
- update references across schema and runtime

### Subpass 3: Canonical catalog regeneration

- rewrite `prisma/catalog-source.mjs` from approved CSV values
- replace partial seeded families with full approved sets
- derive permission grants from `minimum_role_key`

### Subpass 4: Seed/sync and validator updates

- update seed/sync logic for the new catalog shapes
- update check scripts to validate the new schema/catalog truth
- ensure suspicious-data stop behavior is enforced

### Subpass 5: Runtime and contract alignment

- update current runtime code and backend docs to the new identifiers and
  authority model
- align `/auth/*`, `/me/*`, `/applications/*`, and `/personnel/*` assumptions
  where renamed fields or enums changed behavior

### Subpass 6: Full verification

- run full repo checks
- run smoke
- verify current implemented flows still work under the new backend truth
  unless intentionally changed by the CSV decisions

## Important Interfaces

Phase 2 implementation will directly update:

- `prisma/schema.prisma`
- `prisma/catalog-source.mjs`
- seed/sync logic in `prisma/seed.mjs`
- backend validators in `scripts/check-*.mjs`
- runtime references to current catalog/schema naming, especially current
  personnel/MOS-related code
- backend docs that still describe the pre-CSV backend shape

New or updated backend-supported concepts:

- valid enum identifier normalization with separate display wording
- full unit hierarchy depth
- MOS replacing Specialty
- role precedence
- derived permission grants from minimum role
- billet minimum-rank enforcement
- billet command-chain precedence

## Test Plan

### CSV ingestion and safety

- every CSV parses successfully
- duplicate keys fail
- missing references fail
- invalid parent/unit/rank/role references fail
- suspicious values stop the pass with a clear report

### Schema and catalog

- `Specialty` references are fully replaced by `MOS`
- new enum identifiers compile in Prisma
- human display wording is preserved where enum normalization was needed
- full catalog families are seeded from the approved CSVs
- unit hierarchy is seeded through the full depth provided

### Authority and derivation

- permission grants derive correctly from `minimum_role_key`
- role precedence supports authority ordering logic
- billet `minimum_rank_key` is available for backend rule enforcement
- billet `command_precedence` supports chain-of-command ordering logic

### Runtime regression

- `npm run check`
- `npm run smoke`
- local server boots cleanly
- Discord login still works
- applicant submission and conversion still work unless intentionally changed
- personnel self-view and scoped personnel flows still work with MOS naming
  and updated enums

## Assumptions

- The CSV files in the review folder are the only Phase 2 decision source.
- `catalog-source.mjs` remains the long-term canonical repo source after CSV
  import.
- Suspicious data should block implementation progress rather than be
  auto-corrected silently.
- Backend identifier correctness matters more than preserving current runtime
  behavior where the CSV authority intentionally changes the backend model.
