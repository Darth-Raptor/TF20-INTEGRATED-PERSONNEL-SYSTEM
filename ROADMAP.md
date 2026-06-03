# TF20 Restart Roadmap

## Summary

This is the canonical phased execution roadmap for the TF20 restart branch.

Current baseline:

- planning Areas 1 through 6 are complete
- catalog governance is implemented
- runtime auth/session/gating is implemented
- applicant-to-member flow is implemented
- personnel core roster slice is implemented locally

Completion target:

- protected TF20 PMS complete
- public recruiting/front-door site complete
- one final production deployment to the VPS at the end

## Phase 1: Stabilize Current Local Runtime And Lock Documentation

- normalize and verify the current local runtime baseline
- keep and commit the current applicant and personnel slices
- rewrite repo docs so:
  - `README.md` is the project-status summary
  - `ROADMAP.md` is the canonical execution plan
  - `docs/backend-planning-roadmap.md` is the historical planning record
- pass:
  - `npm run check`
  - `npm run smoke`
  - local Discord login
  - applicant submission
  - recruiter review and acceptance
  - personnel self-view and scoped personnel updates

## Phase 2: Full Backend Schema And Contract Review

- review and finalize every aspect of the backend:
  - schema
  - units and hierarchy
  - roles
  - permissions
  - enums
  - workflow vocabulary
  - route naming
  - catalog values and structure
  - audit expectations
  - backend wording and terminology
- use this as the last broad backend correction window before more feature
  build-out

## Phase 3: Protected TF20 PMS UI Construction

- build the protected PMS shell and user-facing page organization
- go deep on:
  - navigation
  - information architecture
  - page layouts
  - page names
  - role-based visibility
  - empty states
  - blocked states
  - action placement
- establish the stable UI structure for all remaining protected workflows

## Phase 4: Finish LOA Workflow

- implement `/loa/*`
- complete:
  - member submission
  - scoped reviewer processing
  - approval and denial
  - escalation
  - cancel, withdraw, return, and early-return flows
- make LOA state affect personnel and attendance behavior

## Phase 5: Finish Events And Attendance

- implement `/events/*` and `/attendance/*`
- complete:
  - event creation and detail
  - roster generation and adjustment
  - attendance review
  - attendance finalization
  - audited post-finalization correction
- respect approved LOA windows

## Phase 6: Finish Training, Qualifications, Promotions, And Awards

- implement:
  - `/training/*`
  - `/qualifications/*`
  - `/promotions/*`
  - `/awards/*`
- complete official record workflows for:
  - training completion entry
  - qualification lifecycle changes
  - promotion request to final record
  - award request to final record

## Phase 7: Finish Support, Notifications, And Restricted Records

- implement `/support/*` and `/notifications/*`
- complete:
  - pending-user intake support
  - member/staff support tickets
  - queue assignment
  - comments
  - resolve, close, and void actions
- add the restricted staff-only record surfaces required for completion:
  - administrative notes
  - disciplinary records

## Phase 8: Complete Role, Scope, And Admin Surfaces

- finish runtime admin and operational surfaces for:
  - access and recovery
  - session management
  - bootstrap/admin workflows
  - scope visibility where operationally required

## Phase 9: Build The Public Recruiting Site

- build the public recruiting/front-door site as a separate surface from the
  protected PMS
- include:
  - recruiting landing page
  - expectations and standards
  - onboarding explanation
  - Discord/PMS call-to-action

## Phase 10: Final Pre-Deployment Hardening And Cutover Prep

- run full local acceptance across all completed modules
- update deployment and operations materials to match the finished runtime
- produce the final release candidate

## Phase 11: Single Final Production Deployment

- deploy one final approved revision to the VPS
- perform:
  - dependency install
  - Prisma client generation
  - checks
  - smoke
  - schema/catalog steps as needed
  - systemd restart
  - post-deploy verification
- verify all critical protected and public flows in production

## Recurring Validation Expectations

Every implementation phase should locally pass:

```bash
npm run check
npm run smoke
```

And should re-verify the already completed flow set so earlier slices do not
regress.
