# Tailorite

**Every detail agreed. Every stitch understood.**

Tailorite helps independent tailors in Nigeria turn a customer's WhatsApp messages, reference pictures and voice notes into a clear brief — with every detail linked to where it came from — and get that exact version approved by the customer on their phone before cutting fabric. Later changes become new versions with a before/after comparison and the price and date difference; the customer approves those too. Deposits and payments are recorded, and the approved brief prints as a PDF.

This repository is the **API and worker**. The web app is in the sibling folder [`../tailorite-frontend`](../tailorite-frontend). Project documentation is in [`docs/`](docs).

## What works
- Sign-up, studio onboarding (₦, Africa/Lagos, inches or cm), customers with measurement profiles.
- Orders with pasted messages, image and audio uploads, and in-browser voice recording; private storage.
- Brief workbench: source-linked fields, optional AI suggestions (Gemini) that are never applied without review, conflicts shown side by side, questions, readiness checks.
- Immutable published versions, private expiring customer links, mobile approval with typed name and explicit confirmation, request changes / decline.
- Change requests from customer or studio, field-level comparison with price and date deltas, atomic activation.
- Manual payments with reversals, balance and credit due, production status, cancel/archive, full history.
- Print/PDF view, settings (studio, usage, AI and worker status), public demo sandboxes with synthetic data.

See [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md) for what is not done or not verified (notably: live Gemini calls and Docker have not been run).

## Prerequisites
- Node.js ≥ 24.7 and pnpm 10.34.6 (`corepack enable`).
- No Docker needed for local development: PostgreSQL runs from the `embedded-postgres` package, jobs use BullMQ's PostgreSQL backend, and files go to a private local folder.
- Optional: Docker (Compose with PostgreSQL, Redis and S3-compatible storage), a `GEMINI_API_KEY` for live AI.

## Set up and run locally
```bash
# 1. API + worker
cd tailorite-backend
pnpm install
cp .env.example .env          # set SESSION_SECRET (32+ random chars) and DEMO_OWNER_PASSWORD; GEMINI_API_KEY is optional
pnpm db:local                 # terminal 1 — PostgreSQL 18 on localhost:5432 (data in .local/postgres)
pnpm db:migrate               # apply migrations
pnpm dev                      # terminal 2 — API on http://localhost:4000
pnpm dev:worker               # terminal 3 — extraction worker

# 2. Web app
cd ../tailorite-frontend
pnpm install
cp .env.example .env.local
pnpm dev                      # terminal 4 — http://localhost:3000
```
Or start all four from `tailorite-backend` with `pnpm dev:all`.

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Without `GEMINI_API_KEY` the app runs in manual mode ("AI extraction is not configured"); set `AI_MODE=fixture` to use the labelled example results for the synthetic demo order.

### With Docker for the infrastructure
```bash
docker compose up -d postgres redis storage
```
Then in `.env`: `DATABASE_URL=postgresql://tailorite:tailorite-local@localhost:5432/tailorite`, `JOB_QUEUE_BACKEND=redis`, `STORAGE_DRIVER=s3`, `S3_ENDPOINT=http://localhost:9000`, `S3_ACCESS_KEY_ID=tailorite-local`, `S3_SECRET_ACCESS_KEY=tailorite-local-secret`. The whole stack in containers behind one origin: see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Demo data
```bash
pnpm build && pnpm demo:seed
```
Creates or resets **only** the flagged synthetic studio "Amina Atelier" with Ada Okafor's navy dress order (message, voice note, reference picture, sleeve conflict) and five other orders in different states. Sign in at http://localhost:3000/login as `demo@tailorite.local` with your `DEMO_OWNER_PASSWORD`. It refuses to run in production unless `ALLOW_DEMO_SEED=true`, and never touches real studios. Visitors can also click **Explore demo** for a private, temporary sandbox. The five-minute walkthrough is in [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md).

## Build and production start
```bash
# API + worker
pnpm build                    # prisma generate + nest build → dist/
pnpm db:migrate
pnpm start                    # node dist/main.js
pnpm start:worker             # node dist/worker.js

# Web app (API_INTERNAL_URL is fixed at build time)
cd ../tailorite-frontend
pnpm build
pnpm start                    # standalone server on PORT (default 3000)
```

## Tests and checks
| Where | Command | What |
| --- | --- | --- |
| backend | `pnpm test` | Integration and unit tests against a real, throwaway PostgreSQL (started automatically). |
| backend | `pnpm lint` · `pnpm typecheck` | oxlint (type-aware) · TypeScript |
| web | `pnpm lint` · `pnpm typecheck` | ESLint · TypeScript |
| web | `pnpm contracts:check` | Shared contracts copy is up to date (`pnpm contracts:sync` to refresh). |
| web | `pnpm test:e2e` | Six Playwright journeys against an isolated stack (API/worker on :4100 with a fresh `<db>_e2e` database and a fake AI provider; production web build on :3100). Needs the local PostgreSQL running. Note: it rebuilds the web app for the test API, so run `pnpm build` again before `pnpm start`. |

Latest results: [`docs/TEST-RESULTS.md`](docs/TEST-RESULTS.md).

## Documentation
[Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA-MODEL.md) · [AI](docs/AI.md) · [API](docs/API.md) · [Security](docs/SECURITY.md) · [Business](docs/BUSINESS.md) · [Scalability](docs/SCALABILITY.md) · [Deployment](docs/DEPLOYMENT.md) · [Demo script](docs/DEMO-SCRIPT.md) · [Test results](docs/TEST-RESULTS.md) · [Known limitations](docs/KNOWN-LIMITATIONS.md) · [Decisions](docs/DECISIONS.md) · [Progress](PROGRESS.md)
