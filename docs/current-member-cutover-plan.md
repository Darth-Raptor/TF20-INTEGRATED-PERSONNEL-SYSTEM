# Current Member Import And Portal Cutover Plan

This plan focuses on importing current TF20 member data and making the portal
usable for current members, not just new applicants.

## What Already Exists

- Discord OAuth login scaffold and session handling.
- Prisma schema for `User`, `PersonnelProfile`, `Unit`, `Rank`, `Billet`,
  `UnitAssignment`, `StaffAssignment`, `LOARequest`, and audit records.
- Seeded portal roles and permissions for Applicant, Member, Recruiter, Staff,
  Command Staff, and System Admin.
- Airtable export helper in `scripts/airtable-sync.mjs`.
- Airtable field map in `config/airtable-map.json`.
- Applicant submission and recruit conversion workflow.

## Main Gaps

1. There is no one-time importer that turns Airtable roster data into database
   records.
2. Reference data is not seeded yet for ranks, units, billets, and staff
   sections.
3. Existing members cannot be linked reliably to their Discord login on first
   sign-in unless their Discord IDs are imported first.
4. The member-facing portal still uses mock personnel display data instead of
   loading the signed-in member profile from the database.
5. There is no import preview, validation report, or migration audit trail yet.

## Cutover Goal

After cutover, a current member should be able to:

1. Sign in with Discord.
2. Be matched to an imported TF20 user/profile record.
3. Land in the portal with the correct account status, rank, unit, billet, and
   role-based access.
4. View real profile data instead of prototype placeholders.

## Required Work

### 1. Seed reference data

Before importing people, seed:

- ranks
- unit tree
- staff sections
- billet categories
- billets needed for current active members

Without this, imported personnel profiles cannot be linked cleanly to the
schema that already exists.

### 2. Freeze and export current source data

Use Airtable only as a migration source.

Steps:

1. Export the current Airtable roster to `.private/airtable-roster.json` using
   `node scripts/airtable-sync.mjs --export-private`.
2. Confirm the export date and record counts.
3. Stop treating Airtable as editable source-of-truth once the migration file is
   approved.

### 3. Build a normalization layer

Create a dedicated import module that converts Airtable fields into database
shape.

At minimum it needs to map:

- Discord ID -> `User.discordId`
- Discord name -> `User.discordUsername` or `displayAlias`
- Steam ID -> `User.steam64Id`
- status -> `User.accountStatus` and `PersonnelProfile.currentStatus`
- rank -> `Rank`
- assigned element -> `Unit`
- billet -> `Billet`
- shop -> `StaffSection` assignments when present
- enlistment date -> `PersonnelProfile.dateJoined`

This layer should not write to the database until validation passes.

### 4. Add migration validation

The importer should fail or flag records for:

- duplicate Discord IDs
- duplicate Steam64 IDs
- missing Discord IDs for current active members
- unknown rank abbreviations
- unknown unit names
- unknown billet names
- statuses that do not map cleanly to the schema
- records that cannot determine whether the member is active, reserve, LOA, or
  discharged

Validation output should be reviewable before import.

### 5. Add an import preview and approval step

Before writing to production tables, generate a preview report that shows:

- totals by status
- totals by unit
- records missing Discord ID
- records missing Steam64
- records with unmapped rank/unit/billet values
- records that would create new users
- records that would update existing users

The preview can be a JSON report first; it does not need a portal UI yet.

### 6. Import users and personnel profiles

The first real import should:

1. Upsert `User` by `discordId` when present.
2. Fall back to a controlled unresolved queue when no Discord ID exists.
3. Upsert `PersonnelProfile` linked to the resolved user.
4. Set `currentRankId`, `primaryUnitId`, `primaryBilletId`, and
   `currentStatus`.
5. Create `UnitAssignment` history rows for primary assignment.
6. Create `StaffAssignment` rows when shop/staff data exists.
7. Write one `AuditLog` entry per batch plus per-record warnings where needed.

Do not auto-create guessed Discord identities for members with missing or bad
Discord IDs.

### 7. Assign access roles for current members

Imported members need explicit portal roles after import.

Recommended starter mapping:

- active/recruit/probationary/reserve/LOA members -> `Member`
- recruiters -> `Recruiter`
- staff section workers with admin duties -> `Staff`
- command group -> `Command Staff`
- technical maintainers -> `System Admin`

This should happen in the import or in a follow-up role assignment script.

### 8. Support first-login linking and recovery

Current members may still have mismatches between Airtable and Discord.

Needed behavior:

- if Discord ID matches an imported user, sign in normally
- if Discord ID is new but the member is expected, queue manual linking
- if Discord ID changed, allow staff/system admin reassignment
- if no imported profile exists, keep the user as Applicant until resolved

This is necessary before current members can self-serve reliably.

### 9. Replace portal member mock data with real queries

The member experience is not operational until the portal reads the signed-in
user's real profile.

Minimum backend/UI work:

- add an endpoint for the current member profile
- add an endpoint for member-visible qualifications/attendance/LOA summary
- update `portal.js` member and personnel views to use API data instead of
  hard-coded arrays
- restrict members to their own profile

### 10. Run cutover verification

Before declaring the portal operational for current members, verify:

1. a known active member can sign in and see the correct identity
2. a recruiter can still access applications
3. a staff user can see personnel records
4. a command user has command-level access
5. a system admin can manage roles
6. a user with no imported profile stays blocked from member-only access

## Recommended Implementation Order

1. Seed reference data for ranks, units, staff sections, and billets.
2. Build a private import preview script from Airtable export JSON.
3. Add validation reporting for duplicate/missing/unmapped records.
4. Build the database import/upsert script with audit logging.
5. Add role assignment rules for imported current members.
6. Add first-login/link-recovery handling.
7. Replace member mock data in the portal with real database-backed views.
8. Run a dry run on a staging database.
9. Import the approved member roster.
10. Run sign-in and role verification with a few real member accounts.

## Suggested Immediate Next Task

The highest-leverage next implementation step is:

Build a private roster import preview script that reads
`.private/airtable-roster.json`, validates the current member records, and
outputs a migration report before any database writes happen.

That gives us a safe picture of the real cleanup work before we start touching
production user/profile tables.
