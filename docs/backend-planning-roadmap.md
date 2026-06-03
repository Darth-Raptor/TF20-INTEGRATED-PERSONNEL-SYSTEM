# Backend Planning Roadmap

## Summary

This document is the historical record of the restart branch planning and
foundation areas.

Areas 1 through 6 are complete and remain valid as the verified backend and
operational foundation for the project. They are no longer the forward
execution roadmap.

The active implementation roadmap now lives in `ROADMAP.md`.

## Completed Planning Areas

Implementation markers kept for validator compatibility:

- 4. External connections: implemented in `docs/external-connections.md` and
  encoded in `prisma/schema.prisma`
- 5. API and frontend contract: implemented in
  `docs/api-frontend-contract.md` and encoded in `prisma/schema.prisma`
- 6. Operations, security, and testing: implemented in
  `docs/operations-security-testing.md` and encoded in repo scripts, env
  contract, and runtime expectations

1. Source of truth and data model
   - implemented in `docs/source-of-truth-data-model.md` and
   - encoded in `prisma/schema.prisma`

2. Identity, roles, and access
   - implemented in `docs/identity-roles-access.md` and
   - encoded in `prisma/schema.prisma`

3. Portal workflows
   - implemented in `docs/portal-workflows.md` and
   - encoded in `prisma/schema.prisma`

4. External connections
   - implemented in `docs/external-connections.md` and
   - encoded in `prisma/schema.prisma`

5. API and frontend contract
   - implemented in `docs/api-frontend-contract.md` and
   - encoded in `prisma/schema.prisma`

6. Operations, security, and testing
   - implemented in `docs/operations-security-testing.md` and
   - encoded in repo scripts, env contract, and runtime expectations

## Foundation Outcome

The completed planning areas established:

- database-only operational source of truth
- clean-slate Prisma model inventory
- identity, role, permission, and session foundations
- workflow model for applications, personnel, LOA, events, training, support,
  and audit
- Discord-first external connection model
- hybrid REST contract direction
- single-VPS plus systemd operating model
- authoritative catalog source and validation path

## Current Execution Status

Implementation has already progressed beyond the Area 1-6 planning sequence.
The current local baseline now includes:

- runtime backend and auth foundation
- applicant-to-member workflow
- personnel core roster workflow

For the phased implementation path from this baseline to final deployment, use
`ROADMAP.md`.
