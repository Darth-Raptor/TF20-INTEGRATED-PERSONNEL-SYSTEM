# Task Force 20 PMS Restart

This branch is a clean-slate planning and data-model foundation for the Task
Force 20 Personnel Management System.

The archived previous build is not a source of truth for this restart. Do not
copy old schema, workflow, catalog, role, route, or deployment decisions into
this branch unless the user explicitly verifies and re-approves them.

## Current State

Areas 1, 2, and 3 are implemented:

- Backend database source-of-truth plan.
- Clean-slate Prisma data model.
- Identity, roles, access, bootstrap, recovery, and session foundation plan.
- Portal workflow foundation for applications, personnel changes, LOA,
  events/attendance, training, service records, support, notifications, and
  audit.
- No official unit, rank, billet, staff-section, MOS, role, or permission
  catalog values seeded yet.
- Area 1, Area 2, and Area 3 validation scripts.

## Planning Order

1. Source of truth and data model.
2. Identity, roles, and access.
3. Portal workflows.
4. External connections.
5. API and frontend contract.
6. Operations, security, and testing.

## Foundation Validation

Run:

```bash
node --check prisma/seed.mjs
node --check scripts/check-area1-model.mjs
node --check scripts/check-area2-access.mjs
node --check scripts/check-area3-workflows.mjs
node scripts/check-area1-model.mjs
node scripts/check-area2-access.mjs
node scripts/check-area3-workflows.mjs
```

`npm run check` runs the same foundation checks when `npm` is
available.

## Important Boundaries

- Exact catalog values must come from the user in a later verification pass.
- Endpoint-by-endpoint API contracts are deferred to Area 5.
- Runtime deployment instructions are deferred until operations planning.
- No external roster/import system is planned.
