# Tailorite — build progress

Resume point for any new session: read this file, then `docs/DECISIONS.md`, then `git log` in both
`tailorite-backend` and `tailorite-frontend` (both are local git repositories; nothing has been pushed).

## Current status

- **Current phase:** Phase 7 complete except items blocked by the environment (see Blockers).
- **Last updated:** 2026-10-14

## Environment facts (inspected 2026-10-13)

| Item | Finding |
| --- | --- |
| OS / shell | Windows 11, Git Bash + PowerShell |
| Node / pnpm | Node 24.16.0, pnpm 10.34.6 |
| Docker / WSL | Not installed — Compose files and Dockerfiles are written but have not been run |
| PostgreSQL | Not installed — local development uses `embedded-postgres` (PostgreSQL 18 binaries); cluster must be UTF-8 |
| Redis | Not installed — BullMQ runs on its PostgreSQL backend locally; Redis in Compose/production |
| Object storage | Private local-disk driver locally; S3-compatible (Chainguard MinIO) in Compose |
| Gemini credentials | `GEMINI_API_KEY` not set — live AI smoke test blocked |
| Git | `tailorite-backend` and `tailorite-frontend` are separate local repositories |

## Phases

| Phase | Status | Verified by |
| --- | --- | --- |
| 0 — Project establishment | done (Docker files written, not run) | health checks, migrations, env validation |
| 1 — Auth, tenancy, shell | done | `auth-and-tenancy` tests, browser journey 1 |
| 2 — Manual order + source-backed brief | done | `orders-sources-brief` tests, journeys 1 and 4 |
| 3 — Versions + customer approval | done | `approvals-and-changes` tests, journeys 1, 3, 5 |
| 4 — Changes + money + production | done | `approvals-and-changes` tests, journeys 2 and 3 |
| 5 — AI intake and review | done; live provider not verified (no key) | `ai-pipeline`, `evidence-and-normalize`, `demo` tests, journeys 4 and 6, fixture walkthrough |
| 6 — Polish + demo | done | manual browser walkthrough (desktop + phone emulation), presenter seed |
| 7 — Verification + handoff | done except Docker run, deployment and live AI | `docs/TEST-RESULTS.md` |

Latest results: backend 50 tests passed, lint 0 findings, typecheck clean; web lint/typecheck clean; 6/6 Playwright journeys passed.

## Blockers (need the team)

1. **Live AI:** set `GEMINI_API_KEY` in `tailorite-backend/.env` (variable name only — never paste the key into committed files), restart API and worker, run "Draft the brief with AI" on the demo order, and record the result in `docs/TEST-RESULTS.md`.
2. **Docker / deployment:** run `docker compose --env-file deploy/compose.env --profile app up -d --build` on a machine with Docker and follow `docs/DEPLOYMENT.md`. No deployment URL exists yet.
3. **Demo media:** the synthetic voice note was generated with Windows text-to-speech (`pnpm demo:assets`); a human-recorded synthetic voice note would make the live transcription demo more realistic.

## Known issues / notes

- Prisma 7.10's query interpreter runs nested reads concurrently inside a transaction, which makes `pg@8` print a deprecation warning ("client.query() when the client is already executing"). pg queues the queries correctly; this is upstream and does not affect results.
- Next.js `proxy.ts` would truncate request bodies over 10 MB, so the web app does not use it; `/api/*` is a plain rewrite (streams uploads).
- `pnpm test:e2e` rebuilds the web app against the test API (:4100). Run `pnpm build` again before using `pnpm start` locally.
- Instant-navigation validation is limited to segments that opt in (`instantInsights.validationLevel: 'manual-warning'`) because studio, print and review screens render in the browser by design.

## Next action

Resolve the blockers above, then run the five-minute demo from `docs/DEMO-SCRIPT.md` with live AI and record it.
