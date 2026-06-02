# Area 6: Operations, Security, And Testing

## Summary

Area 6 defines the restart branch operating model from the user-verified chat
plan only. Previous-build deployment habits, ad hoc server edits, stale CI
steps, and undocumented production procedures are not source material.

The production baseline is one Linux VPS, one systemd-managed app service, one
MySQL database, environment-based runtime configuration outside git, strict
secret rotation, daily database backups, basic health alerts, and a minimum
deploy gate of planning checks plus Prisma client generation plus smoke
verification.

## Locked Decisions

- Production baseline is single VPS plus systemd, not container-first and not
  multi-host by default.
- Runtime configuration is environment-based and stays outside git.
- Secrets are env-only with strict rotation and are never supported as mixed
  plaintext local files in git-managed workflows.
- Discord, session, database, bootstrap, and future Steam secrets must rotate
  when exposed or suspected exposed.
- Legacy runtime integrations remain fully excluded from deployment, recovery,
  monitoring, and operations design.
- The authoritative minimum automated gate is:
  - planning validators
  - Prisma client generation
  - lightweight smoke verification
- Deploy failure at checks, smoke, or post-deploy verification blocks
  promotion and requires rollback or service restore action.

## Environment Contract

### Required Runtime Categories

- database
- Discord auth and guild verification
- session and auth timing
- bootstrap and recovery-sensitive values
- future Steam backend-only reserved values

### Required Runtime Variables

- `DATABASE_URL`
- `SESSION_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI`
- `DISCORD_APPROVED_GUILD_ID`
- `DISCORD_BOT_TOKEN`
- `BOOTSTRAP_DISCORD_ID`
- `SESSION_TTL_DAYS`
- `RECENT_AUTH_WINDOW_MINUTES`
- `APP_BASE_URL`
- `STEAM_API_KEY` as reserved backend-only future setting
- `STEAM_OPENID_REALM` as reserved backend-only future setting
- `STEAM_OPENID_RETURN_URL` as reserved backend-only future setting

Real values remain outside git. Example placeholders may exist in
`.env.example`, but production values must be injected operationally.

## Deploy Contract

- One approved branch or revision is promoted at a time.
- The deploy flow targets one configured systemd service unit for the app.
- Normal deployment is:
  - pull approved revision
  - install dependencies
  - generate Prisma client
  - run approved checks
  - run smoke verification
  - restart or reload the configured systemd service
  - run post-deploy verification
- Undocumented hot edits on the VPS are not part of the supported operational
  path.
- Runtime recovery does not depend on legacy import jobs, sync jobs, or
  fallback integrations.

## Security And Incident Contract

### Runtime Security Controls

- database credentials use least privilege appropriate for the app
- systemd host execution uses explicit service-account and filesystem
  boundaries appropriate for the service
- sensitive actions retain recent-auth enforcement from Area 2
- protected writes create audit logs
- Discord and future Steam integration failures create integration logs

### Secret Rotation Triggers

- secret or token pasted in chat or ticket
- secret committed or suspected committed to git
- credential copied to an unauthorized host or file
- suspected account compromise
- provider-side notice of exposure or misuse

### Incident Categories

- auth or approved-guild verification failure
- database or connectivity failure
- service crash, failed boot, or restart loop
- exposed secret or token
- suspicious access, recovery abuse, or bootstrap misuse

### First-Response Sources

- application logs for boot, auth, and integration failures
- systemd and journal logs for service state and restart failures
- audit logs for protected-write and access incidents
- integration logs for Discord and Steam delivery or verification failures

## Backup, Restore, And Monitoring Contract

- daily database backups are required
- backup policy is incomplete unless restore steps are also documented
- restore verification must confirm:
  - database can be restored successfully
  - Prisma-backed app can boot against restored data
  - health verification can run after restore
- minimum monitoring and alerting covers:
  - app service unhealthy or process down
  - failed boot or repeated restart loop
  - database connectivity failure
  - Discord auth or guild verification failure path
- monitoring remains intentionally basic; Area 6 does not require a full
  observability or on-call platform

## CI And Testing Contract

### Minimum Automated Gate

- install dependencies
- generate Prisma client
- run the repository validation command
- run smoke verification

The branch-supported CI floor must match the actual scripts present in the
restart branch. Stale workflow steps that call undefined scripts are not part
of the Area 6 contract.

### Smoke Verification Contract

The smoke step is lightweight and must prove boot prerequisites are coherent
without requiring full feature implementation. The smoke path must validate:

- required planning docs and validators exist
- the environment example exposes the required runtime variable categories
- the repository contains the Prisma schema and runtime check entrypoints

### Manual Post-Deploy Verification

- app health or boot status is healthy
- Discord auth gate behavior is verified
- pending-user gate behavior is verified
- protected module visibility is verified
- one representative protected workflow action is verified

## Explicit Non-Goals

- no container-first requirement
- no multi-host production topology requirement
- no secrets in git-managed operational files
- no legacy sync/import runtime jobs
- no full observability stack requirement
- no deep integration-test requirement before Area 6 is complete

## Acceptance Tests

- missing required env vars fail clearly and safely during operational checks
- Prisma client generation is part of the documented automated gate
- CI runs only branch-supported required steps
- smoke verification is part of the deploy gate
- failed checks block deploy
- failed smoke blocks promotion or restart completion
- failed post-deploy verification requires rollback or service restore action
- daily backup requirement and restore verification steps are documented
- secret exposure requires rotation and invalidation procedure
- audit and integration logs are named as first-response sources for incidents
