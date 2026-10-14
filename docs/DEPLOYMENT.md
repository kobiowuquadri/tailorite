# Deployment

**Status:** not deployed. The Dockerfiles and Compose file below were written for this release but could not be built or run on the development machine (no Docker). Treat the first run as a test and follow the verification checklist.

## Path: one Linux VM with Docker Compose and Caddy

Everything runs on one host behind Caddy, which serves the web app and routes `/api/*` to the API on the same origin (first-party cookies, no CORS) and obtains HTTPS certificates automatically.

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
