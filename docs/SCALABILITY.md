# Scalability

What is built, what has been observed, and where it will break first. No load test has been run, so this document makes no capacity claims.

## Implemented foundations
- **Stateless API processes.** Sessions, rate-limit counters and job state live in PostgreSQL, so any number of API instances can run behind the proxy.
- **Independently scalable workers.** `dist/worker.js` is a separate process with `WORKER_CONCURRENCY` (default 2). Jobs are claimed with a status-conditioned update and a lease, so several workers can run safely; duplicate deliveries are no-ops.
- **Queue choice by environment.** BullMQ on Redis (Compose), BullMQ's PostgreSQL backend (local), or `JOB_QUEUE_BACKEND=database` polling for databases with very few connections (the Clever Cloud DEV plan allows 5; API + worker measured at 3 with `DATABASE_POOL_MAX=2`).
- **Durable jobs and recovery.** PostgreSQL holds every job's status, attempts and next attempt time; the queue carries only ids. A 20-second recovery sweep re-dispatches undelivered or stuck jobs and expires leases of dead workers; retries back off ×4 (`EXTRACTION_RETRY_BASE_MS`, max 10 minutes).
- **Tenant-scoped, paginated queries** with indexes that match the access paths: `(studioId, agreementStatus)`, `(studioId, productionStatus)`, `(studioId, dueDate)`, `(studioId, updatedAt)`, `(orderId, createdAt)` on order children, `(status, nextAttemptAt)` for jobs. Lists are paginated (≤ 100 per page).
- **Private object storage** for media (S3-compatible in Compose/production) instead of database blobs or local disks; files stream with HTTP range support, and images get a small WebP preview that is also what the AI receives.
- **Idempotent, transactional writes.** Publishing, AI runs, payments and reversals take idempotency keys; agreement changes lock the order row and use conditional updates and unique constraints.
- **Limits.** Upload size/duration/count per order, AI runs per studio per day and hour, sources and megabytes per AI run, rate limits on authentication and customer links.
- **Connection pooling.** Each process uses a `pg` pool of `DATABASE_POOL_MAX` connections (default 10) through Prisma's driver adapter.
- **Measurements in logs.** Structured JSON logs with request duration and request id; extraction logs with duration, attempt, tokens and counts; a `job_backlog` event every minute while jobs are queued or running; worker heartbeat visible in Settings.

## Observed so far (development machine, Windows 11, single process each)
- Backend integration suite: see `docs/TEST-RESULTS.md` for counts and durations.
- Browser suite: 6 journeys passed in 5.4 minutes including a backend build and a production web build.
- Demo extraction with the deterministic fake/fixture providers completes in well under a second per job; live Gemini latency is **not measured** (no API key configured).

These are functional observations, not performance results.

## First likely bottlenecks
1. **AI provider quotas and latency.** A busy studio's runs queue behind Gemini rate limits; the queue backs off but throughput is bounded by quota × worker concurrency. Next: per-studio fairness in dispatch, quota-aware concurrency, alerting on backlog age.
2. **Database connections.** `(API instances + workers) × DATABASE_POOL_MAX` must stay below PostgreSQL's `max_connections`. Next: PgBouncer (transaction mode) or a managed pooler; lower pool sizes per process.
3. **Uploads held in memory.** Multipart uploads are buffered (up to 25 MB per audio file) for sniffing and processing; many concurrent uploads raise API memory. Next: stream to storage with a size cap, then process from storage in the worker.
4. **Media served through the API.** Every image and audio byte passes through the API process. Next: short-lived signed URLs from the private bucket, or a CDN in front of authorized media.
5. **Image processing on API instances.** `sharp` runs during upload. Next: move preview generation to the worker.
6. **Rate-limit and audit writes** add a row write to hot paths; fine at current scale, could move to Redis counters if needed.

## Not done yet
- No load test, no production deployment, no horizontal-scaling test with multiple API/worker instances.
- No metrics backend or dashboards beyond structured logs.
