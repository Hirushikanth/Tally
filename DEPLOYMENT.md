# Deployment

Reproducible production deployment for the Tally stack. A fresh engineer should
be able to stand up the whole stack in under an hour using this document.

## Topology

**Recommended (zero-ops SPA):**

| Component | Host | Notes |
|---|---|---|
| SPA (Vite/React) | Vercel | `frontend/vercel.json` rewrites `/api/*` to the API |
| API (NestJS) | Render | `render.yaml` blueprint, `node dist/main` |
| Postgres | Neon | pooled URL for runtime, owner URL for migrations |

**Alternative (fully self-hosted):** run everything in containers with the
provided `docker-compose.yml` (or deploy the two images anywhere Docker runs).
The nginx container serves the SPA and proxies `/api/*` to the API on the same
origin, so no CORS configuration is needed in this topology.

Both topologies use the same CI/CD (`.github/workflows/deploy.yml`), which
runs migrations before releasing.

## Environment variables

### Backend (`backend/.env.example` — canonical)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URL. In production: Neon **pooled** URL with the restricted `app_runtime` role (`?sslmode=require`; host `<project>-pooler.neon.tech`). |
| `JWT_SECRET` | yes | `openssl rand -base64 48`. Must be ≥ 32 chars when `NODE_ENV=production` (the app refuses to boot otherwise). |
| `NODE_ENV` | no | `development` / `test` / `production`. The Docker image sets `production`; set it explicitly on Render. |
| `PORT` | no | Default `3000`. |
| `JWT_EXPIRES_IN` | no | Default `15m`. |
| `REFRESH_TOKEN_EXPIRES_IN` | no | Default `30d`. |
| `LOG_LEVEL` | no | `info` in production. |
| `CORS_ORIGINS` | no | Comma-separated allowlist. Only relevant when the SPA calls the API cross-origin; the nginx/Vercel topologies are same-origin. |
| `FRONTEND_URL` | no | Validated only; reserved for future use. |
| `SENTRY_DSN` | no | Sentry DSN for error reporting. Optional — unset disables Sentry entirely (the API still boots; 5xx responses just aren't reported). |

### Frontend (`frontend/.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | no | Default `/api` (same-origin). Leave unset in production. |
| `VITE_SENTRY_DSN` | no | Sentry DSN. **Build-time only** — must be set in the Vercel project settings (or build command) *before* the build; runtime env vars on a static host do nothing. Unset → Sentry is tree-shaken out of the bundle. |

### GitHub Actions secrets (`Settings → Secrets and variables → Actions`)

| Secret | Used for |
|---|---|
| `DATABASE_URL_OWNER` | Migrations (`prisma migrate deploy`). Neon **owner** connection string, not pooled. |
| `RENDER_API_KEY` | Triggering deploys: Render dashboard → Account → API Keys. |
| `RENDER_SERVICE_ID` | The Render service id (`srv-…` from the service URL or dashboard). |
| `VERCEL_TOKEN` | Deploying the SPA (`vercel` CLI token). |
| `VERCEL_ORG_ID` | `vercel whoami` output after linking. |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after linking. |
| `API_URL` | Live smoke tests. This deployment: `https://tally-api-f95d.onrender.com`. |

## One-time provisioning

### 1. Neon (Postgres)

1. Create a project (any region close to the API; free tier is fine to start).
2. Create two roles in the SQL editor (or dashboard):
   - `app_runtime` — restricted: `SELECT, INSERT, UPDATE, DELETE` on the app
     tables only (the codebase ships `REVOKE UPDATE, DELETE` enforcement —
     `backend/prisma/migrations`). Grant on `public` schema for the app's
     tables, plus usage on sequences.
   - owner role — the project owner is fine for migrations.
3. Connection strings:
   - Runtime `DATABASE_URL`: pooled endpoint
     `postgresql://app_runtime:***@<project>-pooler.neon.tech/tally?sslmode=require`
   - Migrations `DATABASE_URL_OWNER`: direct/owner endpoint
     `postgresql://owner:***@ep-…amazonaws.com/tally?sslmode=require`
4. Backups: Neon PITR (default, daily) covers disaster recovery — see
   Rollback below.

### 2. Render (API)

1. Create the service from the blueprint: Render dashboard → Blueprint → paste
   the contents of `render.yaml` (or `render blueprint launch`).
2. **Render now requires a payment method on file before it will create any
   service via the API** (dashboard → Billing → add a card; free-tier services
   are not charged).
2. Set the two secrets (`sync: false` vars): `DATABASE_URL` (pooled) and
   `JWT_SECRET` (`openssl rand -base64 48`).
3. Update `CORS_ORIGINS` / `FRONTEND_URL` in `render.yaml` to the SPA origin
   before the first deploy (Vercel URL, or the nginx container host if
   self-hosted).
4. Copy the service id (`srv-…`) into GitHub secret `RENDER_SERVICE_ID`.
5. Create an API key (Account settings → API keys) → GitHub secret
   `RENDER_API_KEY`.
6. First deploy: push to `main` (CI/CD) or use Dashboard → Manual Deploy.

### 3. Vercel (SPA)

1. Import the repo as a new project.
2. Framework preset: **Vite**; Root Directory: `frontend`.
3. Build settings: Build Command `pnpm build`, Output Directory `dist`
   (the commit `frontend/vercel.json` overrides the /api rewrite; the CLI
   deploy in CI/CD also uses these settings).
4. **Sentry (optional):** in Vercel → Project → Settings → Environment
   Variables, add `VITE_SENTRY_DSN` for the Production environment (Preview/
   Development optional). This is a *build-time* variable — it must exist
   before the build runs or Sentry is omitted from the bundle. A dummy value
   builds the bundle identically but sends nothing.
5. Edit `frontend/vercel.json` → replace the `destination` with your real
   Render API URL. This deployment: `https://tally-api-f95d.onrender.com/:path*`.
6. Link locally for the CI token:
   ```
   npx vercel link
   npx vercel whoami            # VERCEL_ORG_ID + VERCEL_TOKEN
   cat .vercel/project.json     # VERCEL_PROJECT_ID
   ```
7. Set GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

### 4. Sentry

1. Create a project at [sentry.io](https://sentry.io) for the **API** and copy
   its DSN → Render service env var `SENTRY_DSN` (or the `render.yaml`
   secret). Restart the service; a restart with the DSN set emits a
   `sentry_sdk.init` startup event — verify it arrives in the project's Issues.
2. Create a second project for the **SPA** and copy its DSN → Vercel
   Production env `VITE_SENTRY_DSN` (see Vercel provisioning above), then
   redeploy.
3. Sanity-check: hit an endpoint with an invalid body while
   `NODE_ENV=production` (or trigger a frontend render error) — both should
   appear in their respective Sentry projects.

### 5. GitHub

1. Protect `main` — require the `ci` check to pass on PRs (Deploy assumes CI
   is green before it runs).
2. Add all secrets from the table above.

## Local smoke (Docker)

```bash
docker compose up --build -d
curl -s localhost:8080/api/health        # liveness (through nginx)
curl -s localhost:8080/api/health/ready  # readiness incl. DB ping
curl -s localhost:8080/ | head           # SPA served
```

The smoke journey (register → create trip → add expense → balances) can be
replayed against `localhost:8080/api`; the CI deploy workflow runs the same
journey against the live URL.

## Release flow

Every push to `main` triggers `.github/workflows/deploy.yml`:

1. `prisma migrate deploy` (owner connection) — schema is applied **before**
   any new code runs.
2. Render deploy triggered via the API; the workflow waits for `/health` to go
   green.
3. SPA deployed to Vercel (`vercel --prod`).
4. Live smoke: register → create trip → add expense → ledger balances.

If a migration needs a manual step (data backfill, destructive change), split
it into its own migration and run the backfill as part of the PR that adds it;
do not rely on the automatic flow for anything interactive.

## Rollback

| Layer | Action |
|---|---|
| API | Render dashboard → service → deploys → **Deploy** on the previous successful deploy. Code and migrations are independent: an old image can run against a new schema as long as the change is additive. |
| SPA | Vercel dashboard → Deployments → previous deployment → Promote. |
| DB | `prisma migrate resolve --rolled-back <migration>` to mark a failed migration, then re-run. For data loss: Neon → Restore to a point in time (PITR) or a snapshot, then repoint `DATABASE_URL`. |

Order matters for rollback: never roll back the database first if the old API
code predates a migration — roll back API/SPA, then the DB if required.

## Backups

**Neon PITR is the primary backup** — every Neon project enables Point-in-Time
Recovery by default (7-day retention on the free tier; 24h–30d depending on
plan). This covers both schema disasters and small data-loss windows:

| Layer | What it protects | How |
|---|---|---|
| PITR | Any data loss / bad migration within the retention window | Neon dashboard → Branches & Restores → Restore → point in time; pick a timestamp, restore to a new branch, verify, then promote (or repoint `DATABASE_URL`). |
| Weekly snapshot | Baseline beyond the PITR window; disaster recovery | Neon dashboard → Branches & Restores → **Create Branch** on a weekly schedule (dashboard supports scheduled branch creation) — or export via `pg_dump` if off-platform storage is required. Keep ≥ 4 weekly snapshots. |
| CI smoke | Detection of silently-broken restores | The `deploy.yml` smoke journey runs against the live DB on every deploy — a corrupted backup is only caught by a restore drill, so treat the quarterly drill below as mandatory. |

Operational schedule (add to your calendar / runbook):

- **Daily** — no action needed (PITR runs automatically).
- **Weekly (Mon)** — create a snapshot branch, tag it `weekly-YYYY-MM-DD`.
  Prune to the last 4.
- **Quarterly** — restore drill: restore the latest snapshot to a throwaway
  branch, run `prisma migrate deploy` + a smoke journey against it, delete the
  branch. This proves the backups actually restore (and exercises the runbook
  for a real incident).

A restore is a *new branch* — the live database is never overwritten until you
promote the restored branch or repoint `DATABASE_URL`, so a botched restore
cannot damage production.

## Health & observability

- `GET /health` — liveness (no dependencies).
- `GET /health/ready` — readiness (pings Postgres).
- Structured JSON logs (pino); `x-request-id` is echoed on responses so logs
  can be correlated with a request.
- Render: service healthchecks hit `/health`; view logs via the dashboard.
- **Sentry** (optional): uncaught exceptions, unhandled promise rejections,
  and every 5xx response are reported when `SENTRY_DSN` is set; frontend
  render errors are reported via `VITE_SENTRY_DSN`. Unset = disabled (no-op),
  so local development and CI stay quiet.
