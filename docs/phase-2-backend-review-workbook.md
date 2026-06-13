# Phase 2 Backend Review Workbook

## Purpose

This workbook is the temporary **Phase 2 review authority** for backend
finalization. It is designed to be read and edited like a review packet first,
and a backend reference second.

If this workbook conflicts with current schema, catalog, route, or doc
wording, this workbook wins for Phase 2 implementation.

## How To Use This Workbook

Recommended editing order:

1. complete the terminology and naming review
2. complete the schema and enum review
3. complete the catalog review
4. complete the access and workflow contract review
5. fill out the signoff section at the end
6. use the appendices only when you need exact current values

Editing rules:

- mark unresolved items with `[UNRESOLVED]`
- mark intentionally deferred items with `[DEFER]`
- if you want something renamed, removed, merged, split, or added, say so
  directly in the relevant decision form
- keep final decisions short and explicit so implementation does not need to
  infer intent

Current local baseline before Phase 2:

- planning Areas 1 through 6 are complete
- catalog governance is implemented
- runtime auth/session/gating is implemented
- applicant-to-member flow is implemented
- personnel core roster slice is implemented

Currently implemented runtime route families:

- `/auth/*`
- `/me/*`
- `/applications/*`
- `/personnel/*`

## Contents

1. Terminology And Naming Review
2. Schema And Enum Review
3. Catalog Review
4. Access And Workflow Contract Review
5. Phase 2 Signoff
6. Appendices

---

## 1. Terminology And Naming Review

### What You Are Deciding Here

You are deciding the final words and identifiers the backend should use across
schema, catalogs, permissions, routes, and workflow actions.

### 1.1 Product Terminology

Current state:

- product name currently appears as `Task Force 20 Integrated Personnel System`
- public/protected split currently appears as `public recruiting/front-door
site` and `protected Task Force 20 Integrated Personnel System`
- backend style is currently `hybrid REST`
- operational source of truth is currently described as `database-only
operational source of truth`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 1.2 Personnel Terminology

Current state:

- personnel identity field is currently `name`
- there is no distinction between schema wording and user-facing wording here
- current personnel domain terms include `PersonnelStatus`, `goodStanding`,
  `StaffSection`, and `MOS`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 1.3 Workflow Terminology

Current state:

- applicant workflow model is `Application`
- recruiter review action is `recommend`
- target-unit workflow currently uses `assign-unit`, `accept`, and `reject`
- LOA wording is `LoaRequest` and `LOA`
- attendance correction action is `correct`
- support queue wording uses `SupportTicket` and `queueKey`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 1.4 Route And Action Naming

Current state:

- current route families already in use are `/auth/*`, `/me/*`,
  `/applications/*`, and `/personnel/*`
- future route families already planned include `/loa/*`, `/events/*`,
  `/attendance/*`, `/training/*`, `/qualifications/*`, `/promotions/*`,
  `/awards/*`, `/support/*`, `/notifications/*`, `/audit/*`, `/access/*`,
  and `/bootstrap/*`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 1.5 Permission Namespace Wording

Current state:

- permission keys use the `module.action` shape
- current namespace families include `accounts`, `access`, `catalogs`,
  `applications`, `personnel`, `events`, `attendance`, `loa`, `training`,
  `serviceRecords`, `support`, `audit`, `notifications`, and `integrations`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 1.6 Audit And Integration Wording

Current state:

- audit model is `AuditLog`
- integration model is `IntegrationLog`
- audit severity enum is `AuditSeverity`
- integration status enum is `IntegrationLogStatus`
- protected write marker is `protectedWrite`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

---

## 2. Schema And Enum Review

### What You Are Deciding Here

You are deciding the final backend model structure, model names, enum names,
enum values, and any major structural additions or removals.

### 2.1 Model Groups

#### Identity And Access

Current state:

- models in this group:
  - `Account`
  - `AuthIdentity`
  - `Session`
  - `SessionRevocation`
  - `Role`
  - `Permission`
  - `PermissionGrant`
  - `RoleAssignment`
  - `AccountRecoveryRequest`
  - `AccessBootstrap`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### Catalogs And Organization

Current state:

- models in this group:
  - `Unit`
  - `Rank`
  - `Billet`
  - `StaffSection`
  - `MOS`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### Personnel

Current state:

- models in this group:
  - `PersonnelProfile`
  - `PersonnelStatusHistory`
  - `PersonnelRankHistory`
  - `PersonnelUnitAssignment`
  - `PersonnelBilletAssignment`
  - `PersonnelMOSHistory`
  - `StaffAssignment`
  - `PersonnelStandingHistory`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### Recruiting

Current state:

- models in this group:
  - `Application`
  - `ApplicationAnswer`
  - `ApplicationStatusHistory`
  - `ApplicationReviewNote`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### LOA, Events, And Attendance

Current state:

- models in this group:
  - `EventTemplate`
  - `Event`
  - `EventAttendance`
  - `LoaRequest`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### Training And Qualifications

Current state:

- models in this group:
  - `TrainingCourse`
  - `Qualification`
  - `CourseQualification`
  - `TrainingRecord`
  - `PersonnelQualification`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### Promotions, Awards, And Restricted Records

Current state:

- models in this group:
  - `PromotionRequest`
  - `PromotionRecord`
  - `Award`
  - `AwardRequest`
  - `AwardRecord`
  - `DisciplinaryRecord`
  - `AdministrativeNote`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

#### Support, Notifications, Audit, And Integrations

Current state:

- models in this group:
  - `SupportTicket`
  - `SupportTicketComment`
  - `Notification`
  - `AuditLog`
  - `IntegrationLog`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

### 2.2 Enums

Current state:

- the backend currently uses enums for account status, auth provider, scope,
  recovery/bootstrap/session lifecycle, catalogs, personnel, applications,
  assignments, events, attendance, LOA, qualifications, shared request status,
  visibility, support, notifications, audit, and integrations
- the exact current enum values are listed in Appendix A

Major issues to review:

- whether any enum names should be renamed
- whether any enum values are awkward, incomplete, or inconsistent
- whether any values should be merged, split, added, or removed

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Merge / split:
- Reason / notes:
- Final decision:

### 2.3 Field-Level Schema Notes

Use this section only for important field-level changes that are not already
clear from the group decisions above.

#### Identity And Access

- Current state:
- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

#### Catalogs And Organization

- Current state:
- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

#### Personnel

- Current state:
- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

#### Recruiting

- Current state:
- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

#### Operations, Training, Support, Audit, And Integrations

- Current state:
- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

---

## 3. Catalog Review

### What You Are Deciding Here

You are deciding the final controlled values the backend will use for roles,
permissions, units, ranks, billets, staff sections, specialties, training
courses, qualifications, awards, and other catalog-driven data.

### 3.1 Catalog-Wide Rules

Current state:

- catalog version is currently `2026-06-02-step1`
- catalog policy is currently `Catalog changes are repo-driven, additive by
default, and non-destructive for referenced records.`
- catalog lifecycle currently uses `Draft`, `Active`, `Inactive`, and
  `Archived`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.2 Roles

Current state:

- seeded role keys currently are:
  - `pending-user`
  - `member`
  - `recruiter`
  - `unit-staff`
  - `command-staff`
  - `trainer`
  - `system-admin`

Major issues to review:

- whether these are the final role keys
- whether the role names are correct and user-friendly
- whether the grant sets reflect final authority boundaries

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.3 Permissions

Current state:

- permissions are currently seeded and grouped under the namespace families
  already listed in Section 1.5
- exact current permissions are listed in Appendix B

Major issues to review:

- whether permission keys and action names are final
- whether sensitive categories are correct
- whether recent-auth flags are correct
- whether any permissions are missing or overly broad

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.4 Units

Current state:

- current unit tree has:
  - `TF20`
  - `TF20-RANGER-A`
  - `TF20-SFOD-A1`
  - `TF20-SOAR-B160`

Major issues to review:

- whether the unit list is complete
- whether names and codes are final
- whether hierarchy and ordering are correct

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.5 Ranks

Current state:

- current seeded ranks include officer, warrant officer, and enlisted values
- exact current rank entries are listed in Appendix C

Major issues to review:

- whether the rank list is complete
- whether names, abbreviations, categories, and order are final

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.6 Billets

Current state:

- billets are currently seeded for the Ranger, SFOD, and SOAR unit entries
- exact current billet entries are listed in Appendix D

Major issues to review:

- whether the billet inventory is complete
- whether wording and categories are appropriate
- whether any entries should be renamed, added, or removed

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.7 Staff Sections

Current state:

- only one staff section is currently seeded: `J2`

Major issues to review:

- whether the staff section list is complete
- whether naming should change

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.8 Specialties

Current state:

- specialties are currently seeded with infantry, engineer, fires, signal,
  medical, aviation, and special forces examples
- exact current entries are listed in Appendix E

Major issues to review:

- whether the specialty/MOS list is complete
- whether names, codes, and categories are final

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.9 Training Courses

Current state:

- no training courses are currently seeded

Major issues to review:

- whether courses should be added now
- whether course structure needs adjustment before seeding

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.10 Qualifications

Current state:

- no qualifications are currently seeded

Major issues to review:

- whether qualifications should be added now
- whether qualification structure or lifecycle needs adjustment

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 3.11 Awards

Current state:

- no awards are currently seeded

Major issues to review:

- whether awards should be added now
- whether award structure or categories need adjustment

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

---

## 4. Access And Workflow Contract Review

### What You Are Deciding Here

You are deciding the final backend-facing access vocabulary, gate wording,
route family names, and workflow action naming that should be treated as the
backend contract foundation.

### 4.1 Permission Namespace And Sensitive Categories

Current state:

- current namespace families are:
  - `accounts.*`
  - `access.*`
  - `catalogs.*`
  - `applications.*`
  - `personnel.*`
  - `events.*`
  - `attendance.*`
  - `loa.*`
  - `training.*`
  - `serviceRecords.*`
  - `support.*`
  - `audit.*`
  - `notifications.*`
  - `integrations.*`
- current sensitive categories are:
  - `identity`
  - `recovery`
  - `access-management`
  - `disciplinary`
  - `administrative-notes`
  - `private-loa`
  - `audit`
  - `integration`

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 4.2 Route Families

Current state:

- current contract route families are:
  - `/auth/*`
  - `/me/*`
  - `/applications/*`
  - `/personnel/*`
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

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 4.3 Workflow Action Endpoints

Current state:

- current implemented runtime actions already exist for auth, session bootstrap,
  applicant flow, and personnel updates
- planned workflow action endpoints are summarized in Appendix F

Major issues to review:

- whether action names are final
- whether route shapes are final
- whether existing runtime actions match the intended contract vocabulary

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

### 4.4 Gate And Blocked-State Wording

Current state:

- current gate concepts are:
  - pending
  - active
  - locked
  - disabled
  - archived
  - not-in-guild
- pending users currently have access only to application, limited support,
  and recovery functions

Decision form:

- Keep as-is:
- Change to:
- Add:
- Remove:
- Reason / notes:
- Final decision:

---

## 5. Phase 2 Signoff

### What You Are Deciding Here

This is the implementation handoff section. Fill it out only after the rest of
the workbook is done.

### 5.1 Approved Changes

-

### 5.2 Rejected Changes

-

### 5.3 Deferred Items

-

### 5.4 Migration-Risk Items

-

### 5.5 Finalized Decisions Summary

This section is required. Keep it short and explicit.

- Schema decisions:
- Catalog decisions:
- Naming decisions:
- Route/action decisions:
- Permission/access decisions:
- Anything intentionally left unchanged:

---

## 6. Appendices

These appendices preserve the exact current backend reference data so no detail
is lost. Use them when you need the full current values.

### Appendix A: Current Enum Snapshot

```text
AccountStatus = Pending, Active, Locked, Disabled, Archived
AuthProvider = Discord
RoleScopeType = Global, Unit, StaffSection
RecoveryStatus = Open, Approved, Denied, Completed, Cancelled
BootstrapStatus = Open, Completed, Expired, Revoked
SessionRevocationScope = Account, Global
CatalogStatus = Draft, Active, Inactive, Archived
PersonnelStatus = Recruit, Probationary, Active, Reserve, LeaveOfAbsence, Inactive, Separated, Discharged, DoNotRehire
ApplicationStatus = Submitted, RecruiterScreening, RecruiterRecommended, TargetUnitReview, Accepted, Denied, Withdrawn, Closed, Converted
ApplicationReviewStage = RecruiterScreening, TargetUnitReview, FinalDecision
AssignmentType = Primary, Secondary, Temporary, Staff
EventStatus = Draft, Scheduled, RosterFinalized, Completed, Cancelled, Archived
EventRosterSource = Template, UnitRoster, ManualAdjustment
AttendanceStatus = Expected, Present, Partial, Late, Excused, Absent, NoShow, LeaveOfAbsence, NotRequired, PendingReview
LoaStatus = Submitted, UnderReview, Approved, Denied, Cancelled, Withdrawn, Active, Completed, Returned
LoaApprovalLevel = UnitStaff, Escalated
QualificationStatus = Recommended, Pending, Active, Expired, Suspended, Revoked, Waived
RequestStatus = Draft, Submitted, UnderReview, Approved, Denied, Cancelled, Completed, Voided
VisibilityLevel = Member, Staff, Command, System, Restricted
SupportTicketStatus = Open, PendingStaff, PendingMember, Resolved, Closed, Voided
NotificationStatus = Unread, Read, Archived
NotificationDeliveryChannel = InApp
AuditSeverity = Info, Notice, Warning, Critical
IntegrationLogStatus = Pending, Success, Failure, Voided
```

### Appendix B: Current Role And Permission Snapshot

#### Roles

```text
pending-user
  name: Pending User
  status: Active
  description: Guild-verified pending account with limited applicant and recovery access.

member
  name: Member
  status: Active
  description: Active member baseline access.

recruiter
  name: Recruiter
  status: Active
  description: Recruiting workflow authority.

unit-staff
  name: Unit Staff
  status: Active
  description: Scoped personnel and workflow authority for unit staff.

command-staff
  name: Command Staff
  status: Active
  description: Elevated command oversight authority.

trainer
  name: Trainer
  status: Active
  description: Training and qualification authority.

system-admin
  name: System Admin
  status: Active
  description: System-wide administration and recovery authority.
```

#### Permissions

```text
accounts.view-self
access.recovery.request
access.recovery.review
access.sessions.revoke
access.bootstrap.complete
catalogs.manage
applications.create-self
applications.view-self
applications.review-recruiter
applications.review-target-unit
personnel.view-self
personnel.view-scoped
personnel.update-scoped
events.view-self
events.manage-scoped
attendance.view-self
attendance.review-scoped
loa.create-self
loa.review-scoped
training.view-scoped
training.record-scoped
serviceRecords.manage-scoped
support.create-self
support.manage-queue
audit.view
notifications.view-self
notifications.archive-self
integrations.view
integrations.manage
```

### Appendix C: Current Unit And Rank Snapshot

#### Units

```text
TF20 | Task Force 20 | type=Task Force | parent=null | status=Active | sortOrder=0
TF20-RANGER-A | A Co, 1/75th Ranger Regiment | type=Unit | parent=TF20 | status=Active | sortOrder=10
TF20-SFOD-A1 | 1 Troop, A Squadron, 1st SFOD-Delta | type=Unit | parent=TF20 | status=Active | sortOrder=20
TF20-SOAR-B160 | B Co, 2/160th SOAR | type=Unit | parent=TF20 | status=Active | sortOrder=30
```

#### Ranks

```text
COL | Colonel | abbreviation=COL | category=Officer | sortOrder=10 | status=Active
CPT | Captain | abbreviation=CPT | category=Officer | sortOrder=20 | status=Active
1LT | First Lieutenant | abbreviation=1LT | category=Officer | sortOrder=30 | status=Active
CW3 | Chief Warrant Officer 3 | abbreviation=CW3 | category=Warrant Officer | sortOrder=40 | status=Active
SGM | Sergeant Major | abbreviation=SGM | category=Enlisted | sortOrder=50 | status=Active
MSG | Master Sergeant | abbreviation=MSG | category=Enlisted | sortOrder=60 | status=Active
SFC | Sergeant First Class | abbreviation=SFC | category=Enlisted | sortOrder=70 | status=Active
SSG | Staff Sergeant | abbreviation=SSG | category=Enlisted | sortOrder=80 | status=Active
SGT | Sergeant | abbreviation=SGT | category=Enlisted | sortOrder=90 | status=Active
SPC | Specialist | abbreviation=SPC | category=Enlisted | sortOrder=100 | status=Active
PFC | Private First Class | abbreviation=PFC | category=Enlisted | sortOrder=110 | status=Active
PV2 | Private | abbreviation=PV2 | category=Enlisted | sortOrder=120 | status=Active
```

### Appendix D: Current Billet Snapshot

```text
RANGER-COMPANY-COMMANDER | unit=TF20-RANGER-A | Company Commander | category=Command | status=Active
RANGER-1PLT-PL | unit=TF20-RANGER-A | 1PLT PL | category=Leadership | status=Active
RANGER-1PLT-RTO | unit=TF20-RANGER-A | 1PLT RTO | category=Support | status=Active
RANGER-1PLT-ASST-MEDIC | unit=TF20-RANGER-A | 1PLT Asst Medic | category=Medical | status=Active
RANGER-1PLT-ENGINEER | unit=TF20-RANGER-A | 1PLT Engineer | category=Engineer | status=Active
RANGER-1PLT-JTAC | unit=TF20-RANGER-A | 1PLT JTAC | category=Fires | status=Active
RANGER-1PLT-MEDIC | unit=TF20-RANGER-A | 1PLT Medic | category=Medical | status=Active
RANGER-1PLT-1SQD-SL | unit=TF20-RANGER-A | 1PLT, 1SQD SL | category=Leadership | status=Active
RANGER-1PLT-1SQD-A-AUTORIFLEMAN | unit=TF20-RANGER-A | 1PLT, 1SQD, A, AutoRifleman | category=Rifle | status=Active
RANGER-1PLT-1SQD-A-GRENADIER | unit=TF20-RANGER-A | 1PLT, 1SQD, A, Grenadier | category=Rifle | status=Active
RANGER-1PLT-1SQD-A-RIFLEMAN | unit=TF20-RANGER-A | 1PLT, 1SQD, A, Rifleman | category=Rifle | status=Active
RANGER-1PLT-1SQD-A-TL | unit=TF20-RANGER-A | 1PLT, 1SQD, A, TL | category=Leadership | status=Active
RANGER-1PLT-1SQD-B-RIFLEMAN | unit=TF20-RANGER-A | 1PLT, 1SQD, B, Rifleman | category=Rifle | status=Active
RANGER-1PLT-1SQD-B-TL | unit=TF20-RANGER-A | 1PLT, 1SQD, B, TL | category=Leadership | status=Active
SFOD-CO | unit=TF20-SFOD-A1 | CO | category=Command | status=Active
SFOD-TL | unit=TF20-SFOD-A1 | TL | category=Leadership | status=Active
SFOD-ATL-PM | unit=TF20-SFOD-A1 | ATL/Precision Marksman | category=Leadership | status=Active
SFOD-ASSAULTER-BREACHER | unit=TF20-SFOD-A1 | Assaulter/Breacher | category=Assaulter | status=Active
SFOD-ASSAULTER-GAY-CANADIAN | unit=TF20-SFOD-A1 | Assaulter/Gay Canadian | category=Assaulter | status=Active
SFOD-ASSAULTER-PM | unit=TF20-SFOD-A1 | Assaulter/Precision Marksman | category=Assaulter | status=Active
SFOD-HWO | unit=TF20-SFOD-A1 | Heavy Weapons Operator | category=Weapons | status=Active
SOAR-CO | unit=TF20-SOAR-B160 | Commanding Officer | category=Command | status=Active
SOAR-XO | unit=TF20-SOAR-B160 | Executive Officer | category=Command | status=Active
SOAR-AVIATOR | unit=TF20-SOAR-B160 | Aviator | category=Flight | status=Active
SOAR-AIR-CREW | unit=TF20-SOAR-B160 | Air Crew Member | category=Flight | status=Active
```

### Appendix E: Current Staff Section And MOS Snapshot

#### Staff Sections

```text
J2 | J2 | description=Intelligence staff section. | status=Active
```

#### Specialties

```text
11A | Infantry Officer | category=Infantry | status=Active
11B | Infantryman | category=Infantry | status=Active
12B | Combat Engineer | category=Engineer | status=Active
13F | Joint Fire Support Specialist | category=Fires | status=Active
25C | Radio Operator | category=Signal | status=Active
68W | Combat Medic | category=Medical | status=Active
153A | Special Operations Rotary Wing Aviator | category=Aviation | status=Active
18A | Special Forces Officer | category=Special Forces | status=Active
18B | Special Forces Weapons Sergeant | category=Special Forces | status=Active
18Z | Special Forces Operations Sergeant | category=Special Forces | status=Active
```

### Appendix F: Current Workflow Action Snapshot

#### Implemented Runtime Actions

```text
GET /auth/discord/start
GET /auth/discord/callback
GET /auth/logout
POST /auth/recent-auth
GET /auth/blocked
GET /me
GET /me/gate
GET /me/modules
GET /applications/me
POST /applications
GET /applications/review
GET /applications/:id
POST /applications/:id/recommend
POST /applications/:id/assign-unit
POST /applications/:id/accept
POST /applications/:id/reject
GET /personnel/self
GET /personnel
GET /personnel/:id
PATCH /personnel/:id
POST /personnel/:id/update
```

#### Planned Workflow Action Endpoints

```text
POST /applications/{id}/recommend
POST /applications/{id}/decision
PATCH /personnel/{id}
POST /loa/{id}/approve
POST /loa/{id}/deny
POST /loa/{id}/withdraw
POST /loa/{id}/cancel
POST /loa/{id}/return
POST /events/{id}/attendance/finalize
POST /attendance/{id}/correct
POST /support/{id}/assign
POST /support/{id}/resolve
POST /support/{id}/close
POST /support/{id}/void
POST /access/recovery/{id}/approve
POST /access/recovery/{id}/deny
POST /access/recovery/{id}/complete
POST /access/sessions/{id}/revoke
POST /access/sessions/revoke-all
```

### Appendix G: Current Seed Gaps

```text
trainingCourses = []
qualifications = []
awards = []
```
