# Catalog Governance

## Summary

Official TF20 catalogs are repo-driven. The authoritative source lives in
`prisma/catalog-source.mjs`. That file is regenerated from the approved Phase 2
review CSV set, then used for initial bootstrap and future catalog expansion
through the same validation path.

## Catalog Update Rules

- Add or change catalog items in `prisma/catalog-source.mjs`.
- Run the catalog validator before syncing.
- Use bootstrap seed for first-time environment setup.
- Use catalog sync for later additive updates.
- Do not remove referenced catalog records by default.
- Retire or deprecate catalog items with `CatalogStatus` rather than
  destructive deletion.
- Treat key or code renames as explicit migration work, not casual edits.

## Families

The authoritative source governs:

- roles
- permissions
- units
- ranks
- billets
- staff sections
- MOS
- training courses
- qualifications
- awards

## Future Growth

Later additions follow the same process:

1. update the authoritative source
2. run validation
3. run catalog sync
4. verify resulting database state

In-app catalog editing is not part of the current operating model.
