# Tally

A ledger-based collaborative expense management platform for trips, roommates, and groups.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- [Neon](https://neon.tech) account (free tier) for development database

## Neon database setup

Phase 0 uses a Neon Postgres project for cloud development. Local Postgres also works for development.

### Create a Neon project

1. Sign up at [neon.tech](https://neon.tech) (free tier, no card required).
2. Create a project named `tally-dev` in your nearest region.
3. Open **Dashboard → Connection details** and copy the **pooled** connection string.
4. Create `backend/.env`:

   ```bash
   cp .env.example backend/.env
   ```

5. Paste your Neon connection string as `DATABASE_URL` in `backend/.env`.
6. Apply migrations:

   ```bash
   pnpm --filter backend exec prisma migrate deploy
   ```

> **Note:** Phase 0 uses the Neon owner role for migrations (DDL privileges required). Phase 2 will introduce a restricted `app_runtime` role for runtime writes and append-only enforcement.

### Local Postgres alternative

If you prefer local development without Neon:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb tally_dev
```

Set `DATABASE_URL=postgresql://YOUR_USER@localhost:5432/tally_dev` in `backend/.env`, then run migrations as above.

## Setup

```bash
pnpm install
cp .env.example backend/.env
# Edit backend/.env with your Neon DATABASE_URL (pooled connection string)
pnpm --filter backend exec prisma migrate dev
pnpm dev:backend
```

The API runs at `http://localhost:3000`.

## Phase 0 scope

This foundation includes:

- pnpm monorepo (`backend/`, `frontend/` placeholder)
- NestJS backend with Prisma schema
- First migration against Neon
- GitHub Actions CI (lint + smoke tests on Postgres service container)

**Not yet included** (later phases):

- Posting engine (Phase 1)
- Database invariant triggers and `app_runtime` role (Phase 2)
- Auth and domain APIs (Phases 3–4)
- React frontend (Phase 6)

## Scripts

| Command | Description |
|---|---|
| `pnpm dev:backend` | Start NestJS in watch mode |
| `pnpm lint` | Lint all packages |
| `pnpm test` | Run tests in all packages |
