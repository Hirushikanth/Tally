# TripLedger — System Architecture

> This document describes how TripLedger is built, not what it must guarantee.
> For the non-negotiable accounting rules this architecture must never violate,
> see `ACCOUNTING.md`. If this document and ACCOUNTING.md conflict, ACCOUNTING.md wins.

Version: 1.0
Stack: React/Vite/TS (frontend) · NestJS/TS (backend) · PostgreSQL via Prisma (database) · Neon / Render / Vercel (hosting)

---

## 1. Architectural Goals, in priority order

1. **Correctness of the ledger above all else.** Every other goal below is subordinate to this one.
2. **A single, unmistakable path from user action to Posting.** No shortcuts, no second way to create financial state.
3. **Replaceability of every layer except the ledger itself.** UI framework, hosting provider, even the backend framework should be swappable without touching accounting logic.
4. **Boring, traceable request flow.** A senior engineer new to the codebase should be able to trace "user clicks Save" all the way to "rows in Postgres" without guessing.
5. **Testability of the accounting core in complete isolation** from HTTP, the database, and the UI.

These goals are ordered deliberately — when in doubt, correctness wins over developer convenience, and traceability wins over cleverness.

---

## 2. High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser)                         │
│   React + Vite + TypeScript + Tailwind                              │
│   Zustand (client state)  ·  TanStack Query (server state/caching)  │
└───────────────────────────────┬───────────────────────────────────--┘
                                 │  HTTPS / REST (JSON)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (NestJS)                            │
│                                                                      │
│  ┌────────────┐   ┌──────────────────┐   ┌─────────────────────┐    │
│  │ Controllers │──▶│  Application      │──▶│  Posting Engine     │   │
│  │ (HTTP layer)│   │  Services         │   │  (pure accounting   │   │
│  │             │   │  (orchestration,  │   │   logic, no I/O)    │   │
│  │             │   │   auth checks)    │   │                     │   │
│  └────────────┘   └──────────────────┘   └──────────┬──────────┘    │
│                                                       │              │
│                                                       ▼              │
│                                            ┌──────────────────────┐  │
│                                            │  Repository Layer    │  │
│                                            │  (Prisma, atomic     │  │
│                                            │   transactions)      │  │
│                                            └──────────┬───────────┘  │
└───────────────────────────────────────────────────────┼──────────---┘
                                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL (Neon, serverless)                   │
│   BusinessEvent · Posting · Member · Trip · BalanceSnapshot          │
│   + constraint triggers enforcing zero-sum & append-only            │
│   (see migration_enforce_invariants.sql)                            │
└─────────────────────────────────────────────────────────────────────┘
```

Four layers, one direction of dependency: **Controllers → Services → Posting Engine → Repository → Database**. Nothing below a layer is allowed to depend on anything above it. In particular: **the Posting Engine never imports Prisma, Express/Nest decorators, or HTTP types.** It is pure functions in, data out.

---

## 3. The Four Backend Layers, in Detail

### 3.1 Controllers (HTTP layer)

- Parse and validate the HTTP request shape (DTOs).
- Perform authentication (who is this?) via a Nest guard reading the JWT.
- Delegate everything else to a Service. A controller method should be almost entirely boilerplate — if a controller has accounting logic in it, that's a bug in this architecture.
- Never touch Prisma directly.

### 3.2 Application Services (orchestration layer)

This is where request handling actually happens:

- **Authorization** (can *this* member perform *this* action on *this* trip? — see §7 Permissions).
- **Splitting up the incoming payload** into (a) financial facts passed to the Posting Engine and (b) metadata (`category`, `notes`, `attachments`) attached directly to the `BusinessEvent` row — this is ACCOUNTING.md §3.8.1's data-isolation rule, enforced structurally here.
- **Calling the Posting Engine** to compute postings.
- **Calling the Repository layer** to persist the `BusinessEvent` + `Posting[]` atomically.
- Translating domain errors (e.g. "zero-sum violated") into clean HTTP error responses.

Services are the only layer allowed to know about both "the outside world" (HTTP, auth) and "the accounting core" (Posting Engine). They are the seam.

### 3.3 Posting Engine (the accounting core)

- **Pure functions.** Given a Business Event's financial facts, return an array of `{ memberId, amount }` postings. No database access, no HTTP, no side effects.
- One function per event type (`computeSharedExpensePostings`, `computeCashMovementPostings`, `computeRefundPostings`, `computeAdjustmentPostings`), all funneled through a single `validateZeroSum(postings)` guard before anything is returned (ACCOUNTING.md §3.4.1).
- **Repayment and Settlement share `computeCashMovementPostings`** — the event `type` string is passed through only as a label for the DB row, never branched on inside the function (§3.5.1).
- This layer is the easiest to unit-test exhaustively (see §8) precisely because it has no side effects — every test is `input in → postings out`, no mocking required.

### 3.4 Repository Layer (persistence)

- Wraps Prisma. The **only** place `PrismaClient` is imported outside of this layer.
- Responsible for the atomic transaction: `BusinessEvent` create + `Posting[]` createMany, in one `db.$transaction(...)` block (ACCOUNTING.md §3.4.2). If the Posting Engine or the zero-sum check throws, the transaction rolls back — no partial state, ever.
- Never calls `.update()` or `.delete()` on `Posting` or `BusinessEvent` tables — this is enforced twice: once here by convention/lint rule, and again at the database level by the `REVOKE` statements in `migration_enforce_invariants.sql`. Defense in depth, not redundancy for its own sake.

---

## 4. Request Flow, Traced End to End

Concrete example: a user records a $100 dinner, paid by Hirushi, split 5 ways.

```
1. UI:         User fills "Add Expense" form → POST /trips/:tripId/events
               body: { type: "SHARED_EXPENSE", amount: 10000, payers: [...],
                       participants: [...], category: "Food", notes: "..." }

2. Controller: EventsController.create()
               - Validates DTO shape (class-validator)
               - Extracts authenticated memberId from JWT via guard
               - Calls EventsService.createSharedExpense(tripId, dto, memberId)

3. Service:    EventsService.createSharedExpense()
               - Checks member has permission to write to this trip (§7)
               - Splits payload:
                   financialFacts = { amount, payers, participants }   → Posting Engine
                   metadata       = { category, notes, attachments }   → BusinessEvent row
               - Calls PostingEngine.computeSharedExpensePostings(financialFacts)

4. Posting     computeSharedExpensePostings() returns:
   Engine:       [{Hirushi:+8000}, {Kasun:-2000}, {Amal:-2000},
                   {Sahan:-2000}, {Nimal:-2000}]
               - validateZeroSum() passes (sums to 0)
               - Returns postings array to the Service (still no DB write yet)

5. Service:    Calls EventsRepository.saveEvent(tripId, type, metadata,
                                                  createdById, postings)

6. Repository: Opens a Prisma transaction:
                 a. INSERT INTO "BusinessEvent" (...)
                 b. INSERT INTO "Posting" (...) × 5
               Commits. Postgres constraint triggers (deferred) verify:
                 - postings sum to zero for this businessEventId
                 - the BusinessEvent has ≥1 posting
               If either check fails, Postgres raises and the whole
               transaction rolls back — Service receives a DB error,
               translates it to a 422 response.

7. Response:   201 Created, event + postings returned to client.

8. UI:         TanStack Query invalidates the trip's balance query →
               refetches → Zustand store updates → UI re-renders balances.
```

This is the *only* path by which a Posting is ever created. There is no admin panel, no script, no "quick fix" endpoint that bypasses steps 2–6. If one is ever needed, it still goes through the same Service → Posting Engine → Repository chain — it just becomes a new controller route, not a new write path.

---

## 5. Read Paths (Balances, Reports, Ledger Views)

Reads are architecturally simpler and deliberately kept separate from the write path (a lightweight CQRS split, without the full ceremony of a separate read database):

- **Member balance** = `SELECT SUM(amount) FROM "Posting" WHERE "memberId" = X`, optionally served from `BalanceSnapshot` for speed, always reconcilable against the live sum (ACCOUNTING.md §3.2).
- **Member ledger view** = `SELECT * FROM "Posting" WHERE "memberId" = X ORDER BY "createdAt"`, joined to `BusinessEvent` for display context. This *is* "the member's ledger" — a filtered query, not a separate stored structure (§3.1 of ACCOUNTING.md).
- **Debt simplification / settlement suggestions** = computed on demand from current balances, never persisted as a transaction unless the user actually acts on it (ACCOUNTING.md §3.7). This lives in its own `SettlementSuggestionService`, which reads balances but never writes postings.
- **BalanceSnapshot rebuild job** = a scheduled/triggerable job that recomputes and overwrites the cache table from `Posting`. It's the only code path allowed to write to `BalanceSnapshot`, and it's safe to run at any time or delete the whole table, because it's a pure projection.

---

## 6. Backend Folder Structure

```
backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── trips/
│   │   ├── trips.controller.ts
│   │   ├── trips.service.ts
│   │   ├── trips.module.ts
│   │   └── dto/
│   │
│   ├── members/
│   │   ├── members.controller.ts
│   │   ├── members.service.ts
│   │   └── members.module.ts
│   │
│   ├── events/                        # Business Events (write path)
│   │   ├── events.controller.ts       # HTTP layer only
│   │   ├── events.service.ts          # orchestration + auth + metadata split
│   │   ├── events.repository.ts       # the ONLY place Prisma is called for events/postings
│   │   ├── events.module.ts
│   │   └── dto/
│   │       ├── create-shared-expense.dto.ts
│   │       ├── create-cash-movement.dto.ts
│   │       ├── create-refund.dto.ts
│   │       └── create-adjustment.dto.ts
│   │
│   ├── posting-engine/                # Pure accounting core — NO Nest decorators, NO Prisma
│   │   ├── posting-engine.ts
│   │   ├── compute-shared-expense.ts
│   │   ├── compute-cash-movement.ts
│   │   ├── compute-refund.ts
│   │   ├── compute-adjustment.ts
│   │   ├── validate-zero-sum.ts
│   │   └── posting-engine.types.ts
│   │
│   ├── ledger/                        # Read path
│   │   ├── ledger.controller.ts       # GET balance, GET member ledger view
│   │   ├── ledger.service.ts
│   │   └── ledger.module.ts
│   │
│   ├── settlements/                   # Debt simplification (read-model only)
│   │   ├── settlements.controller.ts
│   │   ├── settlement-suggestion.service.ts
│   │   └── settlements.module.ts
│   │
│   ├── auth/
│   │   ├── jwt.strategy.ts
│   │   ├── auth.guard.ts
│   │   └── permissions.decorator.ts   # @RequireRole('ADMIN') etc.
│   │
│   └── common/
│       ├── prisma/
│       │   └── prisma.service.ts      # single PrismaClient instance
│       └── filters/
│           └── domain-error.filter.ts # translates Posting Engine errors → HTTP codes
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── ..._enforce_invariants.sql
│
├── tests/
│   ├── posting-engine.spec.ts         # maps 1:1 to ACCOUNTING.md §3.9
│   ├── events.service.spec.ts
│   └── events.e2e-spec.ts
│
└── package.json
```

**Why `posting-engine/` sits outside every Nest module boundary conceptually** (even though it's imported by `events.service.ts`): it should be extractable into its own npm package with zero code changes if TripLedger ever needs the same accounting core in a CLI tool, a batch reconciliation job, or a different backend framework entirely.

---

## 7. Permissions Model

Carried over from the original concept doc, made concrete:

| Role | Can create events | Can view trip | Can manage members | Can delete/archive trip |
|---|---|---|---|---|
| **Owner** | ✅ | ✅ | ✅ | ✅ |
| **Admin** | ✅ | ✅ | ✅ | ❌ |
| **Member** | ✅ | ✅ | ❌ | ❌ |
| **Viewer** | ❌ | ✅ | ❌ | ❌ |

- Enforced in the **Service layer**, not the Controller (permission logic needs the trip context, which is a domain concern, not an HTTP concern).
- A NestJS guard (`@RequireRole(...)`) can short-circuit obvious cases early, but the Service still re-checks before calling the Posting Engine — never trust the guard alone for something as consequential as "can this person create financial records."
- "Delete trip" never actually deletes rows — it sets `Trip.status = ARCHIVED`, consistent with the whole system's immutability stance.

---

## 8. Testing Strategy (maps directly to ACCOUNTING.md §3.9)

| Layer | What's tested | How |
|---|---|---|
| Posting Engine | Every posting rule in ACCOUNTING.md §3.5, table-driven | Pure unit tests, no mocks, no DB — fastest and most valuable tests in the codebase |
| Repository | Zero-sum and append-only invariants actually reject bad writes | Integration tests against a real (test) Postgres instance — these must NOT mock Prisma, since the whole point is confirming the DB triggers fire |
| Service | Authorization rules, metadata/financial-fact splitting | Unit tests with a mocked Repository and Posting Engine |
| E2E | Full HTTP round trip for each event type, plus the "member not found," "refund without refundOfId," "postings don't sum to zero" rejection paths | Supertest against a running Nest app + test DB |

Rule of thumb: **if a test needs to mock Prisma to test the Posting Engine, the Posting Engine has a dependency it shouldn't have.** This is the practical enforcement of the pure-function requirement in §3.3.

---

## 9. Frontend Architecture

```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── api/                    # Axios instance + typed API client functions
│   │   ├── client.ts           # interceptors: auth token injection, error normalization
│   │   ├── events.api.ts
│   │   ├── ledger.api.ts
│   │   └── trips.api.ts
│   │
│   ├── stores/                 # Zustand — client-only state (UI state, active trip, form drafts)
│   │   ├── activeTripStore.ts
│   │   └── uiStore.ts
│   │
│   ├── queries/                # TanStack Query hooks — server state, caching, invalidation
│   │   ├── useTripBalances.ts
│   │   ├── useMemberLedger.ts
│   │   └── useCreateEvent.ts
│   │
│   ├── features/
│   │   ├── expenses/           # "Add Shared Expense" form + related components
│   │   ├── loans/
│   │   ├── settlements/        # shows suggested settlements, never posts directly
│   │   └── ledger-view/        # per-member transaction history
│   │
│   └── components/             # shared, dumb, presentational components
│
└── package.json
```

**Critical rule carried from ACCOUNTING.md §3.8:** no component, store, or API function on the frontend ever references "debit," "credit," "posting," or "journal entry." The UI vocabulary is strictly: paid, owes, is owed, lent, borrowed, refunded, settled. If a design mock or component name introduces accounting jargon, that's a sign the abstraction is leaking.

**State split**: Zustand owns things the server doesn't know about (which form tab is open, draft input). TanStack Query owns everything that comes from the API (balances, ledger entries, trip data) and handles caching/invalidation/refetch — these are not interchangeable, and mixing them (e.g. storing fetched balances in Zustand) reintroduces manual cache-sync bugs of exactly the kind ACCOUNTING.md's single-ledger model was designed to avoid at the data layer.

---

## 10. Deployment Topology

```
┌────────────────────┐      ┌──────────────────────┐      ┌────────────────────┐
│   Vercel / Netlify │      │       Render          │      │        Neon         │
│   (static frontend)│─────▶│  (NestJS web service) │─────▶│  (PostgreSQL, with  │
│                    │ HTTPS │                       │ TCP  │  constraint         │
│   React build      │      │  Free tier: sleeps     │      │  triggers +         │
│   output           │      │  after 15 min idle,    │      │  scale-to-zero)     │
│                    │      │  ~30–60s cold start    │      │                     │
└────────────────────┘      └──────────────────────┘      └────────────────────┘
```

- **Environment variables** (`DATABASE_URL`, `JWT_SECRET`) live in Render's dashboard, never committed. `.env.example` documents required keys without values.
- **Migrations**: `prisma migrate deploy` runs as part of Render's build/deploy step, immediately followed by a check that `migration_enforce_invariants.sql` has been applied (idempotent — uses `CREATE OR REPLACE FUNCTION`, safe to re-run).
- **CI** (GitHub Actions, free for public/small private repos): on every push — run `posting-engine.spec.ts` and `events.e2e-spec.ts` against a throwaway Postgres service container, so the invariant triggers are tested in CI exactly as they run in production, not skipped because "it's just a trigger."
- **Cold starts are a known, accepted limitation** given the free hosting constraint (see prior conversation) — documented explicitly rather than hidden, including in the FYP write-up's Limitations section.

---

## 11. Error Handling Strategy

Errors are categorized by where they originate, and each layer only handles errors from the layer directly below it:

| Error origin | Example | Surfaced as |
|---|---|---|
| DTO validation | Missing `amount` field | 400 Bad Request, field-level messages |
| Authorization | Viewer tries to create an event | 403 Forbidden |
| Posting Engine | Zero-sum check fails before DB write | 422 Unprocessable Entity, "Postings do not balance" |
| Database constraint trigger | Somehow a bad write reaches Postgres anyway | 500 Internal Server Error, logged with full context — this should be treated as a bug in the Service/Posting Engine layer, since the constraint trigger is a backstop, not an expected first line of defense |
| Not found | Invalid `tripId` / `memberId` | 404 Not Found |

A `DomainErrorFilter` (Nest exception filter) is the single place that maps internal error types to HTTP status codes — controllers never write `try/catch` blocks for this themselves.

---

## 12. What This Architecture Deliberately Does Not Do (yet)

Consistent with ACCOUNTING.md §4's non-goals:

- No event bus / message queue — everything is a synchronous request/response cycle. There's exactly one writer (the app itself) and no need for async processing at this scale.
- No microservices — this is a single deployable backend. Splitting the Posting Engine into its own service would add network calls to the one part of the system that most benefits from being a simple, fast, in-process pure function.
- No real-time sync (WebSockets/SSE) in v1 — balance updates happen via query invalidation on the client after a successful write, not push updates. Worth revisiting only if multiple people editing the same trip simultaneously becomes a real, observed problem.

---

## Guiding Principle

> Every layer in this architecture exists to protect one thing: the moment a Posting is written to the database, it is correct, complete, and permanent.
> Everything above the Posting Engine is replaceable. The Posting Engine and the invariants it enforces are not.
