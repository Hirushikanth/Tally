# Security Policy

## Reporting a vulnerability

Please report security issues privately — **do not open a public issue**.

- **Email/GitHub security advisory:** open a
  [private vulnerability report](https://github.com/Hirushikanth/Tally/security/advisories/new)
  on GitHub. Include:
  - affected endpoint / file / component,
  - a minimal reproduction, and
  - suspected impact.
- **Encrypted details are not required**, but if you send secrets or a PoC,
  prefer the private channel over email.

You can expect an initial reply within 3 business days and a fix strategy
shortly after.

## Reporting obligations

- Never put real credentials, tokens, or a populated `.env` in an issue, PR,
  log, or gist.
- When reporting a suspected leak, reference the exact repo and the advice
  above; secrets in the live environment are rotated, not cleaned in place.

## Supported / maintained

| Environment | Status |
|---|---|
| `main` (production) | Supported — releases are cut from here |

Production runs from `main`. Older tags are not patched individually.

## Preferred fix path

1. A private report → a fix on `main` → a patch release.
2. The patch ships through the same pipeline (CI → deploy) the rest of the
   releases do.

## Hardening context

For what the project does about attacks, see `PRODUCTION_HARDENING.md`
(Helmet/CORS/rate limiting/Prisma error mapping, refresh-token rotation,
DB-enforced financial invariants). For the invariants themselves, see
`ACCOUNTING.md`.