# Tailorite — web app

Next.js 16 (App Router) front end for Tailorite: landing page, studio app, customer review page and print views. The API, worker, documentation and Docker setup are in the sibling folder [`../tailorite-backend`](../tailorite-backend) — start with its [README](../tailorite-backend/README.md).

## Run
```bash
pnpm install
cp .env.example .env.local     # API_INTERNAL_URL=http://localhost:4000 (server-only)
pnpm dev                       # http://localhost:3000 — needs the API running (see the backend README)
```
The browser only ever calls `/api/*` on this origin; Next.js forwards it to `API_INTERNAL_URL`, so session cookies stay first-party.

## Scripts
| Command | What |
| --- | --- |
| `pnpm dev` | Development server. |
| `pnpm build` · `pnpm start` | Checks the shared contracts, builds the standalone app, serves it on `PORT` (default 3000). `API_INTERNAL_URL` is fixed at build time. |
| `pnpm lint` · `pnpm typecheck` | ESLint · TypeScript. |
| `pnpm contracts:sync` · `pnpm contracts:check` | Copy / verify the shared contracts from `../tailorite-backend/src/contracts` into `src/contracts` (generated — do not edit). |
| `pnpm test:e2e` | Playwright journeys against an isolated stack started by `playwright.config.ts` (API + worker on :4100 with a fresh `_e2e` database and a deterministic fake AI provider; this app built and served on :3100). Requires the backend's local PostgreSQL (`pnpm db:local`). `E2E_SKIP_BUILD=1` reuses existing builds. |

## Layout
- `src/app` — routes: `/` (landing), `/demo`, `(auth)` sign-in/up and onboarding, `(app)` studio screens, `/review/[accessId]` customer page, `/print/...` printable briefs.
- `src/components` — UI (`ui/` is shadcn/ui), `workbench/`, `order/`, `portal/`, `brief/`, `print/`.
- `src/lib` — API client, TanStack Query keys, formatting, customer-link handling.
- `e2e/` — browser tests.
