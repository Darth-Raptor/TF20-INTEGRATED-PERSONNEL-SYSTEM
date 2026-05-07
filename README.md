# Task Force 20 Website and Personnel Portal

Public website and protected personnel-management portal for Task Force 20.

## Current State

- Public placeholder site at `https://taskforce20.com`
- Node/Express backend on the TF20 VPS
- MySQL/MariaDB data model managed by Prisma
- Discord OAuth login for protected portal access
- Server-side sessions stored in the database
- Role and permission seed data for Applicant, Member, Recruiter, Staff, Command Staff, and System Admin
- Seeded Task Force 20 unit hierarchy and staff billet scopes
- Live portal shell with Users & Roles management
- Database-backed application submission and review flow
- Steam profile fields and Web API support for future staff-managed identity workflows

## Important Security Rules

Never commit real secrets or live exports.

Ignored by git:

- `.env`
- `.private/`
- generated Airtable roster exports
- deployment zips
- `dist/`
- `release/`
- `node_modules/`

Use `.env.example` as the template for another workstation.

## Local Development

Install dependencies:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env
```

Then fill in local or staging values for:

```text
SESSION_SECRET
DATABASE_URL
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_CALLBACK_URL
STEAM_WEB_API_KEY
```

Generate Prisma client and apply migrations:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

Run locally:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Validation

Run syntax checks:

```bash
npm run check
```

## Personnel Visibility

The portal uses billet-based personnel scope in addition to portal roles.

- Command Staff role, System Admin role, and Task Force 20 HHC command billets
  can see the full task force roster.
- Staff billets can see personnel assigned to the unit subtree below their
  billet. Example: the 1st Platoon Leader can see 1st and 2nd Squad personnel
  under 1st Platoon, including A and B teams.
- Members without staff scope see only their own personnel profile.

## Deployment Notes

The live app runs on the TF20 VPS behind Nginx with HTTPS for:

```text
https://taskforce20.com
https://www.taskforce20.com
```

Deployment currently uses SSH to the VPS and a systemd service named `tf20`.
Keep server-only secrets in `/opt/tf20/app/.env` on the VPS.

Do not copy the live `.env` into this repository.

## Airtable Migration

Airtable is deprecated by this system and should only be used as a one-time
migration source for existing records.

The safe local Airtable bridge is:

```bash
node scripts/airtable-sync.mjs
```

Full roster exports should go into `.private/`, which is ignored by git.

Convert a downloaded top-level roster CSV into the private import JSON:

```bash
npm run roster:csv -- --base="/Users/leahemken/Downloads/TASK FORCE ROSTER-PRIMARY ROSTER.csv"
```

Follow-on billet or MOS CSV exports can be merged onto the same roster by
passing one or more overlay files:

```bash
npm run roster:csv -- --base="/Users/leahemken/Downloads/TASK FORCE ROSTER-PRIMARY ROSTER.csv" --overlay="/path/to/unit-billets.csv"
```

Recommended roster fields for the current-member import:

```text
displayAlias
rank
status
dateOfEnlistment
discordName
discordId
steam64Id
steamProfile
assignedTo
primaryMos
billet
shop
platoon
squad
fireTeam
```

Missing Airtable fields should import as blank/null so unit staff can update
them inside the website later.
