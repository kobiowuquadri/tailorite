# Tailorite — build progress

Resume point for any new session: read this file, then `docs/DECISIONS.md`, then check
`git log` in both `tailorite-backend` and `tailorite-frontend`.

## Current status

- **Current phase:** Phase 0 — inspect and establish the project (in progress)
- **Last updated:** 2026-10-13

## Environment facts (inspected 2026-10-13)

| Item | Finding |
| --- | --- |
| OS / shell | Windows 11, Git Bash + PowerShell |
| Node / pnpm | Node 24.16.0, pnpm 10.34.6 |
| Docker / WSL | Not installed — Docker Compose files are written but cannot be run on this machine |
| PostgreSQL | Not installed — local development uses `embedded-postgres` (real PostgreSQL binaries from npm) |
| Redis | Not installed — BullMQ 6 runs on its PostgreSQL backend locally; Redis backend in Compose/production |
| Object storage | No MinIO/S3 locally — private local-disk driver for development; S3-compatible driver for Compose/production |
| Gemini credentials | `GEMINI_API_KEY` not present — live AI smoke test blocked until a key is configured in `.env` |
| Git | Neither folder was a repository; both initialised during Phase 0 |

## Implementation checklist (priority order)

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified

### Phase 0 — Project establishment
- [~] Inspect environment and choose versions (`docs/DECISIONS.md`)
- [ ] Backend workspace: NestJS 12 (ESM), TypeScript 6, Prisma 7.10, env validation
- [ ] Frontend workspace: Next.js 16.4, Tailwind 4, shadcn/ui, TanStack Query
- [ ] Shared contracts (Zod) + frontend sync/check scripts
- [ ] Prisma schema + first migration on embedded PostgreSQL
- [ ] Health endpoints (live/ready) reflecting dependency readiness
- [ ] Docker Compose (PostgreSQL, Redis, MinIO) + `.env.example`
- **Gate:** web + API start, migration applies, health reflects readiness, env errors readable

### Phase 1 — Auth, tenant boundary, shell
- [ ] Register / login / logout / session (DB-backed, HttpOnly cookie)
- [ ] Onboarding creates studio + owner membership
- [ ] Tenant-scoped access helpers; CSRF/origin guard; rate limits
- [ ] Protected app shell + navigation
- [ ] Customers + measurement profiles
- [ ] Two-studio isolation tests
- **Gate:** register → studio → customer, refresh keeps data, no cross-studio access

### Phase 2 — Manual order + source-backed brief
- [ ] Orders (create/list/filter/paginate/search) + dashboard counts
- [ ] Source intake: text, images, audio, browser recording; private storage
- [ ] Brief workbench: fields, N/A, evidence links, revision-checked saves
- [ ] Required-field checks + clarification issues
- **Gate:** complete brief manually, leave, return, recover data + files

### Phase 3 — Versioned publication + customer approval
- [ ] Immutable snapshots with content hash
- [ ] Approval requests, hashed link tokens, fragment exchange, portal sessions
- [ ] Mobile portal: approve / request changes, all link states
- [ ] Print/PDF view (approved vs draft labelling)
- **Gate:** approval in a separate session freezes the exact version

### Phase 4 — Change management + money
- [ ] Change requests (customer + tailor), proposal drafting, comparison
- [ ] Revision approval transaction with stale-version protection
- [ ] Manual deposits / refunds / reversals, balances in kobo
- [ ] Production state machine + pending-change warnings
- **Gate:** V1 authoritative while V2 pending; V2 acceptance changes totals once

### Phase 5 — Real AI intake
- [ ] Gemini adapter (transcription + extraction, JSON schema output)
- [ ] Durable jobs (BullMQ), retries, recovery, polling
- [ ] Evidence validation, missing/conflict issues, late-result protection
- [ ] Live / manual / fixture modes
- **Gate:** real inputs → reviewable suggestions (requires `GEMINI_API_KEY`)

### Phase 6 — Polish + demo
- [ ] Landing page, settings, usage counts, copy
- [ ] Demo dataset (Amina Atelier / Ada Okafor) + isolated public demo
- [ ] Empty/loading/error states, responsive checks
- **Gate:** complete demo in browser at desktop + mobile sizes

### Phase 7 — Verification + handoff
- [ ] Integration tests, Playwright journeys, builds, lint, type checks
- [ ] Deployment configuration + docs
- **Gate:** teammate can set up from docs; verification record is honest

## Log

### 2026-10-13 — Phase 0 started
- Read `Tailorite-Claude-Build-Prompt.md`.
- Commands run: `node --version`, `pnpm --version`, `docker --version` (missing), `psql --version`
  (missing), `redis-server --version` (missing), `wsl --list` (not installed), npm registry
  version queries, NestJS 12 reference scaffold in scratchpad,
  `npx create-next-app@16.4.0 . --ts --tailwind --eslint --app --src-dir --use-pnpm`.
- Verified current APIs in official docs: Gemini models list + structured output + audio,
  Prisma 7 PostgreSQL quickstart, BullMQ 6 migration + PostgreSQL backend, Next.js 16.4 rewrites,
  `proxyClientMaxBodySize`, Cache Components, TanStack Query guide.

## Next action

Scaffold the backend (NestJS 12 ESM + Prisma 7.10) and write the Prisma schema.
