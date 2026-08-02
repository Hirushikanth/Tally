# Release Checklist

Run through every item before a production release. Anything unchecked is a
blocker. Companion to `DEPLOYMENT.md` (runbook) and `PRODUCTION_HARDENING.md`
(the work this checklist verifies).

## 1. Configuration & secrets

- [ ] `backend/.env.example` is the source of truth and matches what is set in
      Render; `frontend/.env.example` matches Vercel.
- [ ] `JWT_SECRET` set in Render, no fallback anywhere in `src/`,
      **≥ 32 characters** (`openssl rand -base64 48`), never committed, rotated
      since the last release if the value predates H1.
- [ ] `DATABASE_URL` in Render is the Neon **pooled** URL with the restricted
      `app_runtime` role (not the owner).
- [ ] `CORS_ORIGINS` / `FRONTEND_URL` in Render match the SPA origin exactly.
- [ ] `NODE_ENV=production` in Render; the Docker image sets it too.
- [ ] `VITE_API_URL` left unset on Vercel (same-origin `/api` proxy).
- [ ] Boot-refusal verified: `node dist/main` with `JWT_SECRET=` exits non-zero
      (CI enforces this too).

## 2. Database

- [ ] `prisma migrate deploy` applied; `prisma migrate status` is clean.
- [ ] Production DB runs the invariant migration (zero-sum / ≥1-posting /
      refund-reference triggers, append-only revokes) — verify via
      `prisma migrate status` and the audit in `ACCOUNTING.md`.
- [ ] Backups: Neon PITR enabled, latest weekly snapshot branch exists, last
      restore drill ≤ 3 months old (see `DEPLOYMENT.md` → Backups).

## 3. API health & security

- [ ] `GET /health` → 200 and `GET /health/ready` → 200 (DB reachable).
- [ ] Rate limits active: 6 rapid `POST /auth/login` attempts → 429.
- [ ] CORS allowlist correct: a request from a non-allowlisted origin is
      rejected.
- [ ] Helmet headers present on responses; no `X-Powered-By`.
- [ ] Duplicate email registration → 409 (not 500); invalid trip id → 404
      with the standardized error shape.
- [ ] 5xx responses return the masked body in production (no internal details).

## 4. Error reporting (Sentry)

- [ ] `SENTRY_DSN` set in Render (or deliberately omitted — then skip the
      remaining Sentry items).
- [ ] `VITE_SENTRY_DSN` set in the Vercel **Production** env (build-time) and
      the SPA redeployed (or deliberately omitted).
- [ ] Test error fires: trigger a 500 (or frontend render error) in the
      deployed environment and confirm the event appears in the Sentry
      project for the right environment tag (`production`).

## 5. Testing

- [ ] CI green on `main`: `pnpm lint`, `pnpm test` (posting engine +
      integration + e2e), `pnpm --filter frontend build`, `pnpm --filter
      frontend test`, `pnpm --filter frontend check:bundle`.
- [ ] Bundle budgets met (H9): initial gzip ≤ 160 kB hard fail, total raw JS
      ≤ 700 kB hard fail.
- [ ] `pnpm --filter frontend test:coverage` meets the thresholds in
      `vitest.config.ts`.

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

- [ ] `DEPLOYMENT.md` matches the actual topology (URLs, service names).
- [ ] Rollback plan known: Render → previous deploy; Vercel → Promote
      previous; DB → PITR restore branch (never roll the DB back before the
      code).
- [ ] Tag the release: `git tag vX.Y.Z && git push origin vX.Y.Z`.
- [ ] Deploy via the CI/CD pipeline (push to `main` or workflow dispatch) —
      not manually.
- [ ] Post-deploy: `/health` green, live smoke journey in the deploy log
      passed (register → trip → expense → balances).

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
