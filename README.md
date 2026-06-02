# Task Force 20 PMS Restart

This branch is a clean-slate planning, data-model, and catalog-governance
foundation for the Task Force 20 Personnel Management System.

The archived previous build is not a source of truth for this restart. Do not
copy old schema, workflow, catalog, role, route, or deployment decisions into
this branch unless the user explicitly verifies and re-approves them.

## Current State

Areas 1, 2, 3, 4, 5, and 6 are implemented:

- Backend database source-of-truth plan.
- Clean-slate Prisma data model.
- Identity, roles, access, bootstrap, recovery, and session foundation plan.
- Portal workflow foundation for applications, personnel changes, LOA,
  events/attendance, training, service records, support, notifications, and
  audit.
- External-connections foundation for Discord-only login plus guild and
  notification planning, optional Steam linking and enrichment, and zero legacy
  runtime integrations.
- API and frontend contract foundation for hybrid REST route families,
  protected portal plus pending-user/applicant screens, workflow action
  endpoints, and shared response rules.
- Operations, security, and testing foundation for single-VPS plus systemd
  deployment, env-only secrets, daily backups, CI quality gates, smoke
  verification, and incident-response expectations.
- Authoritative catalog source plus bootstrap/sync path for official TF20
  catalogs and future additive catalog growth.
- Initial runtime backend/auth foundation for Express, Prisma, Discord auth,
  DB-backed sessions, gate screens, and health/bootstrap routes.
- Area 1, Area 2, Area 3, Area 4, Area 5, and Area 6 validation scripts.
- Catalog source validation and smoke validation scripts.

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
node --check prisma/catalog-source.mjs
node --check prisma/seed.mjs
node --check src/server/config.mjs
node --check src/server/db.mjs
node --check src/server/errors.mjs
node --check src/server/cookies.mjs
node --check src/server/access.mjs
node --check src/server/auth-service.mjs
node --check src/server/middleware.mjs
node --check src/server/views.mjs
node --check src/server/app.mjs
node --check src/server/index.mjs
node --check scripts/check-area1-model.mjs
node --check scripts/check-area2-access.mjs
node --check scripts/check-area3-workflows.mjs
node --check scripts/check-area4-external-connections.mjs
node --check scripts/check-area5-api-frontend-contract.mjs
node --check scripts/check-area6-operations-security-testing.mjs
node --check scripts/check-catalog-source.mjs
node --check scripts/smoke.mjs
node scripts/check-area1-model.mjs
node scripts/check-area2-access.mjs
node scripts/check-area3-workflows.mjs
node scripts/check-area4-external-connections.mjs
node scripts/check-area5-api-frontend-contract.mjs
node scripts/check-area6-operations-security-testing.mjs
node scripts/check-catalog-source.mjs
node scripts/smoke.mjs
```

`npm run check` runs the same foundation checks when `npm` is
available.

## Important Boundaries

- Catalog values now live in the authoritative source and future additions must
  go through the same repo-driven validation and sync path.
- Endpoint-by-endpoint API contracts are deferred to Area 5.
- Runtime deployment instructions are deferred until operations planning.
- No external roster/import system is planned.
