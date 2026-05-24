# Area 2: Identity, Roles, And Access

## Summary

Area 2 defines access foundations only. Official role names, permission keys,
staff titles, and catalog values remain unseeded until the user verifies them.

The previous build remains archive-only. Do not import its roles, permissions,
routes, or workflows.

## Locked Decisions

- Discord is the only planned login provider for the first system.
- Discord guild membership must be verified by a configured bot before account
  creation.
- A Discord user who is not in the approved guild is blocked without creating
  an account.
- Guild-verified users start as `Pending`.
- Pending accounts can only access their own application, limited intake
  support, and recovery requests.
- Accounts become `Active` only after application acceptance or authorized
  admin-created personnel profile.
- `Locked` is a temporary security review state.
- `Disabled` is administrative access-off.
- `Archived` is retained history.
- Permissions are deny-by-default, fine-grained, and shaped as `module.action`.
- Role assignments are explicit and may be global, unit-scoped, or
  staff-section-scoped.
- Unit scope includes child units.
- Sensitive actions require recent authentication.
- Protected writes must create audit records.

## Implemented Model Additions

- `AuthIdentity` records track guild verification timing.
- `Session` records support normal expiry, recent-auth expiry, and direct
  revocation.
- `SessionRevocation` supports per-account and global revocation events.
- `Permission` records include module, action, sensitive category, and
  recent-auth requirement metadata.
- `RoleAssignment` records include explicit scope and descendant behavior.
- `AccountRecoveryRequest` supports two-step review and completion.
- `AccessBootstrap` records support one-time setup authority and expiry after
  verified permanent access exists.

## Permission Namespace Plan

Exact permission keys are not seeded yet. The future verified permission list
must use this shape:

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

Sensitive categories must be planned before seeding permissions:

- identity
- recovery
- access-management
- disciplinary
- administrative-notes
- private-loa
- audit
- integration

## Required Access Interfaces

- Auth gate: Discord OAuth plus bot guild-membership verification before
  account creation.
- Account gate: account status check before module access.
- Permission evaluator: permission key, account status, scope, self-access,
  sensitive category, and recent-auth requirement.
- Scope evaluator: global scope, unit-plus-children scope, staff-section scope,
  and limited self-access.
- Bootstrap evaluator: one-time environment configured identity, setup-only
  authority, and expiry after permanent admin access exists.
- Recovery workflow: request, review, complete, notify, and audit.
- Session workflow: login, logout, recent auth, revoke account sessions, and
  emergency global revocation.

## Validation

Use `scripts/check-area2-access.mjs` to confirm the Area 2 access models and
metadata fields exist without seeding official roles or permission keys.
