# TF20 Portal Operations Runbook

## Local Setup

1. Install dependencies.
2. Copy `.env.example` to `.env`.
3. Fill in:
   - `SESSION_SECRET`
   - `DATABASE_URL`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_CALLBACK_URL`
   - `STEAM_WEB_API_KEY`
4. Run:
   - `npm install`
   - `npm run prisma:generate`
   - `npm run prisma:migrate`
   - `npm run db:seed`
   - `npm run dev`

## Production Deployment

Live app:

- host: `216.225.152.12`
- app dir: `/opt/tf20/app`
- service: `tf20`

### Safe deploy procedure

1. Pull latest code locally.
2. Run `npm run check`.
3. Run `npm run smoke`.
4. Back up the live files on the VPS before replacing them.
5. Copy only the changed files or deploy the full updated checkout.
6. On the VPS, ensure file ownership remains `tf20:tf20` for app files.
7. Restart the service:
   - `systemctl restart tf20`
8. Verify:
   - `systemctl is-active tf20`
   - `curl -fsS http://127.0.0.1:3000/api/health`
   - browser login flow on `https://taskforce20.com`
   - member profile view loads
   - recruiter/staff application queue loads
   - staff personnel roster loads
   - LOA queue loads
   - support queue loads
   - events page loads and attendance review opens for a selected event
   - audit log loads for a privileged account

## Production Environment

Server-only secrets stay in:

- `/opt/tf20/app/.env`

Never copy this file into the repo or into private exports.

## Cutover Rules

- Website database is the source of truth after roster import verification.
- Airtable is migration-only and should not receive operational updates after
  cutover.
- Discord identity issues should be corrected through controlled relinking, not
  by directly editing random database rows without an audit trail.

## Recovery Checks

When a deployment fails:

1. Check service status and logs:
   - `systemctl status tf20`
   - `journalctl -u tf20 --since "15 minutes ago" --no-pager`
2. Confirm `.env` is still present and readable by the service.
3. Confirm `DATABASE_URL`, Discord credentials, and Prisma client are intact.
4. Restore the file backup or previous checkout if the service cannot recover.
