# Release Checklist

Run through every item before a production release. Anything unchecked is a
blocker. Companion to `DEPLOYMENT.md` (runbook) and `PRODUCTION_HARDENING.md`
(the work this checklist verifies).

> **Status for the v1.0.0 release:** **DEPLOYED to production, verified live**
> on 2026-08-03:
> - SPA: https://tally-spa.vercel.app — API: https://tally-api-f95d.onrender.com
> - Neon DB migrated; restricted `app_runtime` role (`SELECT/INSERT/UPDATE/
>   DELETE` + sequence usage, future tables auto-granted via default ACLs)
> - Full pipeline green on `main`: migrations → API deploy → SPA deploy →
>   live smoke test (register → trip → expense → balances)
> - Sentry is **deliberately omitted** (no DSNs set anywhere) — §4 items are
>   skipped; add later if desired.
> - Remaining unchecked items are: manual browser QA (§6) and the Neon
>   backup/restore-drill item (§2) — task automation cannot do these.

## 1. Configuration & secrets

- [x] `backend/.env.example` is the source of truth and matches what is set in
      Render; `frontend/.env.example` matches Vercel.
- [x] `JWT_SECRET` set in Render (64-char), no fallback anywhere in `src/`,
      **≥ 32 characters**, never committed, generated fresh for this release.
- [x] `DATABASE_URL` in Render is the Neon **pooled** URL with the restricted
      `app_runtime` role (not the owner).
- [x] `CORS_ORIGINS` / `FRONTEND_URL` in Render match the SPA origin exactly
      (`https://tally-spa.vercel.app`).
- [x] `NODE_ENV=production` in Render; the Docker image sets it too.
- [x] `VITE_API_URL` left unset on Vercel (same-origin `/api` proxy).
- [x] Boot-refusal verified: `node dist/main` with `JWT_SECRET=` exits non-zero
      (CI enforces this too).

## 2. Database

- [x] `prisma migrate deploy` applied; `prisma migrate status` is clean.
- [x] Production DB runs the invariant migration (zero-sum / ≥1-posting /
      refund-reference triggers, append-only revokes) — verified via
      `prisma migrate deploy` output and live ledger zero-sum.
- [ ] Backups: Neon PITR enabled, latest weekly snapshot branch exists, last
      restore drill ≤ 3 months old (see `DEPLOYMENT.md` → Backups).

## 3. API health & security

- [x] `GET /health` → 200 and `GET /health/ready` → 200 (DB reachable).
- [x] Rate limits active: `POST /auth/login` throttled (5/min, verified in
      local prod boot + headers on live API).
- [x] CORS allowlist correct: SPA origin accepted on the live API.
- [x] Helmet headers present on responses; no `X-Powered-By`.
- [x] Duplicate email registration → 409 (not 500); invalid trip id → 404
      with the standardized error shape (e2e suite).
- [x] 5xx responses return the masked body in production (no internal details).

## 4. Error reporting (Sentry)

- [x] `SENTRY_DSN` deliberately omitted (no DSNs configured) — remaining
      Sentry items skipped for v1.0.0.
- [x] `VITE_SENTRY_DSN` deliberately omitted; the SPA ships without Sentry.
- [ ] Test error fires: trigger a 500 (or frontend render error) in the
      deployed environment and confirm the event appears in the Sentry
      project for the right environment tag (`production`).

## 5. Testing

- [x] CI green on `main`: `pnpm lint`, `pnpm test` (posting engine +
      integration + e2e), `pnpm --filter frontend build`, `pnpm --filter
      frontend test`, `pnpm --filter frontend check:bundle`.
- [x] Bundle budgets met (H9): initial gzip ≤ 160 kB hard fail, total raw JS
      ≤ 700 kB hard fail. (v1.0.0 measured: 103.9 kB gzip initial, 472 kB raw.)
- [x] `pnpm --filter frontend test:coverage` meets the thresholds in
      `vitest.config.ts`.
- [x] `pnpm audit --prod` reports no known vulnerabilities (react-router
      upgraded to 8.3.0 for GHSA-qwww-vcr4-c8h2).

## 6. Manual QA journey (Phase 9 of DEVELOPMENT_TIMELINE.md)

On the **live** deployment, in a fresh browser profile:

- [ ] Register → logout → login (case-insensitive email) → stays logged in.
- [ ] Create a trip → add a second member by email.
- [ ] Record: shared expense (EQUAL split), loan, repayment, refund, cash
      movement, adjustment.
- [ ] Verify balances/ledger reflect every entry (debit = credit); a recorded
      settlement appears in the ledger.
- [ ] Refresh flow: wait past access-token expiry (or shorten
      `JWT_EXPIRES_IN` in dev) → the app silently refreshes and continues
      without logging out.
- [ ] Logout revokes the refresh token: logging in again works; refreshing
      with a stale token → 401.
- [ ] Error states: kill the backend → every page shows an error card with a
      working Retry (never "No X yet"); restore backend → retry recovers.
- [ ] Responsive: mobile layout (off-canvas sidebar, bottom-sheet modals),
      keyboard walkthrough of a modal (focus trap, Escape, focus restore).
- [ ] axe scan (devtools or `@axe-core/cli`) on login + trips + dashboard:
      0 critical/serious violations.
- [ ] Reduced-motion: with the OS setting enabled, page/modals don't animate.

## 7. Release

- [x] `DEPLOYMENT.md` matches the actual topology (URLs, service names).
- [x] Rollback plan known: Render → previous deploy; Vercel → Promote
      previous; DB → PITR restore branch (never roll the DB back before the
      code).
- [x] Tag the release: `git tag v1.0.0 && git push origin v1.0.0`.
- [x] Deploy via the CI/CD pipeline (push to `main` or workflow dispatch) —
      not manually.
- [x] Post-deploy: `/health` green, live smoke journey in the deploy log
      passed (register → trip → expense → balances).
- [x] Live stock verified independently: register → trip → expense → balances
      through the SPA proxy (`https://tally-spa.vercel.app/api`).

---

### Quick commands

```bash
pnpm lint
pnpm test                                  # backend: posting engine + integration + e2e
pnpm --filter frontend test                # frontend unit + a11y suites
pnpm --filter frontend build
pnpm --filter frontend check:bundle
pnpm --filter backend exec prisma migrate status
```
