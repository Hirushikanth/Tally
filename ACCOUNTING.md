# TripLedger — Accounting Specification

> This document is the constitution of TripLedger's accounting engine.
> No schema, API, or UI decision may contradict this document.
> If code and this document disagree, the code is wrong.

Version: 1.0
Scope: Single-currency, "positions only" model (no expense/category accounts, no multi-currency).

---

## 1. What Is a Business Event?

A **Business Event** is the *only* way money-related facts enter TripLedger. It represents something that happened in the real world, described in human/business terms — never in accounting terms.

### 1.1 Definition

> A Business Event is an immutable record of a real-world financial occurrence, submitted by a user, which the Posting Engine translates into one or more balanced Postings.

### 1.2 Properties of every Business Event

- **Immutable.** Once created, a Business Event is never edited or deleted.
- **Attributable.** Every event has exactly one `createdBy` and one `createdAt`.
- **Self-contained.** An event must carry enough information for the Posting Engine to compute postings *deterministically* — no external state, no "ask the UI later."
- **Non-accounting vocabulary.** An event never mentions debit, credit, or account names. It describes what happened: who paid, who owes, who received, how much, and — for refunds — what original event it relates to.
- **Category/notes/attachments are metadata only.** They exist for human reporting and search. They must never influence how postings are computed.

### 1.3 The six Business Event types

| Type | Real-world meaning |
|---|---|
| `SHARED_EXPENSE` | One or more people paid for something on behalf of a group, split some way |
| `LOAN` | One person gives another money outside of any shared expense |
| `REPAYMENT` | Cash moves to reduce a previously created debt |
| `SETTLEMENT` | Cash moves between members to true up balances (functionally identical to repayment) |
| `REFUND` | Money comes back from a third party (hotel, vendor) related to a prior event |
| `ADJUSTMENT` | An admin-entered correction, used only when no other event type fits |

No other event types exist in v1. A new financial scenario must be modeled as one of these six, or this document must be amended first.

### 1.4 What a Business Event is *not*

- It is **not** a ledger entry. A ledger entry (Posting) is derived from it, not equal to it.
- It is **not** editable. Reality doesn't change — record a correction as a new event (see §3.6).
- It is **not** allowed to store or imply a balance. Balances are always computed (see §3.2).

---

## 2. Chart of Accounts

### 2.1 The "positions only" decision

TripLedger v1 does **not** model trip-level expense categories, cash accounts, or bank accounts as ledger accounts. The only accounts in the system are **Member Accounts** — one per person, per trip.

This is a deliberate simplification: TripLedger tracks *relative financial position between people*, not *where the trip's money physically went*. Category (e.g. "Food," "Fuel") is stored as metadata on the Business Event for reporting, but it is never a posting target.

### 2.2 The full Chart of Accounts (v1)

```
Member Account (one per Member per Trip)
```

That's the entire chart. There is no Expense, Asset, Liability, Equity, or Revenue account. Every account is structurally identical: a running signed balance for one person in one trip.

### 2.3 Sign convention

> **Positive balance = this member should RECEIVE money.**
> **Negative balance = this member OWES money.**

This is the single most important convention in the system. Every posting rule (§3.4) and every UI element that shows a balance must respect it without exception. A member who "is owed $40" shows `+4000` (minor units). A member who "owes $40" shows `−4000`.

### 2.4 Why this isn't "real" double-entry, and why that's fine

Classical double-entry requires debit-column-total = credit-column-total across at least two named accounts of different types (Asset, Liability, etc.). TripLedger v1 has only one account *type* (Member Account), so the rule generalizes to:

> **For every Business Event, the signed amounts across all Postings it produces must sum to exactly zero.**

This is mathematically equivalent in spirit — money is conserved, nothing is created or destroyed — but expressed as an N-party zero-sum invariant instead of a two-column balance. This is the correct simplification for a "who owes whom" system, and it's easy to extend back to a full chart of accounts later (§5) if TripLedger ever needs to answer "where did the trip's money actually go," not just "who owes whom."

---

## 3. Ledger Rules

### 3.1 The Ledger is a single, unified, append-only journal

There is exactly one journal per Trip. It is not split by member. A "member's ledger" is a **filtered view**: all Postings where `memberId = X`, ordered by time. There is no separate storage per member and no synchronization step, because there is nothing to synchronize — it's one table, filtered.

### 3.2 Balances are always derived, never stored as truth

```
Balance(member) = SUM(Posting.amount) WHERE memberId = member
```

Any stored "balance" value (e.g. a `BalanceSnapshot` cache) is a **disposable projection**. It may be wrong, stale, or deleted without loss of information, because it can always be rebuilt from Postings. No code path may write to a balance field except a rebuild/cache job, and no code path may trust a cached balance without the ability to recompute and compare it.

### 3.3 History is immutable

- Postings are **never** updated or deleted once written.
- Business Events are **never** updated or deleted once written.
- Corrections happen by creating a **new** Business Event (`ADJUSTMENT`, or a proper `REFUND` when applicable) that produces new Postings offsetting the error. The erroneous event stays visible in history forever.

### 3.4 The zero-sum invariant is enforced, not assumed

> For every Business Event, `SUM(Posting.amount WHERE businessEventId = X) == 0`, checked at write time, before commit.

If a proposed set of postings does not sum to zero, the entire Business Event is rejected — no partial writes. This check must exist at the application layer at minimum, and should eventually also exist as a database-level constraint (trigger), so that "no mistakes" is enforced by the system rather than by careful coding.

**3.4.1 The check lives in exactly one place.** Every code path that creates a Business Event must funnel through a single shared write function (e.g. `saveEvent`) that performs the zero-sum check. Individual posting functions (shared expense, cash movement, refund, adjustment) compute postings; they never validate or persist independently. This prevents a new event type from being added later without the guard.

**3.4.2 Business Event creation and its Postings are one atomic transaction.** A Business Event row must never exist in the database without its corresponding Postings, even transiently. If the Posting computation or the zero-sum check fails for any reason, the Business Event write must roll back along with it — both writes succeed together or neither is committed.

### 3.5 Posting rules per event type

Given the sign convention in §2.3:

| Event | Rule | Notes |
|---|---|---|
| **Shared Expense** | For each payer: `posting = amountPaid − shareOwed`. For each non-paying participant: `posting = −shareOwed`. | Supports multiple payers; each payer's own share is netted against what they paid. |
| **Loan** | Lender: `+amount`. Borrower: `−amount`. | |
| **Repayment** | Cash payer: `+amount`. Cash receiver: `−amount`. | Mechanically identical to a Loan in reverse — no special-cased logic. |
| **Settlement** | Cash payer: `+amount`. Cash receiver: `−amount`. | Mechanically identical to Repayment. Distinguished from Repayment only by intent/metadata (settling up vs. explicitly reducing a named debt), never by posting logic. |
| **Refund** | Reverses postings of the original event (`refundOf`), scaled by `refundAmount / originalAmount`, sign-flipped. Never computed independently of the source event. | Must carry `refundOfId`. A refund with no valid `refundOfId` is invalid and must be rejected. |
| **Adjustment** | Free-form postings, entered directly. Must still satisfy §3.4. | Reserved for cases no other event type covers. Should be rare; frequent use of Adjustment signals a missing event type, not a normal workflow. |

**3.5.1 Repayment and Settlement share one implementation.** Because their posting rule is identical (cash payer `+amount`, cash receiver `−amount`), they must be implemented as a single generic "cash movement" function that takes the event type only as a label to store on the `BusinessEvent` row. If a posting-calculation function ever contains a branch like `if (type === 'REPAYMENT')`, that is a specification violation — the backend posting logic must be blind to the distinction. Only the UI (icons, labels, wording) may treat them differently.

### 3.6 Corrections never mutate; they append

If a Shared Expense was entered wrong (wrong amount, wrong participants), the fix is:
1. Leave the original Business Event and its Postings untouched.
2. Create a new event (`ADJUSTMENT`, or a full reversal followed by a corrected re-entry) whose postings net out the error.

The audit trail must always show both the mistake and the fix as separate, timestamped events. Silent correction is a violation of this document.

### 3.7 Debt simplification never touches the ledger

Any "A owes B, B owes C → suggest A pays C" simplification is a **read-model / reporting feature only**. It:
- Never creates, modifies, or deletes a Posting or Business Event.
- Is recomputed on demand from current balances.
- Is presented to users as a *suggestion* ("Suggested settlement: A → C, $50"), never recorded as if it already happened. It only becomes real once the user actually records a `SETTLEMENT` event for the suggested payment.

### 3.8 What the UI is never allowed to do

- The UI never constructs a Posting directly. It only ever submits a Business Event.
- The UI never displays or asks the user for "debit" / "credit" / "account" terminology. Users think in terms of "I paid," "I lent," "I got refunded" — the six event types in §1.3 — never in ledger terms.
- The Posting Engine is the only code path permitted to create a Posting.

**3.8.1 Data isolation at the function boundary.** The Posting Engine's input type must not include `category`, `notes`, or `attachments` — not even as optional fields. The API/controller layer is responsible for splitting an incoming request into (a) financial facts (amounts, payer/participant/member IDs) passed to the Posting Engine, and (b) metadata (category, notes, attachments) attached directly to the `BusinessEvent` row. If the Posting Engine's type signature makes `category` accessible at all, this rule is already being violated, regardless of whether the field is actually used.

### 3.9 Validation checklist (must hold at all times)

- [ ] Every Business Event has ≥1 Posting, and postings sum to exactly 0.
- [ ] Every Posting references exactly one valid Member and one valid Business Event.
- [ ] No Posting or Business Event row is ever updated after creation (append-only at the database level, ideally enforced with revoked UPDATE/DELETE privileges on those tables).
- [ ] Every `REFUND` event has a valid `refundOfId` pointing to a real prior event.
- [ ] A member's displayed balance always equals `SUM(Posting.amount)` for that member — any cached value must be reconcilable to this on demand.

**3.9.1 This checklist must map 1:1 to real, passing tests.** Each bullet above corresponds to a test in `tests/posting-engine.spec.ts`, written against the actual function signatures used in the codebase — not illustrative pseudocode. The "no update after creation" bullet must be enforced by a mechanism that actually runs (a database privilege revocation, an ORM-level guard, or a lint rule blocking `.update()`/`.delete()` calls against the Posting/BusinessEvent tables) rather than a comment asking a developer to remember. The accounting engine is not considered done until every bullet has a corresponding green test.

---

## 4. Explicit Non-Goals (v1)

To keep this specification honest about its own limits:

- **No multi-currency.** All amounts are in one currency, one unit of account, stored as integers in minor units (cents).
- **No wallet/cash/bank account modeling.** TripLedger doesn't know where money physically sits — only who owes whom.
- **No expense/category ledger accounts.** Category is metadata, not an account.
- **No partial-write states.** A Business Event's postings are created atomically or not at all.

---

## 5. Future Extension Path (non-binding)

If TripLedger later needs "where did the money actually go" (true trip-level accounting, not just positions), the Chart of Accounts would need to grow to include Expense, Asset, and possibly Equity accounts, and §2.4's simplified zero-sum rule would be replaced with a full debit-column = credit-column model. This document does not commit to that path — it exists only so that a future rewrite isn't surprised by the possibility.

---

## Guiding Principle

> A Business Event describes what happened.
> A Posting describes how it's recorded.
> A Balance describes where things stand.
> Only the first is ever entered by a human. The other two are always computed, never assumed.
