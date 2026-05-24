# TF20 PMS Restart Roadmap

## Current Position

The restart has implemented Area 1, Area 2, and Area 3 foundation work.

Implemented:

- clean-slate Prisma model inventory
- Area 1, Area 2, and Area 3 validation scripts
- seed script that intentionally avoids unverified catalog values
- planning docs for the source-of-truth boundary
- planning docs for identity, roles, access, bootstrap, recovery, sessions, and
  scoped authorization
- planning docs for portal workflows, including applications, personnel
  changes, LOA, attendance, training, service records, support, notifications,
  and audit

## Next Planning Areas

1. External connections.
2. API and frontend contract.
3. Operations, security, and testing.

Each area must be planned and verified before implementation.

## Non-Negotiables

- The database is the only operational source of truth.
- The previous build is archive-only.
- No external roster/import system is planned.
- Official catalog values must be provided and verified before seeding.
- Area 2 access foundations are model and planning artifacts; runtime auth
  endpoints are deferred until API/frontend contract planning.
