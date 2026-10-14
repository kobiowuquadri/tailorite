# Deployment

**Status:** not deployed yet. The production database (Clever Cloud PostgreSQL) exists and all migrations were applied to it on 2026-10-14; the API and worker were run locally against it with the settings below (`/api/health/ready` ok, 3 connections in use). The apps themselves are not deployed and there is no public URL.

## Path A (current target): Clever Cloud

Two Node.js applications deployed from the same git repository (one folder each), plus two add-ons:

| Clever Cloud resource | What it runs |
| --- | --- |
| PostgreSQL add-on (exists) | All data. DEV plan: **5 connections** for the role, PostgreSQL 15, self-signed TLS certificate. |
| Cellar add-on (S3-compatible) | Customer images and voice notes (private bucket). |
| Node.js app `tailorite-api` | API (`dist/main.js`) and, in the same instance, the worker (`dist/worker.js`). |
| Node.js app `tailorite-web` | Next.js web app; forwards `/api/*` to the API, so the browser only ever talks to the web origin. |

### 1. Storage (Cellar)
1. Console → **Create** → **an add-on** → **Cellar S3 storage**, then link it to `tailorite-api`.
2. In the add-on dashboard, create a bucket (lowercase, no underscores; names are global), e.g. `tailorite-media-<something-unique>`. Leave it private — the API serves files only after checking who is asking.
3. Linking injects `CELLAR_ADDON_HOST`, `CELLAR_ADDON_KEY_ID` and `CELLAR_ADDON_KEY_SECRET`; the API uses them as `S3_ENDPOINT` and credentials automatically.

### 2. API app (`tailorite-api`)
Create a **Node.js** application from the repository, instance size at least 1 GB RAM (API + worker + image processing), and link both add-ons. Environment variables:

| Variable | Value |
| --- | --- |
| `APP_FOLDER` | `tailorite-backend` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` (Clever Cloud routes traffic to 8080) |
| `CC_NODE_DEV_DEPENDENCIES` | `install` (the build needs the Nest and Prisma CLIs) |
| `CC_POST_BUILD_HOOK` | `pnpm build` |
| `CC_PRE_RUN_HOOK` | `pnpm db:migrate` (applies new migrations before each start) |
| `CC_RUN_COMMAND` | `node --enable-source-maps dist/main.js` |
| `CC_WORKER_COMMAND` | `node --enable-source-maps dist/worker.js` |
| `CC_WORKER_RESTART` | `always` |
| `CC_HEALTH_CHECK_PATH` | `/api/health/live` |
| `APP_ORIGIN` | the **web** app's URL, e.g. `https://tailorite.cleverapps.io` |
| `SESSION_SECRET` | 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`) |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` (requests arrive through Clever Cloud's load balancers and the web app; see SECURITY.md) |
| `DATABASE_POOL_MAX` | `2` — with the worker this uses 3–4 of the 5 allowed connections |
| `JOB_QUEUE_BACKEND` | `database` (no Redis; the worker polls the job table and opens no extra connections) |
| `WORKER_CONCURRENCY` | `1` |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | the bucket from step 1 |
| `S3_REGION` | `default` (what Cellar expects) |
| `AI_MODE` / `GEMINI_API_KEY` | `live` and your key from Google AI Studio — or `off` (manual) / `fixture` (labelled demo examples) |
| `DEMO_SANDBOX_ENABLED` | `true` for the public "Explore demo" button |

`DATABASE_URL` is optional when the PostgreSQL add-on is linked: the API then uses `POSTGRESQL_ADDON_URI` with `sslmode=require&uselibpqcompat=true` (encrypted; Clever Cloud's certificate is self-signed so it is not verified). Set `DATABASE_URL` explicitly only to use another database.

### 3. Web app (`tailorite-web`)
Create a second **Node.js** application from the same repository. If the build runs out of memory, give it a larger build instance in the app's settings.

| Variable | Value |
| --- | --- |
| `APP_FOLDER` | `tailorite-frontend` |
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `CC_NODE_DEV_DEPENDENCIES` | `install` |
| `CC_POST_BUILD_HOOK` | `pnpm build` (also checks that the shared contracts match `../tailorite-backend`) |
| `CC_RUN_COMMAND` | `pnpm start` |
| `API_INTERNAL_URL` | the API app's URL, e.g. `https://tailorite-api.cleverapps.io` — fixed at build time, so redeploy the web app after changing it |

Give each app a domain under **Domain names** (free `*.cleverapps.io` names work). The web app's address is the product URL and must equal the API's `APP_ORIGIN`.

### 4. Verify
1. `https://<api domain>/api/health/ready` → `"status":"ok"` with database, storage (s3) and queue ("Job table polling").
2. Open the web URL, sign up, create an order, upload a picture (checks Cellar), share it and approve from a phone.
3. Settings → AI availability shows "Background worker is running".

### 5. Optional: presenter demo studio
The seed uploads demo media, so it must run with the production database **and** Cellar settings. From a machine with the repository: put `DATABASE_URL`, `STORAGE_DRIVER=s3`, `S3_ENDPOINT=https://cellar-c2.services.clever-cloud.com`, `S3_BUCKET`, `S3_REGION=default`, the Cellar keys, `NODE_ENV=production`, `ALLOW_DEMO_SEED=true`, a `SESSION_SECRET` and `DEMO_OWNER_PASSWORD` in `tailorite-backend/.env.production` (never commit it), then `pnpm build && node --env-file=.env.production dist/cli/demo-seed.js`. It only creates or resets the flagged "Amina Atelier" studio.

### Notes for this plan
- The 5-connection limit is tight: while Clever Cloud swaps an old instance for a new one, both may briefly hold connections and some requests can fail with "too many connections". A larger PostgreSQL plan removes this.
- Polling adds up to `JOB_POLL_INTERVAL_MS` (2 s) before an AI run starts.

## Path B: one Linux VM with Docker Compose and Caddy

Not built or run yet (no Docker on the development machine). Everything runs on one host behind Caddy, which serves the web app and routes `/api/*` to the API on the same origin (first-party cookies, no CORS) and obtains HTTPS certificates automatically.

```
Internet → Caddy :443 ─┬─ /api/* → api:4000 (NestJS)
                       └─ /*     → web:3000 (Next.js standalone)
worker (same image as api) ── PostgreSQL 18 · Redis 8 · S3-compatible storage
```

### 1. Prepare the host
- A Linux VM with Docker Engine and the Compose plugin, 2 vCPU / 4 GB RAM to start.
- A DNS `A` record for your domain pointing at the VM; ports 80 and 443 open.
- Clone both folders side by side: `tailorite-backend/` and `tailorite-frontend/`.

### 2. Configure
```bash
cd tailorite-backend
cp deploy/compose.env.example deploy/compose.env
```
Edit `deploy/compose.env` (never commit it):
- `SITE_ADDRESS=your.domain`, `PUBLIC_ORIGIN=https://your.domain`, `PROXY_PORT=80`, `PROXY_TLS_PORT=443`, `COOKIE_SECURE=true`.
- Generate `POSTGRES_PASSWORD`, `SESSION_SECRET`, `S3_SECRET_ACCESS_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
- AI: `AI_MODE=live` and `GEMINI_API_KEY`, or `AI_MODE=off` for manual mode.

To use managed services instead of the bundled containers, point `DATABASE_URL`, `REDIS_URL` and `S3_*` in `docker-compose.yml`'s `x-app-env` at them and drop the corresponding services. Keep the bucket private.

### 3. Build and start
```bash
docker compose --env-file deploy/compose.env --profile app up -d --build
```
Start order is enforced by health checks: PostgreSQL → `migrate` (runs `prisma migrate deploy` and exits) → API (healthy on `/api/health/live`) → worker and web → Caddy.

### 4. Verify
```bash
curl -fsS https://your.domain/api/health/ready      # {"status":"ok", ... database, storage, queue}
docker compose --env-file deploy/compose.env logs -f api worker
```
Then in a browser: sign up, create a customer and an order, share it, open the link on a phone, approve. Settings → AI availability should say the background worker is running.

### 5. Optional synthetic demo
Public demo sandboxes are on by default (`DEMO_SANDBOX_ENABLED=true`). For the presenter studio "Amina Atelier", set `ALLOW_DEMO_SEED=true` and a `DEMO_OWNER_PASSWORD` in `deploy/compose.env`, then:
```bash
docker compose --env-file deploy/compose.env run --rm api node dist/cli/demo-seed.js
```
It only creates or resets the flagged demo studio. Set `ALLOW_DEMO_SEED=false` again afterwards.

## Migrations
- Forward-only Prisma migrations in `prisma/migrations`, applied by the `migrate` service on every `up`. They are additive so far; the integrity-guard migration installs triggers and CHECK constraints.
- Manual run: `docker compose --env-file deploy/compose.env run --rm migrate`.

## Health checks
- `GET /api/health/live` — process up (used by the container health check).
- `GET /api/health/ready` — database, storage and queue reachable; returns 503 otherwise. Use it for uptime monitoring.
- Worker liveness: heartbeat every 15 s, shown in Settings and in `/api/ai/status`.

## Backups
- PostgreSQL holds all agreements, approvals and payments: schedule `pg_dump` (or use a managed database with point-in-time recovery).
- The bucket holds customer media: enable versioning or replicate it.
- Redis holds only queue messages; losing it delays jobs (the worker's recovery sweep re-queues them from PostgreSQL).

## Rollback
1. Keep the previous image tags (`docker image tag tailorite-api:local tailorite-api:<date>` before rebuilding, same for the web image).
2. To roll back application code, point the services at the previous tags and `up -d`. This is safe while the newer release added only additive migrations.
3. If a migration must be undone, restore the pre-deployment database backup (migrations are not reversible automatically).

## Local development (no Docker)
See the README: `pnpm db:local` (embedded PostgreSQL), API and worker with `pnpm dev` / `pnpm dev:worker`, web app with `pnpm dev` in `tailorite-frontend`, or `pnpm dev:all` for everything.
