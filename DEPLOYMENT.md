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

### Frontend (`frontend/.env.example`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | no | Default `/api` (same-origin). Leave unset in production. |

### GitHub Actions secrets (`Settings → Secrets and variables → Actions`)

| Secret | Used for |
|---|---|
| `DATABASE_URL_OWNER` | Migrations (`prisma migrate deploy`). Neon **owner** connection string, not pooled. |
| `RENDER_API_KEY` | Triggering deploys: Render dashboard → Account → API Keys. |
| `RENDER_SERVICE_ID` | The Render service id (`srv-…` from the service URL or dashboard). |
| `VERCEL_TOKEN` | Deploying the SPA (`vercel` CLI token). |
| `VERCEL_ORG_ID` | `vercel whoami` output after linking. |
| `VERCEL_PROJECT_ID` | `.vercel/project.json` after linking. |
| `API_URL` | Live smoke tests, e.g. `https://tally-api.onrender.com`. |

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
4. Edit `frontend/vercel.json` → replace the `destination` with your real
   Render API URL (`https://tally-api.onrender.com/:path*`).
5. Link locally for the CI token:
   ```
   npx vercel link
   npx vercel whoami            # VERCEL_ORG_ID + VERCEL_TOKEN
   cat .vercel/project.json     # VERCEL_PROJECT_ID
   ```
6. Set GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.

### 4. GitHub

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

## Health & observability

- `GET /health` — liveness (no dependencies).
- `GET /health/ready` — readiness (pings Postgres).
- Structured JSON logs (pino); `x-request-id` is echoed on responses so logs
  can be correlated with a request.
- Render: service healthchecks hit `/health`; view logs via the dashboard.
