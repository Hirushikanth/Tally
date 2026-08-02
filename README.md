# Tally

A ledger-based collaborative expense management platform for trips, roommates, and groups — built on real accounting principles, not ad-hoc splitting math.

> **Guiding principle:** *A ledger never lies.* Every financial answer the app ever shows is traceable back to the transactions that produced it.

## What Tally does

- Every financial fact enters as an immutable **Business Event** — shared expense, loan, repayment, settlement, refund, or adjustment. Nothing is ever edited or deleted; mistakes are corrected by appending a new event that nets out the error, so both the mistake and the fix stay visible forever.
- A single unified, append-only **journal** (`Posting` table) per trip is the one source of truth. Balances, ledger views, and settlement suggestions are all *derived* from it — never stored as independent truth.
- Invariants are enforced at the **database level**, not just in application code:
  - postings for every event sum to exactly **zero** (deferred constraint trigger)
  - every event has **≥ 1 posting** (deferred constraint trigger)
  - a `REFUND` must reference a real prior event (`refundOfId` CHECK constraint)
  - `Posting` / `BusinessEvent` rows are **append-only** (`UPDATE`/`DELETE` revoked from the runtime DB role)
- Debt simplification is a **read-only suggestion** (minimal-transfers algorithm) — it becomes a real ledger entry only when you record an actual settlement.
- `REPAYMENT` and `SETTLEMENT` share one posting implementation; the type is a label only, never branched on in accounting logic.
- A cinematic dark UI: deep-space palette, glassmorphism, gold accents, CSS micro-animations, and a fully responsive mobile layout.

## Tech stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Backend | Node.js + TypeScript + NestJS |
| Frontend | React 19 + Vite + TypeScript (custom CSS design system) |
| Client state | Zustand (UI state) + TanStack Query (server state) |
| Auth | JWT access + refresh tokens (passport-jwt, bcrypt, token rotation) |
| Animations | CSS keyframe animations (`prefers-reduced-motion` aware) |
| Error reporting | Sentry (optional — no-op without a DSN) |

## Architecture

Strict one-directional layering, designed so the accounting core is testable in complete isolation:

```
Controllers → Application Services → Posting Engine (pure) → Repository (Prisma) → PostgreSQL
```

- **Posting Engine** (`backend/src/posting-engine/`) — pure functions, no Nest decorators, no Prisma, no side effects. One function per event type, all funneled through a shared zero-sum guard. Extractable into its own package with zero code changes.
- **Repository** — the *only* place Prisma is called for events/postings; persists `BusinessEvent` + `Posting[]` in one atomic `$transaction`.
- **Metadata isolation** — `category`, `notes`, and `attachments` are split off at the Service boundary and never reach the Posting Engine.

See `ACCOUNTING.md` (the accounting constitution) and `ARCHITECTURE.md` for the full design. `PROJECT_CONTEXT.md` is the single source of truth; `DEVELOPMENT_TIMELINE.md` tracks the phase-by-phase build.

## Repository layout

```
.
├── backend/
│   ├── src/
│   │   ├── auth/            JWT strategy, guards, role decorator
│   │   ├── trips/           trips API
│   │   ├── members/         members API
│   │   ├── events/          business events (controller → service → repository)
│   │   ├── posting-engine/  pure accounting core — no Nest, no Prisma
│   │   ├── ledger/          read path: balances, member ledger, snapshot rebuild
│   │   ├── settlements/     settlement suggestion service (read-model only)
│   │   └── common/          Prisma client, domain error filter
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/      incl. invariant enforcement triggers
│   └── tests/               posting engine, service, integration, e2e suites
├── frontend/
│   └── src/
│       ├── api/             typed API client layer (Axios + auth interceptor)
│       ├── store/           Zustand (UI-only state)
│       ├── hooks/           TanStack Query hooks (server state)
│       ├── pages/           auth, trips list, dashboard, expenses, balances, ledger
│       └── components/      shared presentational components (incl. animated Modal)
├── .github/workflows/       CI: lint + tests on push
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io) 9+
- PostgreSQL 16 (local, or a Neon free-tier project)

## Setup

### 1. Database

Local Postgres (recommended for development):

```bash
brew install postgresql@16
brew services start postgresql@16
createdb tally_dev
```

Or use a [Neon](https://neon.tech) free-tier project and copy its connection string.

### 2. Environment

```bash
cp backend/.env.example backend/.env
# Set DATABASE_URL (and a JWT_SECRET for auth) in backend/.env
```

`.env` files are git-ignored; never commit real credentials.

### 3. Install & migrate

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy
```

The invariant migration (`..._enforce_invariants/migration.sql`) runs as part of `migrate deploy` and installs the zero-sum / ≥1-posting / refund-reference triggers and the append-only privilege revokes.

> **Neon note:** create a separate restricted `app_runtime` role (distinct from the project owner) for `DATABASE_URL`, or the `REVOKE UPDATE, DELETE` enforcement has no effect.

### 4. Run

```bash
pnpm dev            # backend (:3000) + frontend (:5173) concurrently
# or separately:
pnpm dev:backend
pnpm dev:frontend
```

Open http://localhost:5173, register an account, create a trip, and start recording. The frontend proxies `/api` to `localhost:3000` (Vite dev proxy).

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run backend + frontend in watch mode |
| `pnpm dev:backend` / `pnpm dev:frontend` | Run one side only |
| `pnpm lint` | Lint all packages (ESLint backend, oxlint frontend) |
| `pnpm test` | All backend tests: posting engine + integration (requires a running Postgres) |
| `pnpm --filter backend test:posting-engine` | Pure unit tests for the accounting core — no DB, no mocks |
| `pnpm --filter backend test:integration` | Repository tests against real Postgres (triggers verified) |
| `pnpm --filter backend test:e2e` | HTTP round-trip tests |
| `pnpm --filter backend build` | Build backend (Nest) |
| `pnpm --filter frontend build` | Build frontend (tsc + Vite) |

## Testing strategy

- **Posting Engine** — pure, table-driven unit tests with no mocks and no DB (`tests/posting-engine.spec.ts`), mapping 1:1 to the accounting validation checklist (every event sums to zero, ≥1 posting per event, refund requires a source, append-only).
- **Repository / integration** — deliberately **not mocked**: they hit a real Postgres so the deferred constraint triggers are *proven* to reject bad writes (non-zero sums, zero postings, refunds without a source event, update/delete attempts).
- **E2E** — full HTTP round trips per event type plus rejection paths via Supertest.
- **CI** — GitHub Actions runs lint + tests on every push.

## Sign convention & vocabulary

- **Positive balance = should receive money. Negative balance = owes money.**
- Amounts are stored as integers in **minor units** (LKR: ×100).
- The UI never uses accounting vocabulary ("debit", "credit", "posting", "journal entry"). Users see: paid, owes, is owed, lent, borrowed, refunded, settled.
- `REPAYMENT` and `SETTLEMENT` share one posting implementation — the type is a label only, never branched on in accounting logic.

## Auth model

- **Access token** — short-lived JWT (`JWT_EXPIRES_IN`, default 15m) sent as
  `Authorization: Bearer`; carries the user id and role.
- **Refresh token** — long-lived opaque token (`REFRESH_TOKEN_EXPIRES_IN`,
  default 30d) stored *hashed* (sha256) in the `RefreshToken` table. `POST
  /auth/refresh` rotates it (old token revoked, new pair issued) so a stolen
  refresh token is automatically invalidated on reuse; `POST /auth/logout`
  revokes the presented token server-side.
- The frontend keeps the refresh token in `localStorage`, retries failed
  requests once after a single-flight refresh, and logs out when refresh
  fails. Emails are normalized (`trim().toLowerCase()`) at the boundary, so
  `ALICE@x.com` and `alice@x.com` are the same account.

## Roadmap status

Implemented: Phases 0–8 of the build timeline, plus the full production
hardening pass (H1–H10: secrets/config validation, security headers, rate
limiting, error standardization, pino logging, health checks, auth hardening,
pagination, strict frontend TS, error boundaries, tests, a11y, performance,
Docker + Render/Vercel/Neon deployment). See
[`PRODUCTION_HARDENING.md`](PRODUCTION_HARDENING.md) for the phase-by-phase
record, and [`DEPLOYMENT.md`](DEPLOYMENT.md) for the deploy runbook.

- Foundation, Posting Engine, persistence layer with DB-enforced invariants
- Auth (JWT access + refresh rotation), Trips/Members APIs, all six Business
  Event types
- Read path: balances, member ledger, settlement suggestions, balance snapshot
- Frontend features: expense/loan/payment forms, dashboard, balances, ledger view
- Visual design pass: dark glassmorphism theme, responsive mobile layout,
  CSS animations (self-hosted fonts, reduced-motion aware)
- Deployment: Docker compose (self-host), Render API + Vercel SPA + Neon
  Postgres with CI/CD, live smoke test
- Ops: Sentry error reporting (optional), backup runbook, release checklist

Remaining: full QA sign-off per [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)
and one real production deploy.

## License

Private — this project is not published.
