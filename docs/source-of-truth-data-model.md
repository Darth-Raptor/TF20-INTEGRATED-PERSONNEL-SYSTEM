# Area 1: Source Of Truth And Data Model

## Summary

The backend database is the only operational source of truth for the restart.
This document records the implemented Area 1 model inventory and the decisions
that shaped it.

The previous build is archive-only. Its files, schema, workflows, catalogs,
roles, and docs must not be treated as source material for this restart.

## Implemented Record Groups

- Identity and access: `Account`, `AuthIdentity`, `Session`,
  `SessionRevocation`, `Role`, `Permission`, `PermissionGrant`,
  `RoleAssignment`, `AccountRecoveryRequest`, `AccessBootstrap`.
- Organization: hierarchical `Unit`, `Rank`, `Billet`, `StaffSection`,
  `MOS`.
- Personnel: `PersonnelProfile`, status/rank/unit/billet/MOS/staff
  assignment/good-standing history records.
- Recruiting: `Application`, `ApplicationServicePeriod`,
  `ApplicationArmaUnit`, `ApplicationInterestUnit`, `ApplicationDesiredMOS`,
  `ApplicationAnswer`, `ApplicationStatusHistory`, `ApplicationReviewNote`.
- Operations: `EventTemplate`, `Event`, `EventAttendance`, `LoaRequest`.
- Training and qualifications: `TrainingCourse`, `Qualification`,
  `CourseQualification`, `TrainingRecord`, `PersonnelQualification`.
- Service records: `PromotionRequest`, `PromotionRecord`, `Award`,
  `AwardRequest`, `AwardRecord`, `DisciplinaryRecord`,
  `AdministrativeNote`.
- System records: `SupportTicket`, `SupportTicketComment`, `Notification`,
  `AuditLog`, `IntegrationLog`.

## Locked Decisions

- Discord is the first planned login provider, represented by separate
  `AuthIdentity` records.
- Applicants have accounts and applications, but no personnel profile until
  acceptance or authorized admin exception.
- Recruiting-open unit and MOS flags control applicant-facing interest and MOS
  selections without deleting retained catalog records.
- Personnel profiles store current snapshot fields plus dedicated history for
  service-changing fields.
- Role assignments support optional global, unit, or staff-section scope.
- Operational records follow archive-first retention through status, closure,
  voiding, or inactive states.
- Protected writes must create audit records.

## Catalog Policy

Official catalog values are now implemented from the approved Phase 2 review
CSV files. The repo-tracked canonical source remains `prisma/catalog-source.mjs`,
which is regenerated from that reviewed Phase 2 input and used by seed/sync.

The authoritative families are:

- roles and permissions
- units
- ranks
- billets
- staff sections
- MOS
- training courses
- qualifications
- awards

Catalog changes remain repo-driven and validation-backed rather than ad hoc
runtime edits.

## Validation

Use `scripts/check-area1-model.mjs` to confirm the approved Area 1 model
inventory exists and retired previous-build model names are not present in the
Prisma schema.
