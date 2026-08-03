## Summary

<!-- One or two sentences. What does this change and why? -->

## Changes

- <!-- list of concrete changes -->

## Type

- [ ] `feat:` new functionality
- [ ] `fix:` bugfix
- [ ] `perf:` performance
- [ ] `test:`/`a11y:` quality gates
- [ ] `docs:`/`chore:`/`ci:`/`ops:` housekeeping

## TODO / follow-ups

<!-- Anything left as follow-up steps, if any. -->

## Test plan

- [ ] `pnpm lint`
- [ ] `pnpm --filter frontend test` (and `test:coverage` if behavior changed)
- [ ] `pnpm --filter backend` relevant suites (`pnpm test` if backend changed)
- [ ] `pnpm --filter frontend build` + `check:bundle` if frontend changed
- [ ] Notes on manual verification if applicable

## Deployment notes

- Any DB migration? (Migrations run with the owner connection in the deploy
  pipeline.)
- Any env var / secret change? (Update `backend/.env.example`, not a real
  `.env`.)
- Any behavior change that affects accounting invariants? If so, link the
  relevant `ACCOUNTING.md` rule.