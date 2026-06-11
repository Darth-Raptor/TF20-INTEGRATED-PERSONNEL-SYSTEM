# Area 5: API And Frontend Contract

## Summary

Area 5 defines the contract layer for the restart branch from the
user-verified chat plan only. Previous-build routes, handlers, payloads,
screen structure, and frontend assumptions are not source material.

The contract style is hybrid REST. Resource reads and lists use normal
collection or detail endpoints. Workflow transitions use explicit action
endpoints. Area 5 covers protected portal screens plus pending-user and
applicant screens only. The public recruiting-site contract remains out of
scope.

## Locked Contract Decisions

- API style is hybrid REST, not pure CRUD and not full RPC.
- Protected portal plus pending-user or applicant flows are the only UI
  surfaces defined in this area.
- The public recruiting site is not part of Area 5.
- Discord remains system-managed in the contract layer.
- Steam remains backend-only in Area 5 despite Area 4 support.
- No user-facing Discord or Steam connection-management screen is defined in
  this area.
- No legacy import, sync, fallback, or operator-triggered live import endpoint
  exists in the contract layer.
- Retained operational records use status, closure, voiding, completion,
  archive, or withdrawal actions instead of destructive delete contracts.

## Route Families

The API contract is organized into these route families:

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

## Shared Contract Rules

### HTTP Pattern

- `GET` is used for detail and collection reads.
- `POST` is used for creates and workflow action commands.
- `PATCH` is used for direct protected updates where Area 3 already allows
  staff-owned editing.
- Area 5 does not define destructive delete endpoints for retained operational
  records.

### Response Envelopes

Every endpoint family uses one of these response shapes:

- list result
- detail result
- action success
- validation failure
- permission denial
- recent-auth required
- blocked or pending account
- integration-gated auth failure

Response bodies use consistent top-level keys:

- `data` for successful detail payloads
- `items` plus paging metadata for collection results
- `error` for failures
- `meta` for paging, scope, stale-state, or visibility hints

### Collection Rules

- Collections use cursor-or-page style metadata in a consistent `meta` object.
- Sort and filter inputs use explicit query parameters rather than
  provider-specific ad hoc shapes.
- Scope-constrained collections return already-filtered results and do not rely
  on frontend-side filtering for authorization.

### Serialization Rules

- Timestamps serialize as ISO-8601 strings in UTC.
- Enum values serialize exactly as their canonical backend enum names unless
  the contract section explicitly defines a presentation alias.
- Stable record identifiers are opaque IDs from the system of record.

### Protected Write Rules

- Protected writes include actor context from the authenticated session.
- Endpoints that require reasoned change must accept an explicit reason field.
- Permission-sensitive workflows return denial by default when scope or account
  state does not permit the action.
- Retry-prone action endpoints must be idempotent where double-submit risk is
  realistic.

## Auth And Access Contract

### Auth

- Discord OAuth start and callback live under `/auth/*`.
- Approved-guild verification is part of the auth gate result.
- Account-status gating is part of post-auth session bootstrap.
- Recent-auth refresh is a dedicated auth or access action, not an incidental
  side effect of unrelated writes.

### Access

- Module visibility is permission-evaluated server-side.
- Scope-aware list filtering is part of the backend response contract.
- Pending users can access only their own application flow, limited support,
  and recovery functions.
- Locked, disabled, archived, and not-in-guild outcomes return explicit blocked
  contract states rather than ambiguous empty screens.

## Workflow Action Contract Matrix

The following workflow commands use explicit action endpoints rather than
generic status writes:

| Workflow command                | Endpoint pattern                                                                                               | Actor requirement                         | Target                     | Success result                                   | Denial or failure cases                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------- | ------------------------------------------------ | ---------------------------------------------------------- |
| Applicant draft or update       | `POST /applications/draft`, `PATCH /applications/me`                                                           | Pending applicant self-service            | Own `Application`          | Draft or more-info application state saved       | denied account state, terminal application, validation     |
| Applicant submit or withdraw    | `POST /applications/me/submit`, `POST /applications/me/withdraw`                                               | Pending applicant self-service            | Own `Application`          | Submitted or withdrawn application state         | missing required fields, invalid transition                |
| Recruiter request info          | `POST /applications/{id}/request-info`                                                                         | Authorized recruiter or staff scope       | `Application`              | More-info requested state plus applicant notice  | invalid stage, denied scope, blocked account               |
| Recruiter recommendation        | `POST /applications/{id}/recommend`                                                                            | Authorized recruiter or staff scope       | `Application`              | Updated application workflow state               | invalid stage, denied scope, blocked account               |
| Target-unit assignment          | `POST /applications/{id}/assign-unit`                                                                          | Authorized recruiter or target-unit staff | `Application`              | Target unit review state                         | invalid stage, denied scope, invalid target unit           |
| Target-unit decision            | `POST /applications/{id}/accept`, `POST /applications/{id}/reject`                                             | Authorized target-unit staff              | `Application`              | Converted active member or denied application    | invalid stage, denied scope, missing target-unit authority |
| Protected personnel update      | `PATCH /personnel/{id}`                                                                                        | Authorized staff with scope               | `PersonnelProfile`         | Updated snapshot plus history/audit-linked state | denied scope, validation failure, recent-auth required     |
| LOA approve                     | `POST /loa/{id}/approve`                                                                                       | Authorized reviewer                       | `LoaRequest`               | Updated LOA decision state                       | invalid transition, denied scope, blocked reviewer         |
| LOA deny                        | `POST /loa/{id}/deny`                                                                                          | Authorized reviewer                       | `LoaRequest`               | Updated LOA decision state                       | invalid transition, denied scope                           |
| LOA withdraw                    | `POST /loa/{id}/withdraw`                                                                                      | Owner or authorized submitter             | `LoaRequest`               | Withdrawn LOA state                              | invalid transition, non-owner denial                       |
| LOA cancel or return            | `POST /loa/{id}/cancel` and `POST /loa/{id}/return`                                                            | Authorized actor per workflow             | `LoaRequest`               | Updated LOA status window state                  | invalid transition, denied scope                           |
| Attendance finalize             | `POST /events/{id}/attendance/finalize`                                                                        | Event owner or authorized staff           | `Event`                    | Finalized attendance state                       | event not ready, denied scope                              |
| Attendance correction           | `POST /attendance/{id}/correct`                                                                                | Authorized staff                          | `EventAttendance`          | Corrected attendance with reason                 | missing reason, denied scope, locked correction rules      |
| Support assign                  | `POST /support/{id}/assign`                                                                                    | Authorized staff                          | `SupportTicket`            | Assigned ticket state                            | denied scope, invalid state                                |
| Support resolve, close, or void | `POST /support/{id}/resolve`, `POST /support/{id}/close`, `POST /support/{id}/void`                            | Authorized staff                          | `SupportTicket`            | Updated retained ticket state                    | invalid transition, denied scope                           |
| Recovery review and complete    | `POST /access/recovery/{id}/approve`, `POST /access/recovery/{id}/deny`, `POST /access/recovery/{id}/complete` | Authorized recovery reviewer or completer | `AccountRecoveryRequest`   | Updated recovery state                           | invalid transition, denied scope                           |
| Session revoke or global revoke | `POST /access/sessions/{id}/revoke` and `POST /access/sessions/revoke-all`                                     | Authorized security or admin actor        | `Session` or session scope | Session revocation result                        | recent-auth required, denied scope                         |

## Screen Contract Matrix

### Protected Portal Screens

| Screen                      | Initial read contract                    | Allowed actions                                                                   | Minimum account status                                            | Permission or scope gate                              |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Dashboard                   | `/me`, summary reads for visible modules | Contextual workflow actions only through module-specific endpoints                | `Active` unless limited pending view is defined                   | Server-computed module visibility                     |
| Profile / self view         | `/me`, optional `/me/personnel` detail   | No protected direct self-write in Area 5                                          | `Pending` or `Active` depending on linked records                 | Self only                                             |
| Personnel management        | `/personnel/*` lists and detail reads    | Protected personnel `PATCH`, staff notes/history commands in later implementation | `Active`                                                          | Staff or command scope                                |
| LOA                         | `/loa/*` plus self or scoped queue reads | submit, approve, deny, withdraw, cancel, return                                   | `Pending` for limited self flow where allowed, otherwise `Active` | Self or scoped reviewer                               |
| Events and attendance       | `/events/*`, `/attendance/*`             | roster setup, finalize, correction, attendance review                             | `Active`                                                          | Staff or event scope; self read for member attendance |
| Training and qualifications | `/training/*`, `/qualifications/*`       | trainer-owned record actions and qualification updates                            | `Active`                                                          | Authorized trainer or staff scope                     |
| Promotions and awards       | `/promotions/*`, `/awards/*`             | request, approve, record creation actions                                         | `Active`                                                          | Authorized staff scope                                |
| Support                     | `/support/*`                             | create, comment, assign, resolve, close, void                                     | `Pending` or `Active` based on ticket type                        | Self or staff queue scope                             |
| Notifications               | `/notifications/*`                       | acknowledge, archive                                                              | `Pending` or `Active`                                             | Self only                                             |
| Audit / access screens      | `/audit/*`, `/access/*`, `/bootstrap/*`  | review, revoke, approve, complete, bootstrap actions                              | `Active`                                                          | Restricted admin or security scope                    |

### Pending-User And Applicant Screens

| Screen                              | Initial read contract                      | Allowed actions                                                                         | Blocked states                           |
| ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------- |
| Application status / applicant flow | `/applications/me` plus recruiting options | create draft, update draft or more-info response, submit, withdraw, view status/history | not in guild, locked, disabled, archived |
| Limited support                     | `/support/*` intake-only or own tickets    | create intake ticket, view own tickets, comment where allowed                           | not in guild, disabled, archived         |
| Recovery access                     | `/access/recovery/*`                       | request recovery, view own recovery state                                               | disabled by policy, archived             |
| Pending gate screen                 | `/me` or `/auth/session` gate result       | no workflow actions beyond allowed pending functions                                    | not in guild, locked, disabled           |

For every screen contract, the frontend must receive:

- initial read endpoint or endpoints
- allowed action endpoints
- empty state behavior
- blocked state behavior
- refresh expectations after writes

## Read And Write Surface By Route Family

### `/auth/*`

- start OAuth
- callback completion
- session bootstrap
- recent-auth refresh
- logout or session end

### `/me/*`

- current account detail
- current visibility summary
- current pending-state or active-state overview
- current notifications or lightweight counts when authorized

### `/applications/*`

- `GET /applications/me` returns the current applicant-owned application and recruiting options.
- `POST /applications/draft`, `PATCH /applications/me`, `POST /applications/me/submit`, and `POST /applications/me/withdraw` are applicant self-service commands.
- `GET /applications/recruiting-options` returns recruiting-open units, MOS choices, sources, and branch enums for authorized recruiting UI users.
- `GET /applications/review` and `GET /applications/{id}` provide recruiter and target-unit review reads.
- Request-info, recommendation, target-unit assignment, acceptance, and rejection use explicit action endpoints.
- `POST /applications` remains a temporary compatibility path for the older server-rendered form.

### `/personnel/*`

- scoped roster reads
- personnel detail reads
- direct protected staff update by `PATCH`

### `/loa/*`

- self and scoped queue reads
- submit and review actions
- withdrawal, cancellation, and return actions

### `/events/*` and `/attendance/*`

- event collections and detail reads
- attendance collections and detail reads
- explicit finalization and correction actions

### `/training/*`, `/qualifications/*`, `/promotions/*`, `/awards/*`

- list and detail reads for authorized views
- explicit official-record actions rather than informal free-form writes

### `/support/*`

- ticket list and detail reads
- create, comment, assign, resolve, close, and void actions

### `/notifications/*`

- list and detail reads
- read acknowledgement
- archive action

### `/audit/*`, `/access/*`, `/bootstrap/*`

- restricted review reads
- recovery review and completion actions
- session revocation actions
- bootstrap authority actions

## Frontend Rendering Rules

- The backend is authoritative for module visibility and scope filtering.
- Empty states are distinct from blocked states.
- Pending-state views must not render protected staff modules.
- Screen refresh after successful actions should use the owning read endpoint
  rather than frontend-only optimistic state for protected workflows.
- If Discord guild or Steam status is shown, it is read-only system state in
  this area and not an editable settings flow.

## Explicit Non-Goals

- No public recruiting-site screen contract.
- No user-editable Discord or Steam connection-management UI.
- No legacy integration endpoints, sync routes, import routes, or fallback
  providers.
- No destructive delete contract for retained operational records.
- No frontend-framework prescription in Area 5.

## Acceptance Tests

- Approved-guild Discord user reaches the correct pending or active entry
  contract.
- Non-guild Discord user is blocked before activation.
- Locked, disabled, and archived accounts receive explicit blocked responses.
- Pending applicant can create or view only their own application flow.
- Recruiter recommendation and target-unit decision use explicit action
  endpoints.
- Acceptance creates the active account transition and minimal personnel
  profile.
- Member self-view is readable while protected personnel writes remain
  staff-owned.
- Scoped personnel reads are filtered correctly by unit or staff scope.
- Protected personnel updates require reason when the workflow requires it.
- LOA action endpoints reject invalid transitions.
- Attendance finalization and correction use separate commands.
- Pending users can access limited support and recovery only.
- Notifications support list, acknowledge, and archive only.
- No endpoint depends on Airtable or any retired integration.
