# Area 3: Portal Workflows

## Summary

Area 3 defines protected portal workflow behavior from the user-verified chat
plan only. Previous-build workflows, roles, routes, docs, catalogs, and
assumptions are not source material.

The portal workflow model is staff-owned, audit-heavy, archive-first, and
in-app-notification based. Members can start LOA requests and support tickets
only. Protected personnel changes remain staff-owned.

## Locked Workflow Rules

### Applicant To Member

- Applications begin as applicant-owned drafts and are not visible to
  reviewers until submitted.
- Applicants select interested recruiting-open units and desired recruiting-open
  MOS choices; the single target unit remains nullable until recruiter or
  target-unit assignment.
- Application flow is `Draft`, `Submitted`, `MoreInfoRequested`,
  `RecruiterScreening`, `RecruiterRecommended`, `TargetUnitReview`, then
  `Accepted`, `Denied`, `Withdrawn`, `Closed`, or `Converted`.
- Recruiters may request more information, recommend, assign a target unit, or
  deny applications during screening with reason and audit.
- A recruiter recommendation does not activate the account.
- Target-unit staff must approve or deny final acceptance after recruiter
  recommendation and target-unit assignment.
- Acceptance activates the account and creates the minimal personnel profile.
- Conversion is retained through application status and status history.
- Denied, withdrawn, and closed applications remain retained.

### Personnel Management

- Members cannot directly edit protected personnel fields.
- Authorized staff make protected personnel changes directly.
- Staff changes require reason, history entry, and audit record.
- Rank, unit, billet, MOS, staff assignment, service status, and
  good-standing changes retain history.
- Exceptional admin-created profiles require explicit authorization and audit
  reason.

### LOA

- Members may submit LOA requests.
- Staff may submit LOA requests on behalf of a member.
- Assigned unit staff approve normal LOA requests.
- LOA requests over 14 days escalate above normal unit-staff approval.
- Approved LOA creates an automatic status window.
- Attendance during approved LOA windows uses LOA handling.
- Return, cancellation, denial, withdrawal, and early return are recorded and
  audited.

### Events And Attendance

- Events can start from an event template or selected unit roster.
- Staff may adjust the expected roster before finalization.
- Event owner or authorized staff finalizes attendance.
- Normal attendance edits are locked after finalization.
- Post-finalization corrections require permission, reason, and audit.
- Approved LOA windows affect attendance eligibility and status.

### Training, Qualifications, And Service Records

- Authorized trainers or staff directly record official training completions.
- Qualification grant, expiration, suspension, revocation, and waiver are
  official service-history events.
- Promotions and awards use request approval before final records are created.
- Disciplinary records and administrative notes are direct restricted staff
  records with required audit and visibility controls.

### Support And Notifications

- Pending users can create limited intake or recovery support tickets.
- Members and staff can create normal support tickets.
- Tickets enter a category queue before assignment.
- Authorized staff may assign, comment, resolve, close, or void support
  tickets.
- Area 3 assumes in-app notification records only.
- Discord or other external delivery waits for External Connections planning.

## Required Workflow Interfaces

- Application review command.
- Recruiter recommendation command.
- Target-unit application decision command.
- Protected personnel update command.
- LOA review and escalation command.
- Event roster setup and adjustment command.
- Attendance finalization and correction command.
- Training record creation command.
- Qualification status update command.
- Promotion and award approval command.
- Restricted discipline and administrative note command.
- Support ticket routing and status command.
- Notification creation command.
- Audit write command.

Every workflow command must include actor, target record, requested action,
permission context, audit metadata, and a reason whenever the workflow requires
one. Status transitions are explicit and invalid jumps are denied by default.

Endpoint-by-endpoint API contracts remain deferred to Area 5. Exact role names,
permission keys, unit catalogs, rank catalogs, billet catalogs, MOS catalogs,
and staff titles remain deferred until user verification.

## Implemented Model Support

- `Application` tracks typed applicant identity, recruiting source, prior
  service, prior Arma unit history, leadership details, target unit, recruiter
  recommendation, target-unit decision, close timing, conversion, and status
  history.
- `ApplicationServicePeriod`, `ApplicationArmaUnit`, `ApplicationInterestUnit`,
  and `ApplicationDesiredMOS` store repeatable service, Arma, unit-interest, and
  desired-MOS selections.
- `ApplicationStatusHistory` records workflow stage, reason, permission
  context, and audit linkage.
- `LoaRequest` tracks approval level, escalation metadata, submitter,
  cancellation, withdrawal, early return, return confirmation, and audit
  linkage.
- `Event` tracks roster source, source unit, owner, roster finalization, and
  attendance finalization.
- `EventAttendance` tracks roster source and audited post-finalization
  correction metadata.
- `TrainingRecord` defaults to completed official records and records who
  entered the completion.
- `PersonnelQualification` tracks the account that changed a qualification
  status.
- `SupportTicket` tracks category queue, intake-only behavior, resolution,
  closure, voiding, and audit linkage.
- `Notification` is constrained to in-app workflow notification records.

## Acceptance Tests

- Applicant creates a draft, adds typed service/Arma rows, selects interested
  units and MOS choices, then submits into recruiter screening.
- Recruiter requests more information or denies during screening with reason and
  audit.
- Recruiter recommends an applicant, but account remains pending until
  target-unit staff approve.
- Target-unit staff accepts applicant, activating account and creating a
  minimal personnel profile.
- Member cannot directly edit protected personnel fields.
- Staff personnel change creates history and audit record.
- Member submits LOA; normal LOA routes to unit staff.
- LOA over 14 days escalates before approval.
- Approved LOA affects attendance during the approved date window.
- Event attendance finalization locks normal edits.
- Later attendance correction requires reason and audit.
- Authorized trainer records training completion directly.
- Promotion or award approval creates a final service record.
- Discipline and administrative notes are restricted and audited.
- Support ticket enters category queue and can be assigned, resolved, closed,
  or voided.
- Workflow events create in-app notifications only.
