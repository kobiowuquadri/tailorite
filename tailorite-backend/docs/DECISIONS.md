# Decisions

Short records of choices that differ from the build prompt's defaults or that a teammate would otherwise have to rediscover. Newest last.

## D1 — Two sibling folders instead of a pnpm monorepo
The team asked for `tailorite-frontend` (web) and `tailorite-backend` (API + worker) as separate folders. Each is its own pnpm project with its own lockfile. Shared request/response contracts live in `tailorite-backend/src/contracts` (Zod + types, no other imports); the web app receives a generated copy with `pnpm contracts:sync`, and `pnpm build` in the web app fails if the copy is stale (`contracts:check`). Docker Compose lives in the backend folder and builds the web image from `../tailorite-frontend`.

## D2 — Versions
Node 24 (built-in `crypto.argon2`), NestJS 12 (pure ESM), TypeScript 6.0.3 (TypeScript 7 is not yet supported by the Nest CLI and typescript-eslint), Prisma 7.10 with the `prisma-client` generator and `@prisma/adapter-pg`, BullMQ 6, Next.js 16.4 with React 19.3, Tailwind 4, shadcn/ui (Radix), TanStack Query 5, React Hook Form + Zod 4, Vitest 5, Playwright 1.64.

## D3 — Local development without Docker
This machine has no Docker, PostgreSQL, Redis or MinIO. Instead of mocking them:
- PostgreSQL: `pnpm db:local` runs real PostgreSQL 18 binaries from the `embedded-postgres` package (UTF-8 cluster enforced; WIN1252 broke BullMQ's SQL). Start/stop goes through `pg_ctl` (`scripts/pg-control.mjs`) because the package's Windows shutdown left orphaned processes holding shared memory.
- Jobs: BullMQ's native PostgreSQL backend (`JOB_QUEUE_BACKEND=postgres`). Compose and production use Redis (`JOB_QUEUE_BACKEND=redis`). Same code path otherwise.
- Files: a private local-disk driver (`STORAGE_DRIVER=local`). Compose/production use any S3-compatible bucket.
Docker Compose files are provided but were not executed on this machine.

## D4 — PostgreSQL is the source of truth for jobs
Every extraction is an `ExtractionJob` row with status, attempts, lease and next-attempt time. The queue only carries the job id. A recovery sweep in the worker re-dispatches due jobs and expires stale leases, so losing a queue message (or Redis) delays a job but never loses it.

## D5 — Same-origin API through Next.js rewrites, not `proxy.ts`
The browser always calls `/api/*` on the web origin, so cookies are first-party and SameSite works without CORS. In development a `beforeFiles` rewrite forwards to `API_INTERNAL_URL`. `proxy.ts` was rejected because it buffers request bodies and truncates them above 10 MB (voice notes go up to 25 MB). In production Caddy routes `/api/*` straight to the API.

## D6 — Signed-in screens render in the browser
Studio, print and review screens load private data from the authorized API after sign-in, so they sit behind a `use(browser())` boundary (`components/browser-only.tsx`). The public landing page is static. Because these private areas intentionally wait for API data, Next's instant-navigation validation is set to `manual-warning` and the private layouts declare `instant = false`.

## D7 — Customer access by link possession
Approval links are `/review/{accessId}#{token}`: a 256-bit random token in the URL fragment (never sent to servers or in Referer headers), stored only as a SHA-256 hash. The page exchanges it once for a short, HMAC-signed, path-scoped cookie and removes it from the address bar. Typed names are recorded as self-reported, never as verified identity.

## D8 — Immutable agreement versions
Publishing writes a `BriefVersion` with a canonical-JSON SHA-256 `contentHash` and a complete customer-facing snapshot. Database triggers reject UPDATE on versions, approval events, payments, transcripts, results and audit events, and reject DELETE except inside the demo purge (`tailorite.purge` setting). Customers approve a specific hash; a mismatch is rejected.

## D9 — AI model and modes
Default model `gemini-3.8-flash` for extraction and transcription, taken from Google's Gemini API models page on 2026-10-13 (listed as stable and recommended for new projects). It is configurable (`GEMINI_EXTRACTION_MODEL`, `GEMINI_TRANSCRIPTION_MODEL`). A live call has not been made yet because no `GEMINI_API_KEY` is configured. Modes: `live`, `fixture` (prepared results for the synthetic demo sources only, always labelled "Example results"), `off` (manual mode). A deterministic fake provider exists for automated tests only (`NODE_ENV=test` and `AI_TEST_FAKE=true`).

## D10 — Money in integer kobo
All amounts are integer kobo (`BigInt` in PostgreSQL). `balanceDue = max(0, agreedTotal − netRecorded)` and any excess is shown separately as credit/refund due; nothing is silently clamped away. Corrections are reversal entries.

## D11 — Storage image for Compose
MinIO stopped publishing community Docker images in October 2025. Compose uses Chainguard's free MinIO build (`cgr.dev/chainguard/minio`) as a drop-in; any S3-compatible service works through `S3_ENDPOINT`. The API creates the private bucket when `S3_CREATE_BUCKET=true` (default outside production), so no shell-based init container is needed.

## D12 — Browser tests run against an isolated stack
`pnpm test:e2e` (web folder) starts the API and worker on :4100 against a freshly recreated `<db>_e2e` database with the fake AI provider, and a production build of the web app on :3100. The script refuses to reset any database whose name does not end in `_e2e`.

## D13 — Job-table polling for small hosted databases
The production database (Clever Cloud PostgreSQL DEV plan) allows 5 connections for the role. BullMQ's PostgreSQL backend needs its own pools and Redis would be another service, so `JOB_QUEUE_BACKEND=database` was added: the worker polls `ExtractionJob` for due rows every `JOB_POLL_INTERVAL_MS` and claims each with the same status-conditioned update as before. API + worker then use 3–4 connections with `DATABASE_POOL_MAX=2` (measured). Trade-off: up to 2 s before a run starts.

## D14 — Hosting add-on variables as fallbacks
On Clever Cloud, linked add-ons inject `POSTGRESQL_ADDON_URI` and `CELLAR_ADDON_*`. When Tailorite's own variables are empty the API uses those (database over TLS with `sslmode=require&uselibpqcompat=true`; Cellar host prefixed with `https://`). Explicit `DATABASE_URL` / `S3_*` always win. The S3 client only sends checksums when an operation requires them, because Cellar and other S3-compatible services reject the newer defaults.

## D15 — TLS to the hosted database without certificate verification
Clever Cloud presents a self-signed certificate, so `sslmode=require` (libpq semantics) is used: traffic is encrypted but the server certificate is not verified. Verifying it would need the provider's CA certificate (`sslrootcert`).

## D16 — Zero-cost deployment
No hosting budget. The free combination is Vercel (web), one Render free web service (API with the worker in the same process via `WORKER_IN_API=true`; Render has no free background workers), the existing Clever Cloud DEV PostgreSQL, Backblaze B2 for files (10 GB free, no card) and the Gemini free tier. Koyeb was rejected because it now requires a card; Render's free PostgreSQL expires after 30 days, so it is not used. `render.yaml` at the repository root describes the Render service.
