# Area 4: External Connections

## Summary

Area 4 defines external-connection boundaries for the restart branch from the
user-verified chat plan only. Previous-build integrations, sync jobs, gateway
assumptions, and provider behavior are not source material.

This area is limited to Discord and Steam. Legacy systems are migration-only
artifacts and are completely excluded from live runtime architecture.

## Locked Decisions

- Discord remains the only login provider.
- Discord covers OAuth login, approved-guild membership verification, guild
  join and leave event ingestion, and outbound workflow notifications.
- Discord does not control personnel truth, role truth, unit truth, billet
  truth, permission truth, or workflow truth.
- A Discord user outside the approved guild is blocked without activation.
- A Discord guild join creates or refreshes a pending identity or account
  record only.
- Enlistment application submission creates the minimal applicant record in the
  system of record.
- A Discord guild leave updates access or integration state according to the
  verified identity and access rules without making Discord the system of
  record for personnel status.
- Steam is optional and limited to link or unlink workflow, identity
  verification, and profile enrichment.
- Steam is not a login provider.
- Steam is not a source of truth for roster, workflow, or personnel status.
- Steam failures must be non-destructive and fully logged.
- No legacy runtime integrations exist at all after migration.
- Airtable and every prior roster or application integration are excluded from
  runtime reads, writes, webhooks, reconciliation, and live operator workflows.

## Discord Scope

### Inbound

- OAuth verification result.
- Approved-guild membership verification result.
- Guild member join event.
- Guild member leave event.

### Outbound

- Workflow notification request.
- Delivery attempt.
- Delivery result log.
- Retry-safe failure handling.
- Recruiting notification bridge events sent from IPS to the Discord bot over a
  loopback-only authenticated HTTP bridge.

### Behavioral Boundaries

- Discord identity must be retained separately from application and personnel
  truth.
- Guild verification gates account creation and activation eligibility but does
  not replace internal account-status checks.
- Guild join and leave events update integration and access state only.
- Internal workflow decisions remain database-owned and audit-owned.

## Steam Scope

- Link request.
- Unlink request.
- OpenID verification result.
- Steam profile enrichment fetch and refresh.
- Optional profile fields include Steam64, profile name, avatar, and profile
  URL.

Steam linkage remains additive. A failed Steam verification or sync must not
damage existing account, application, or personnel records.

## Logging And Audit Rules

- Every Discord and Steam action writes an `IntegrationLog` record.
- Access-affecting outcomes also create normal audit records where applicable.
- Delivery and sync failures must be retry-safe and idempotent.
- Notification delivery state is tracked independently from workflow truth.
- Recruiting Discord delivery uses a database outbox so application workflow
  actions succeed even if Discord is temporarily unavailable; failed jobs are
  retried and logged through `IntegrationLog`.

## Implemented Model Support

- `AuthIdentity` stores provider identity, account linkage, guild-verification
  timing, guild-membership requirement, link and unlink timing, and provider
  metadata.
- `Notification` stores account-targeted notification records with delivery
  channel, workflow event, read state, and related-record linkage.
- `IntegrationLog` stores provider, action, status, account linkage,
  request/response payloads, related-record linkage, and error state.
- `AuditLog` remains available for access-affecting or security-affecting
  external outcomes.

Area 4 does not require adding legacy integration models, fallback sync state,
or retired-system compatibility fields.

## Explicit Non-Goals

- No Airtable runtime dependency.
- No read-only legacy fallback.
- No periodic sync against retired systems.
- No webhook ingestion from retired systems.
- No operator-triggered live import path as part of production runtime.
- No Steam login flow.
- No Discord-owned personnel or permission authority.

## Acceptance Tests

- Discord OAuth user in the approved guild passes the external verification
  gate.
- Discord OAuth user outside the approved guild is blocked without activation.
- Guild join creates or refreshes a pending identity or account record only.
- Guild leave updates integration or access state without corrupting personnel
  records.
- Discord notification delivery writes success, failure, and retry-safe
  integration logs.
- Steam link stores verified identity metadata and enrichment fields.
- Steam failure leaves existing account data intact and logs the failure.
- No live code path depends on Airtable or any other retired external system.
