# Tally

A ledger-based collaborative expense management platform for trips, roommates, and groups — built on real accounting principles, not ad-hoc splitting math.

> **Guiding principle:** *A ledger never lies.* Every financial answer the app ever shows is traceable back to the transactions that produced it.

## What Tally does

- Every financial fact enters as an immutable **Business Event** (shared expense, loan, repayment, settlement, refund, adjustment) — nothing is ever edited or deleted; corrections are new events.
- A single unified, append-only **journal** per trip is the one source of truth. Balances, ledger views, and settlement suggestions are all *derived* from it.
- Invariants (postings sum to zero, every event has ≥1 posting, refunds must reference a real prior event, history is append-only) are enforced at the **database level** with deferred constraint triggers — not just in application code.
- Debt simplification is a **read-only suggestion** — it becomes real only when you record an actual settlement.

## Tech stack

| Layer | Choice |
|---|---|
| Database | PostgreSQL |
| ORM | Prisma |
| Backend | Node.js + TypeScript + NestJS |
| Frontend | React + Vite + TypeScript (custom CSS design system) |
| Client state | Zustand (UI state) + TanStack Query (server state) |
| Auth | JWT (passport-jwt, bcrypt) |

## Repository layout

```
backend/
├── src/
│   ├── auth/            JWT strategy, guards, role decorator
│   ├── trips/           trips API
│   ├── members/         members API
│   ├── events/          business events (controller → service → repository)
│   ├── posting-engine/  pure accounting core — no Nest, no Prisma
│   ├── ledger/          read path: balances, member ledger, snapshot rebuild
│   ├── settlements/     settlement suggestion service (read-model only)
│   └── common/          Prisma client, domain error filter
├── prisma/
│   ├── schema.prisma
│   └── migrations/      incl. invariant enforcement triggers
└── tests/               posting engine, service, integration, e2e suites
frontend/
└── src/
    ├── api/             typed API client layer
    ├── store/           Zustand (UI-only state)
    ├── hooks/           TanStack Query hooks (server state)
    ├── pages/           auth, trips list, dashboard, expenses, balances, ledger
    └── components/      shared presentational components
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

### 3. Install & migrate

```bash
pnpm install
pnpm --filter backend exec prisma generate
pnpm --filter backend exec prisma migrate deploy
```

The invariant migration (`..._enforce_invariants/migration.sql`) runs as part of `migrate deploy` and sets up the zero-sum / ≥1-posting / refund-reference / append-only triggers.

### 4. Run

```bash
pnpm dev            # backend (:3000) + frontend (:5173) concurrently
# or separately:
pnpm dev:backend
pnpm dev:frontend
```

Open http://localhost:5173, register an account, create a trip, and start recording.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run backend + frontend in watch mode |
| `pnpm dev:backend` / `pnpm dev:frontend` | Run one side only |
| `pnpm lint` | Lint all packages |
| `pnpm test` | All tests: posting engine + integration (requires a running Postgres) |
| `pnpm --filter backend test:posting-engine` | Pure unit tests for the accounting core |
| `pnpm --filter backend test:integration` | Repository/E2E tests against real Postgres (triggers verified) |
| `pnpm --filter backend test:e2e` | HTTP round-trip smoke test |
| `pnpm --filter backend build` | Build backend |
| `pnpm --filter frontend build` | Build frontend |

## Testing strategy

- **Posting Engine** — pure, table-driven unit tests with no mocks and no DB (`tests/posting-engine.spec.ts`), mapping 1:1 to the accounting validation checklist.
- **Repository / integration** — deliberately **not mocked**: they hit a real Postgres so the deferred constraint triggers are proven to reject bad writes (non-zero sums, zero postings, refunds without a source event).
- **E2E** — full HTTP round trips per event type plus rejection paths via Supertest.

## Sign convention & vocabulary

- **Positive balance = should receive money. Negative balance = owes money.**
- Amounts are stored as integers in **minor units** (LKR: ×100).
- The UI never uses accounting vocabulary ("debit", "credit", "posting", "journal entry"). Users see: paid, owes, is owed, lent, borrowed, refunded, settled.
- `REPAYMENT` and `SETTLEMENT` share one posting implementation — the type is a label only, never branched on in accounting logic.

## Roadmap status

Implemented: Phases 0–7 (foundation, posting engine, persistence + DB invariants, auth & domain APIs, all six event types, read path, frontend features).

Remaining: visual polish pass, full QA, deployment (Render + Vercel + Neon), documentation.
