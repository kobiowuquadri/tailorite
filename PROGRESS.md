# Tailorite — build progress

Resume point for any new session: read this file, then `docs/DECISIONS.md`, then check
`git log` in both `tailorite-backend` and `tailorite-frontend`.

## Current status

- **Current phase:** Frontend for Phases 1–4 (backend for Phases 0–4 complete and tested)
- **Last updated:** 2026-10-13

## Environment facts (inspected 2026-10-13)

| Item | Finding |
| --- | --- |
| OS / shell | Windows 11, Git Bash + PowerShell |
| Node / pnpm | Node 24.16.0, pnpm 10.34.6 |
| Docker / WSL | Not installed — Docker Compose files are written but cannot be run on this machine |
| PostgreSQL | Not installed — local development uses `embedded-postgres` (real PostgreSQL 18 binaries from npm); cluster must be UTF-8 (script enforces it) |
| Redis | Not installed — BullMQ 6 runs on its PostgreSQL backend locally; Redis backend in Compose/production |
| Object storage | No MinIO/S3 locally — private local-disk driver for development; S3-compatible driver for Compose/production |
| Gemini credentials | `GEMINI_API_KEY` not present — live AI smoke test blocked until a key is configured in `.env` |
| Git | Both folders initialised as repositories during Phase 0 (local only, nothing pushed) |

## Implementation checklist

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified

### Phase 0 — Project establishment
- [x] Environment inspected; versions chosen (`docs/DECISIONS.md` — to be written in Phase 7 from notes below)
- [x] Backend: NestJS 12 (ESM), TypeScript 6.0.3, Prisma 7.10 + adapter-pg, Zod env validation
- [x] Frontend scaffold: Next.js 16.4, Tailwind 4, shadcn/ui (radix-nova), TanStack Query, RHF + Zod
- [x] Shared contracts (`src/contracts`) + frontend `contracts:sync` / `contracts:check`
- [x] Prisma schema + 4 migrations (init, integrity triggers, worker heartbeat, source content deletion)
- [x] Health: `/api/health/live`, `/api/health/ready` (DB, storage, queue; AI reported)
- [ ] Docker Compose + Dockerfiles (Phase 7)
- **Gate:** API starts ✔, migrations apply ✔, readiness reflects dependencies ✔ (verified degraded→ok), readable env errors ✔

### Phase 1 — Auth, tenant boundary, shell
- [x] Register / login / logout / session (DB sessions, argon2id, HttpOnly SameSite=Lax cookie)
- [x] Onboarding creates studio + owner membership (NGN, Africa/Lagos, explicit unit)
- [x] CSRF/origin guard, rate limits (PostgreSQL fixed windows), tenant-derived studio id
- [x] Customers + measurement profiles
- [x] Two-studio isolation tests
- [ ] Protected app shell + screens (frontend)

### Phase 2 — Manual order + source-backed brief
- [x] Orders API (create/list/filter/paginate/search, dashboard counts, production, cancel, archive)
- [x] Source intake API (text, images, audio; content sniffing; private storage; ranges)
- [x] Brief API (revision-checked saves, readiness, issues, measurement snapshots, suggestions)
- [ ] Frontend: orders, intake (incl. browser recording), workbench

### Phase 3 — Versioned publication + customer approval
- [x] Immutable snapshots + content hash + DB triggers
- [x] Approval requests, hashed tokens, fragment exchange, path-scoped portal sessions
- [x] Approve / request changes / decline with concurrency control
- [ ] Frontend: share dialog, mobile portal, print view

### Phase 4 — Change management + money
- [x] Change requests (customer + studio), comparison, decline/withdraw
- [x] Manual payments, reversals, balances, credit due
- [x] Production state machine
- [ ] Frontend: change proposal UI, comparison, payments, production

### Phase 5 — Real AI intake — not started
### Phase 6 — Polish + demo — not started
### Phase 7 — Verification + handoff — not started

## Verification log

| Date | Command | Result |
| --- | --- | --- |
| 2026-10-13 | `node scripts/local-postgres.mjs` | Embedded PostgreSQL 18 started (UTF-8 after fixing WIN1252 default) |
| 2026-10-13 | `pnpm exec prisma migrate deploy` | 4 migrations applied |
| 2026-10-13 | `curl /api/health/ready` | 200 ok (database, local storage, BullMQ PostgreSQL backend); AI "Not configured" |
| 2026-10-13 | `pnpm exec tsc --noEmit` | clean |
| 2026-10-13 | `pnpm exec vitest run` | 3 files, 32 tests passed |

## Known issues / notes

- Prisma 7.10's query interpreter runs nested reads concurrently inside a transaction, which makes
  `pg@8` print a deprecation warning ("client.query() when the client is already executing").
  pg queues the queries correctly; this is upstream and does not affect results.
- Next.js `proxy.ts` would truncate request bodies over 10 MB, so the web app does not use it;
  `/api/*` is a plain rewrite (streams uploads).

## Next action

Build the web app screens: auth/onboarding, app shell, dashboard, customers, orders, intake +
recording, brief workbench, share dialog, customer portal, change proposals, payments, print.
