# Contributing to Tally

Thanks for wanting to help. Tally is a small monorepo — `backend/` (NestJS +
Prisma) and `frontend/` (React + Vite). Everything below reflects how the repo
is actually maintained.

## Requirements

- Node 24 (`nvm use` — `.nvmrc` is committed)
- pnpm 10 (`corepack enable`; the `packageManager` field pins the exact version)
- A local Postgres for the backend test suites and dev server

## Quick start

```bash
corepack enable
pnpm install
cp backend/.env.example backend/.env        # then fill DATABASE_URL / JWT_SECRET
pnpm dev                                     # backend :3000 + frontend :5173

pnpm --filter backend exec prisma migrate dev
```

## Commands that must stay green

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint (backend) + oxlint (frontend) |
| `pnpm test` | Backend posting engine + integration + e2e |
| `pnpm --filter frontend test` | Frontend unit + a11y suites |
| `pnpm --filter frontend test:coverage` | Coverage gate (thresholds in `vitest.config.ts`) |
| `pnpm --filter frontend build` | Type-check + production build |
| `pnpm --filter frontend check:bundle` | JS bundle budgets (H9) |
| `pnpm audit --prod` | No known vulnerable production deps |

CI (`.github/workflows/ci.yml`) runs all of these on every push/PR. A PR is
not ready until the check is green.

## How to contribute

1. Branch off `main`: `git checkout -b fix/your-change`.
2. Make the change with tests where it touches behavior.
3. Run the relevant suite locally (don't rely on CI alone).
4. Open a PR. The template is in `.github/PULL_REQUEST_TEMPLATE.md`.
5. Keep the change small and reviewable; prefer multiple PRs over one big one.

## Commit messages

Conventional-style prefixes, matching existing history:
`feat:`, `fix:`, `perf:`, `test:`, `a11y:`, `docs:`, `chore:`, `ci:`,
`ops:`, `infra:`. Example: `fix: reject duplicate email registration with 409`.

## Rules for `main`

- Deploys to production are triggered by pushes to `main` — see
  `.github/workflows/deploy.yml`. Be deliberate; every merge ships.
- Migrations are applied by the pipeline with the **owner** DB connection
  before the API deploys. Never write data-mutating logic that bypasses the
  posting engine or the DB-invariant triggers (see `ACCOUNTING.md`).
- Add a picture to the release milestone, not to `main`.

## Gotchas

- `prisma generate` updates `node_modules/.prisma` — run it after adding a
  model, or lint/typecheck will fail on unresolved Prisma types.
- The frontend is the gate for bundle size and a11y. The backend is the gate
  for accounting correctness. Respect both.
- Never commit secrets or a real `.env`. Only the `.env.example` variants are
  tracked.