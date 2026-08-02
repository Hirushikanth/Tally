# Tally — Complete Project Context

> **Purpose of this document:** this is the single source of truth for the
> Tally project. It is written so that an agentic AI with no other context
> could implement the entire system correctly from this file alone. Every
> decision recorded here was deliberate; nothing is a placeholder. Where a
> decision is explicitly deferred, it is labeled as such — assume nothing
> beyond what is written.
>
> Companion documents (already produced, should be treated as authoritative
> and consistent with this file): `ACCOUNTING.md`, `ARCHITECTURE.md`,
> `schema.prisma`, `migration_enforce_invariants.sql`, `DEVELOPMENT_TIMELINE.md`.
> If any statement in this document ever conflicts with `ACCOUNTING.md`
> specifically, `ACCOUNTING.md` wins — it is the accounting constitution.

---

## 1. Identity

- **Name:** Tally
- **One-line pitch:** A ledger-based collaborative expense management platform for trips, roommates, and groups — built on real accounting principles, not ad-hoc splitting math.
- **Guiding principle:** *A ledger never lies.* Every financial answer the app ever shows must be traceable back to the transactions that produced it.

---

## 2. Problem Statement

Groups of people (trip companions, roommates, clubs) constantly exchange money — one person pays a hotel bill, another lends a friend cash, a debt gets partially repaid, a refund arrives and needs to be redistributed. Existing expense-splitter apps answer "who owes whom right now" but silently discard *how* that number was reached, and they let balances be edited directly, which means mistakes are invisible and unrecoverable.

Tally answers a different, harder question: **what happened, in order, and can every number be proven from that history?** The system is architecturally incapable of losing or silently correcting a financial fact — corrections are new events, not edits.

---

## 3. Core Philosophy

1. **Event-driven.** Every financial fact enters the system as an immutable Business Event. Nothing is ever recorded by directly setting a balance.
2. **Ledger-first.** A single, unified, append-only journal (`Posting` table) per Trip is the one source of truth. Balances, ledger views, and reports are all *derived* from it, never stored as independent truth.
3. **Immutable history.** Nothing is ever deleted or updated once written. Mistakes are corrected by appending a new event that nets out the error, leaving both the mistake and the fix visible forever.
4. **No mistakes by construction, not by convention.** Every invariant that matters (postings sum to zero, every event has at least one posting, refunds reference a real prior event, financial rows are never mutated) is enforced at the database level via constraints and triggers — not merely hoped for via careful application code.

---

## 4. Scope Decisions for v1 (explicit, deliberate)

These were actively chosen, not defaulted into — do not "helpfully" add scope back in without re-reading this section:

| Decision | Chosen | Explicitly NOT doing (v1) |
|---|---|---|
| Currency | Single currency per trip (`Trip.currency`, informational only) | No multi-currency conversion, no FX gain/loss accounts, no historical exchange rates |
| Chart of Accounts | **"Positions only"** — the only account type is a Member Account (one balance per member per trip) | No Expense/Asset/Liability/Equity ledger accounts. Category is metadata for reporting, never a posting target |
| Wallets | Not modeled | No Cash/Bank/Credit Card account tracking; the system does not know where money physically sits |
| Real-time sync | Not implemented | No WebSockets/SSE; client refetches via query invalidation after a successful write |
| Architecture style | Layered monolith with a pure accounting core | No microservices, no message queue/event bus — single synchronous request/response backend |
| Debt simplification | Read-only suggestion feature | Never persisted as a transaction unless the user explicitly acts on it by recording a real `SETTLEMENT` event |

**Future extension path (non-binding, documented so a future rewrite isn't surprised):** if Tally ever needs to answer "where did the trip's money actually go" (true trip-level bookkeeping, not just relative positions), the Chart of Accounts would need to grow to include Expense/Asset/Equity accounts, and the simplified N-party zero-sum invariant (§6 below) would be replaced by a full debit-column = credit-column model. This is not being built now.

---

## 5. Glossary — Exact Meaning of Every Domain Term

- **Trip** — a group/context containing Members and a shared financial history. Functions like a WhatsApp group with a ledger attached.
- **Member** — a User's participation within one specific Trip. One Member row per (Trip, User) pair. Owns exactly one running balance in that Trip.
- **Business Event** — the *only* way a financial fact enters the system. An immutable record of something that happened in the real world, described in human/business terms (never accounting terms: no "debit," "credit," "account" anywhere near a Business Event). See §7 for the exhaustive list of types.
- **Posting** — a single signed amount attributed to one Member, produced by the Posting Engine from a Business Event. The `Posting` table **is** the unified ledger/journal.
- **Ledger** — not a separate stored structure. "A member's ledger" = all Postings where `memberId = X`, ordered by time. It is a filtered *view*, not a table per member.
- **Balance** — `SUM(Posting.amount)` for a given member. Never stored as ground truth; may be cached (`BalanceSnapshot`) but the cache must always be reconcilable to this sum on demand.
- **Posting Engine** — the pure-function accounting core that turns a Business Event's financial facts into a balanced array of Postings. Has no database access, no HTTP awareness, no side effects.
- **Settlement Suggestion** — a computed, non-persisted recommendation (e.g. "A should pay C $50 to simplify debts"). Never a Business Event. Becomes real only if a user records an actual `SETTLEMENT` event for the suggested payment.
- **Chart of Accounts** — in this system, reduced to a single account type: the Member Account. See §6.

---

## 6. Chart of Accounts & Sign Convention

**The entire Chart of Accounts, v1:**
```
Member Account (one per Member per Trip)
```
No Expense, Asset, Liability, Equity, or Revenue accounts exist. Category (e.g. "Food," "Fuel") is stored as metadata on the Business Event for filtering/reporting only, and must never be visible to, or used by, the Posting Engine.

**Sign convention (absolute, applies everywhere without exception):**
> **Positive balance = this member should RECEIVE money.**
> **Negative balance = this member OWES money.**

**Generalized invariant** (replaces classical two-column debit=credit, since there's only one account type):
> For every Business Event, the signed amounts across all Postings it produces must sum to exactly zero.

---

## 7. Business Event Types — Exhaustive, With Posting Rules

Six types exist in v1. No others. A new financial scenario must be modeled as one of these six, or this document must be amended first.

| Type | Real-world meaning | Posting rule | Notes |
|---|---|---|---|
| `SHARED_EXPENSE` | One or more people paid for something on behalf of a group, split some way | For each payer: `posting = amountPaid − shareOwed`. For each non-paying participant: `posting = −shareOwed`. | Supports **multiple payers** natively — see §7.1 for worked math. Split methods supported: Equal, Percentage, Exact Amount, Shares, Custom. |
| `LOAN` | One person gives another money outside any shared expense | Lender: `+amount`. Borrower: `−amount`. | |
| `REPAYMENT` | Cash moves to reduce a previously created debt | Cash payer: `+amount`. Cash receiver: `−amount`. | **Implemented via the exact same function as `SETTLEMENT`** — see §7.2. Type is a label only. |
| `SETTLEMENT` | Cash moves between members to true up balances | Cash payer: `+amount`. Cash receiver: `−amount`. | Mechanically identical to `REPAYMENT`. Distinguished only by user intent/metadata, never by posting logic. |
| `REFUND` | Money comes back from a third party (vendor, hotel), related to a prior event | Reverses the original event's postings, scaled by `refundAmount / originalAmount`, sign-flipped. Never computed independently of the source event. | **Must** carry `refundOfId` pointing to a real prior Business Event. A refund without a valid `refundOfId` is invalid and must be rejected — enforced by a database CHECK constraint. See §7.3 for worked math. |
| `ADJUSTMENT` | Admin-entered correction, used only when no other type fits | Free-form postings, entered directly, must still sum to zero. | Should be rare. Frequent use signals a missing event type, not normal workflow. |

### 7.1 Shared Expense — Multi-Payer Netting (worked example)

Hirushi and Kasun jointly pay $100 for a hotel ($60 from Hirushi, $40 from Kasun), split 5 ways ($20 each) among Hirushi, Kasun, Amal, Sahan, Nimal:

| Member | Paid | Owes (share) | Posting |
|---|---|---|---|
| Hirushi | 60 | 20 | **+40** |
| Kasun | 40 | 20 | **+20** |
| Amal | 0 | 20 | **−20** |
| Sahan | 0 | 20 | **−20** |
| Nimal | 0 | 20 | **−20** |

Sum = 40+20−20−20−20 = **0** ✓. If a member is only a payer (not a participant), `shareOwed = 0`. If only a participant, `amountPaid = 0`. Same formula, no special cases.

### 7.2 Cash Movement (Repayment / Settlement) — Single Implementation

```typescript
function createCashMovement(input: {
  tripId: string;
  cashPayerId: string;    // hands over real money
  cashReceiverId: string; // receives real money
  amount: number;
  type: 'REPAYMENT' | 'SETTLEMENT'; // label only — stored on BusinessEvent, never branched on
  notes?: string;
}) {
  const postings = [
    { memberId: input.cashPayerId, amount: input.amount },
    { memberId: input.cashReceiverId, amount: -input.amount },
  ];
  // saveEvent() persists BusinessEvent + postings atomically, validating zero-sum
}
```
**Rule:** if a posting-calculation function ever contains `if (type === 'REPAYMENT')`, that is a specification violation. The UI may show different icons/labels; the backend posting logic must be blind to the difference.

### 7.3 Refund — Proportional Reversal (worked example)

Partial refund of $40 on the original $100/5-way shared expense above (each original participant owed $20, i.e. posting was −20; Hirushi's posting was +80 as sole payer in the simple single-payer version):

Ratio = 40/100 = 0.4. Each original posting is scaled by this ratio and sign-flipped:
- Hirushi: original +80 → refund posting **−32**
- Kasun: original −20 → refund posting **+8**
- Amal: original −20 → refund posting **+8**
- Sahan: original −20 → refund posting **+8**
- Nimal: original −20 → refund posting **+8**

Sum = −32+8+8+8+8 = **0** ✓. This guarantees a refund can never be "invented" — it is always mechanically derived from a real prior transaction via `refundOfId`, never recomputed from scratch with fresh assumptions.

---

## 8. Ledger Rules & Invariants (Non-Negotiable)

1. **Single unified journal per Trip.** No per-member ledger tables. A member's ledger is a filtered query over `Posting`.
2. **Balances always derived, never stored as truth.** `Balance(member) = SUM(Posting.amount) WHERE memberId = member`. Any stored value is a disposable, rebuildable cache.
3. **History is immutable.** Postings and Business Events are never updated or deleted after creation, enforced by revoking `UPDATE`/`DELETE` privileges from the application's database role at the Postgres level (not just by application convention).
4. **Zero-sum invariant enforced at write time.** `SUM(Posting.amount WHERE businessEventId = X) == 0`, checked before commit, both in application code and via a deferred Postgres constraint trigger.
5. **The zero-sum check lives in exactly one shared place** (e.g. a `saveEvent()` function). Individual posting-calculation functions compute postings; they never validate or persist independently.
6. **A Business Event's creation and its Postings are one atomic transaction.** A Business Event must never exist in the database without its Postings, even transiently — both writes succeed together or neither commits.
7. **Corrections never mutate; they append.** Fixing a mistake means creating a new event (`ADJUSTMENT` or a reversal + corrected re-entry), never touching the original rows. The audit trail always shows both the mistake and the fix.
8. **Debt simplification never touches the ledger.** It is a read-model computed on demand from current balances, presented only as a suggestion, and becomes real only when the user records an actual `SETTLEMENT` event.
9. **The UI never constructs a Posting directly**, never displays "debit"/"credit"/"account" terminology, and never lets the Posting Engine see `category`/`notes`/`attachments` — those are split off as metadata at the Service/Controller boundary before reaching the engine.
10. **The Posting Engine is the only code path permitted to create a Posting.**

### 8.1 Validation Checklist (must hold at all times — map 1:1 to tests)

- [ ] Every Business Event has ≥1 Posting, and postings sum to exactly 0.
- [ ] Every Posting references exactly one valid Member and one valid Business Event.
- [ ] No Posting or Business Event row is ever updated after creation (enforced via revoked DB privileges, not a code comment).
- [ ] Every `REFUND` event has a valid, non-null `refundOfId` pointing to a real prior event (enforced via a database CHECK constraint).
- [ ] A member's displayed balance always equals `SUM(Posting.amount)` for that member; any cached value must be reconcilable to this on demand.

---

## 9. Data Model

### 9.1 Entities

```
User          — a registered account (id, name, email, createdAt)
Trip          — a group + shared financial context (id, name, description, currency, status, createdBy, createdAt)
Member        — a User's participation in one Trip (id, tripId, userId, joinedAt, leftAt?) — unique per (tripId, userId)
BusinessEvent — the human-facing "what happened" record (id, tripId, type, notes, category?, amount, createdBy, createdAt, refundOfId?)
Attachment    — receipts/images/PDFs linked to a BusinessEvent
Posting       — the accounting-facing "what moved" record (id, businessEventId, memberId, amount [signed, minor units], createdAt)
BalanceSnapshot — disposable cache (memberId, balance, computedAt) — rebuildable from Posting at any time
```

### 9.2 Key Relationships

- `Trip 1—N Member` — one Member row per participant.
- `Trip 1—N BusinessEvent` — every event belongs to exactly one Trip.
- `BusinessEvent 1—N Posting` — every event produces one or more Postings.
- `BusinessEvent 0—1 BusinessEvent` (self-relation, `refundOfId`) — a `REFUND` event points back at the original event it reverses.
- `Member 1—N Posting` — a member's ledger is `Posting` filtered by `memberId`.
- `Member 0—1 BalanceSnapshot` — cached balance, always rebuildable.

### 9.3 Full Prisma Schema

Reproduced in full — this is authoritative and must match `schema.prisma` exactly:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  createdAt     DateTime @default(now())
  memberships   Member[]
  createdTrips  Trip[]   @relation("TripCreator")
  createdEvents BusinessEvent[] @relation("EventCreator")
}

model Trip {
  id          String     @id @default(cuid())
  name        String
  description String?
  currency    String     @default("LKR")
  status      TripStatus @default(ACTIVE)
  createdAt   DateTime   @default(now())
  createdById String
  createdBy   User       @relation("TripCreator", fields: [createdById], references: [id])
  members     Member[]
  businessEvents BusinessEvent[]
}

enum TripStatus {
  ACTIVE
  ARCHIVED
  SETTLED
}

model Member {
  id              String    @id @default(cuid())
  tripId          String
  trip            Trip      @relation(fields: [tripId], references: [id])
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  joinedAt        DateTime  @default(now())
  leftAt          DateTime?
  postings        Posting[]
  balanceSnapshot BalanceSnapshot?

  @@unique([tripId, userId])
}

enum BusinessEventType {
  SHARED_EXPENSE
  LOAN
  REPAYMENT
  SETTLEMENT
  REFUND
  ADJUSTMENT
}

model BusinessEvent {
  id          String            @id @default(cuid())
  tripId      String
  trip        Trip              @relation(fields: [tripId], references: [id])
  type        BusinessEventType
  notes       String?
  category    String?
  amount      Int
  createdById String
  createdBy   User              @relation("EventCreator", fields: [createdById], references: [id])
  createdAt   DateTime          @default(now())
  refundOfId  String?
  refundOf    BusinessEvent?    @relation("EventRefunds", fields: [refundOfId], references: [id])
  refunds     BusinessEvent[]   @relation("EventRefunds")
  attachments Attachment[]
  postings    Posting[]

  @@index([tripId, type])
}

model Attachment {
  id              String        @id @default(cuid())
  businessEventId String
  businessEvent   BusinessEvent @relation(fields: [businessEventId], references: [id])
  url             String
  fileType        String
  uploadedAt      DateTime      @default(now())
}

model Posting {
  id              String        @id @default(cuid())
  businessEventId String
  businessEvent   BusinessEvent @relation(fields: [businessEventId], references: [id])
  memberId        String
  member          Member        @relation(fields: [memberId], references: [id])
  amount          Int
  createdAt       DateTime      @default(now())

  @@index([memberId])
  @@index([businessEventId])
}

model BalanceSnapshot {
  memberId   String   @id
  member     Member   @relation(fields: [memberId], references: [id])
  balance    Int
  computedAt DateTime @default(now())
}
```

### 9.4 Database-Level Invariant Enforcement

Applied via a SQL migration (`migration_enforce_invariants.sql`), run after Prisma's own migrations:

1. **Append-only enforcement:** `REVOKE UPDATE, DELETE` on `Posting` and `BusinessEvent` from the application's runtime DB role (`app_runtime`, or whatever the actual role is named — must be distinct from the database owner/admin role, or the revoke enforces nothing).
2. **Zero-sum trigger:** a `DEFERRABLE INITIALLY DEFERRED` constraint trigger on `Posting`, firing at transaction commit, checking `SUM(amount) WHERE businessEventId = X == 0`. Deferred so multiple Posting rows from one event can be inserted within a single transaction without tripping the check on intermediate states.
3. **"≥1 posting" trigger:** a separate deferred constraint trigger on `BusinessEvent`, closing the gap where an event with zero postings would otherwise pass the zero-sum check vacuously (empty sum = 0).
4. **Refund reference constraint:** a `CHECK` constraint on `BusinessEvent`: `type != 'REFUND' OR refundOfId IS NOT NULL`.

These are backstops, not the first line of defense — application code should still validate before attempting a write, so users see clean error messages rather than raw Postgres exceptions. But the triggers exist so correctness is guaranteed even if application code has a bug.

---

## 10. System Architecture

### 10.1 Layering (strict, one-directional dependency)

```
Controllers → Application Services → Posting Engine → Repository Layer → PostgreSQL
```

- **Controllers** (HTTP layer): parse/validate requests, authenticate via JWT guard, delegate to Services. No accounting logic, no direct Prisma access.
- **Application Services** (orchestration): authorization checks, splitting incoming payloads into financial facts (→ Posting Engine) vs. metadata (→ BusinessEvent row directly), calling the Repository to persist atomically, translating domain errors into HTTP errors.
- **Posting Engine** (pure accounting core): pure functions only — no database access, no HTTP awareness, no side effects. One function per event type, all funneled through a shared `validateZeroSum` guard. This is the one layer designed to be extractable into its own package/framework-agnostic module.
- **Repository Layer**: the only place `PrismaClient` is imported. Wraps the atomic `$transaction` (BusinessEvent create + Posting[] createMany, single commit or full rollback).

### 10.2 Request Flow (traced example: $100 dinner, Hirushi pays, split 5 ways)

```
1. UI → POST /trips/:tripId/events { type: SHARED_EXPENSE, amount, payers, participants, category, notes }
2. Controller → validates DTO, extracts memberId from JWT, calls Service
3. Service → checks permission, splits payload into financialFacts vs metadata
4. Posting Engine → computeSharedExpensePostings(financialFacts) → [{Hirushi:+80},{Kasun:-20},{Amal:-20},{Sahan:-20},{Nimal:-20}] → validateZeroSum passes
5. Service → calls Repository.saveEvent(tripId, type, metadata, createdById, postings)
6. Repository → opens transaction: INSERT BusinessEvent, INSERT Posting × 5 → commits
   → Postgres deferred triggers verify zero-sum and ≥1-posting → pass
7. Response → 201 Created
8. UI → TanStack Query invalidates balance query → refetches → Zustand/UI updates
```

This is the **only** path by which a Posting is ever created — no admin panel, script, or "quick fix" endpoint bypasses Service → Posting Engine → Repository.

### 10.3 Read Paths (lightweight CQRS split, no full event-sourcing ceremony)

- **Balance:** `SUM(Posting.amount)` per member, servable from `BalanceSnapshot` cache, always reconcilable to the live sum.
- **Ledger view:** `Posting` filtered by `memberId`, joined to `BusinessEvent`, ordered by time.
- **Settlement suggestions:** computed on demand in a dedicated `SettlementSuggestionService` that reads balances but never writes postings.
- **BalanceSnapshot rebuild:** a scheduled/triggerable job, the only writer to that table.

### 10.4 Permissions Model

| Role | Create events | View trip | Manage members | Archive trip |
|---|---|---|---|---|
| Owner | Yes | Yes | Yes | Yes |
| Admin | Yes | Yes | Yes | No |
| Member | Yes | Yes | No | No |
| Viewer | No | Yes | No | No |

Enforced in the Service layer (needs trip context), with a Nest guard short-circuiting obvious cases early. "Delete trip" sets `Trip.status = ARCHIVED`; nothing is ever hard-deleted.

### 10.5 Backend Folder Structure

```
backend/src/
├── main.ts, app.module.ts
├── trips/            (controller, service, module, dto)
├── members/           (controller, service, module)
├── events/            (controller = HTTP only, service = orchestration + metadata split,
│                        repository = ONLY place Prisma is called for events/postings, dto/)
├── posting-engine/    (pure functions — NO Nest decorators, NO Prisma:
│                        posting-engine.ts, compute-shared-expense.ts, compute-cash-movement.ts,
│                        compute-refund.ts, compute-adjustment.ts, validate-zero-sum.ts, types)
├── ledger/            (read path: controller, service — balance + member ledger view)
├── settlements/       (read-model only: controller, settlement-suggestion.service.ts)
├── auth/              (jwt.strategy.ts, auth.guard.ts, permissions.decorator.ts)
└── common/
    ├── prisma/prisma.service.ts   (single PrismaClient instance)
    └── filters/domain-error.filter.ts

prisma/schema.prisma, prisma/migrations/

tests/
├── posting-engine.spec.ts   (maps 1:1 to §8.1 checklist)
├── events.service.spec.ts
└── events.e2e-spec.ts
```

### 10.6 Frontend Folder Structure

```
frontend/src/
├── main.tsx, App.tsx
├── api/         (client.ts w/ auth interceptor, events.api.ts, ledger.api.ts, trips.api.ts)
├── stores/      (Zustand — client-only UI state: activeTripStore.ts, uiStore.ts)
├── queries/     (TanStack Query hooks — server state: useTripBalances.ts, useMemberLedger.ts, useCreateEvent.ts)
├── features/    (expenses/, loans/, settlements/, ledger-view/)
└── components/  (shared, dumb, presentational)
```

**State split rule:** Zustand owns things the server doesn't know about (draft form input, open UI tabs). TanStack Query owns everything from the API (balances, ledger entries) including caching/invalidation. Never store fetched server data in Zustand — that reintroduces manual cache-sync bugs.

**Vocabulary rule:** no frontend code ever references "debit," "credit," "posting," or "journal entry." UI vocabulary is strictly: paid, owes, is owed, lent, borrowed, refunded, settled.

### 10.7 Error Handling

| Origin | Example | HTTP response |
|---|---|---|
| DTO validation | Missing `amount` | 400 Bad Request |
| Authorization | Viewer attempts a write | 403 Forbidden |
| Posting Engine | Zero-sum check fails pre-write | 422 Unprocessable Entity |
| DB constraint trigger fires (should be rare — a backstop) | Bad write somehow reached Postgres | 500, logged as a bug in Service/Posting Engine layer |
| Not found | Invalid `tripId`/`memberId` | 404 Not Found |

A single `DomainErrorFilter` (Nest exception filter) maps internal errors to HTTP codes — controllers never hand-roll try/catch for this.

### 10.8 Testing Strategy

| Layer | Tested via | Notes |
|---|---|---|
| Posting Engine | Pure unit tests, table-driven against §7's rules, no mocks, no DB | Fastest, most valuable tests in the codebase |
| Repository | Integration tests against a real (test) Postgres | Must NOT mock Prisma — the point is confirming triggers actually fire |
| Service | Unit tests with mocked Repository + Posting Engine | Authorization + metadata-splitting logic |
| E2E | Supertest against a running app + test DB | Full HTTP round trip per event type, plus rejection paths (bad refund, non-zero sum, missing member) |

**Rule of thumb:** if testing the Posting Engine ever requires mocking Prisma, the Posting Engine has a dependency it shouldn't have.

---

## 11. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Database | PostgreSQL | Required for real constraint triggers and privilege-based immutability enforcement |
| ORM | Prisma | Schema already written against it |
| Backend | Node.js + TypeScript + NestJS | Nest's module/controller/service/provider structure maps directly onto the required layering, enforcing the architecture via the framework rather than discipline alone |
| Frontend | React + Vite + TypeScript + Tailwind | Matches established aesthetic direction (see §13) |
| Client state | Zustand (UI state) + TanStack Query (server state/caching) | See §10.6 state-split rule |
| Auth | JWT (or Clerk/Auth0 if not hand-rolling), kept decoupled from ledger logic | Auth has nothing to do with accounting invariants |

---

## 12. Hosting (Free-Tier, verified as of mid-2026)

| Layer | Provider | Notes |
|---|---|---|
| Database | Neon | Permanent free tier, no card required; scales to zero after inactivity; standard Postgres connection string, so trigger/constraint SQL runs unmodified. Create a separate restricted `app_runtime` role distinct from the project owner role, or the `REVOKE` privilege trick enforces nothing. |
| Backend | Render | Free web service tier; sleeps after 15 min idle, ~30–60s cold start on next request. Railway and Fly.io no longer offer comparable ongoing free tiers (trial-credit only) as of this writing — reverify if this document is used much later, since hosting free tiers change. |
| Frontend | Vercel or Netlify | Static hosting, permanent free tier, no cold-start penalty since there's no server process. |

**Known accepted limitation:** Render free-tier cold start (~30–60s) after idle. Mitigate with a pre-demo ping, or document explicitly as a limitation rather than hide it.

---

## 13. Visual/UI Design Direction

The frontend should follow a cinematic, dark-themed aesthetic: deep space color palette, glassmorphism (frosted translucent panels, soft blur, subtle borders), gold/warm accent colors against the dark base, and restrained but deliberate motion (Framer Motion) for state transitions — not a generic light SaaS dashboard look. This applies consistently across every screen: trip dashboard, ledger view, forms, settlement suggestions. Visual polish is deliberately sequenced after functional correctness, not before — style is layered onto proven components, not built simultaneously with them.

---

## 14. Definition of Done

A feature, or the project as a whole, is not complete until:

1. Every rule in §8's Validation Checklist has a corresponding, passing, non-mocked test.
2. Every Business Event type in §7 can be created through the full HTTP stack and produces exactly the postings specified in its rule.
3. A deliberately malformed write (non-zero sum, missing refund reference, attempted update/delete of a Posting or BusinessEvent) is rejected by the database itself, verified by an integration test that does not mock Prisma.
4. No frontend code, component name, or user-facing string uses accounting vocabulary ("debit," "credit," "posting," "journal," "account").
5. The settlement-suggestion feature has a test proving it performs zero writes to `Posting`/`BusinessEvent` under any input.
6. The full user journey (create trip → add members → record a shared expense, a loan, and a settlement → view correct resulting balances) works end to end in the deployed (not just local) environment.

---

## 15. Roadmap Reference

See `DEVELOPMENT_TIMELINE.md` for the full phase-by-phase implementation schedule (~10 weeks, 12 phases). Critical path: Foundation → Posting Engine → Persistence Layer → Core Domain APIs → Business Event APIs → Read Path → Frontend Features → Testing & QA → Deployment. The Posting Engine (Phase 1) is the highest-priority phase in the entire project — it has zero external dependencies, is the fastest thing to get provably correct, and everything else in the system is built on top of it being right first.

---

## 16. Key Decisions Log (chronological, for context on why, not just what)

1. Single unified ledger per Trip, not one ledger per member — eliminates synchronization/consistency risk between duplicated books.
2. "Positions only" chart of accounts chosen over full trip-level bookkeeping — this is a relative-position tracker, not a business filing taxes; category is metadata, not an account.
3. Sign convention fixed as: positive = should receive, negative = owes.
4. Business Event → Posting Engine → Journal Entries separation adopted specifically to keep the UI ignorant of debit/credit and to make the posting engine unit-testable in total isolation.
5. Repayment and Settlement collapsed into one `createCashMovement` implementation — identical posting logic, differentiated only by a label, to prevent future logic drift between two conceptually identical operations.
6. Refunds must reference their source event (`refundOfId`) and are always proportionally derived from it — refunds are never independently invented.
7. Zero-sum and append-only invariants enforced at the database level (triggers + revoked privileges), not only in application code, because the project's explicit goal is that users "can make no mistakes" — application-only validation can be bypassed by a bug or an unreviewed code path; a database constraint cannot.
8. Business Event creation and Posting creation must be one atomic transaction — a partial write (event without postings) would itself violate the system's core invariant.
9. Multi-currency explicitly dropped for v1, simplifying the chart of accounts, removing FX concerns, and allowing plain integer minor-unit (cents) arithmetic everywhere.
10. NestJS chosen over plain Express specifically because its structural conventions reinforce the required Controller/Service/Engine/Repository layering rather than relying purely on developer discipline.
11. Hosting chosen for free-tier availability and Postgres-compatibility (Neon), accepting a documented cold-start tradeoff on the backend (Render) as a reasonable cost for a project at this stage.
12. Project named Tally (formerly referred to as "TripLedger" during design discussions — TripLedger was a working title, not the final name).
