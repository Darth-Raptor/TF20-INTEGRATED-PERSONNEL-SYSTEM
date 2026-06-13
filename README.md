# Task Force 20 Integrated Personnel System

## Current Status

This repo is the clean-slate restart of the Task Force 20 Integrated Personnel
System. The project is now past the planning-only stage and has a working local
runtime baseline.

Implemented locally:

- Areas 1 through 6 planning and validation
- Area 4 external connections planning is implemented and locked
- Area 5 API and frontend contract planning is implemented and locked
- Area 6 operations, security, and testing planning is implemented and locked
- CSV-reviewed canonical catalog source plus bootstrap/sync path
- Express plus Prisma runtime foundation
- Discord auth, guild verification, DB-backed sessions, and gate handling
- applicant-to-member workflow:
  - pending user login
  - application submission
  - recruiter review
  - target-unit acceptance
  - conversion into active member profile
- personnel core roster workflow:
  - active member self-view
  - scoped staff roster
  - personnel detail
  - audited personnel updates for name, status, unit, rank, billet, MOS,
    and good standing

## Current Runtime Surface

The currently implemented route families are:

- `/auth/*`
- `/me/*`
- `/applications/*`
- `/personnel/*`

The remaining major workflow families are still ahead on the roadmap:

- `/loa/*`
- `/events/*`
- `/attendance/*`
- `/training/*`
- `/qualifications/*`
- `/promotions/*`
- `/awards/*`
- `/support/*`
- `/notifications/*`
- `/audit/*`
- `/access/*`
- `/bootstrap/*`

## Validation

Primary local validation commands:

```bash
npm run format:check
npm run lint
npm run test
npm run test:integration
npm run check
npm run smoke
```

`npm run test:integration` requires `TEST_DATABASE_URL` and refuses to run
against the normal development `DATABASE_URL`.

For local MySQL, create a separate test database and grant the app user access
before running integration tests. Example shape:

```sql
CREATE DATABASE tf20_test;
GRANT ALL PRIVILEGES ON tf20_test.* TO 'tf20_user'@'127.0.0.1';
```

Local runtime control:

```bash
npm start
npm run stop
```

Manual local verification for the current baseline should cover:

- Discord login
- pending-user gate
- applicant submission
- recruiter review and acceptance
- conversion to active member
- personnel self-view
- scoped personnel roster/detail/update

## Roadmap

`ROADMAP.md` is the canonical phased execution roadmap for the project from the
current local baseline through final deployment.

`docs/backend-planning-roadmap.md` remains the record of completed Areas 1
through 6 planning and foundation work.

## Non-Negotiables

- the database is the only operational source of truth
- the previous build is archive-only
- no legacy runtime integrations are planned
- official catalog changes must go through the authoritative source and
  validation path
- production target remains one VPS with systemd and MySQL
