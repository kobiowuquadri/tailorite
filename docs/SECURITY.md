# Security

What is implemented, and the gaps we know about. Controls marked "tested" have automated tests (`tailorite-backend/test`, `tailorite-frontend/e2e`).

## Accounts and sessions
- Passwords: argon2id via Node's built-in `crypto.argon2` (19 MiB, 2 passes, 1 lane — OWASP minimum), minimum 10 characters. Login always runs one hash verification so timing does not reveal whether an email exists, and returns one generic message.
- Sessions: 256-bit random token in an HttpOnly, SameSite=Lax cookie; `__Host-` prefix and `Secure` when `COOKIE_SECURE=true`. Only the SHA-256 of the token is stored. Absolute expiry 30 days, idle expiry 7 days, revoked on logout; expired sessions are purged.
- CSRF: every mutation needs the `x-tailorite-csrf: 1` header **and** an `Origin`/`Referer` equal to `APP_ORIGIN` (tested).
- Rate limits (PostgreSQL fixed windows, shared by all API instances, keys hashed): login per IP and per email, registration per IP, portal token exchange per IP, decisions and change requests per link, uploads and AI runs per studio, demo sandboxes per IP.

## Tenant isolation (tested)
- The studio is derived from the session; no endpoint accepts a studio id.
- Every query is scoped by `studioId` (and `orderId` for order children); other studios' ids return 404.
- Composite foreign keys (`(id, studioId)`, `(id, orderId)`) make cross-studio links impossible at the database level, even if application code were wrong.

## Customer links (tested)
- `/review/{accessId}#{token}`: 256-bit token in the URL fragment (not sent to servers, not in Referer), stored only as a SHA-256 hash, shown to the studio once.
- The page exchanges the token for an HMAC-signed `tl_portal` cookie (HttpOnly, SameSite=Strict, path `/api/portal/{accessId}`, ≤ 2 hours, never beyond the link's expiry) and removes the token from the address bar. The cookie is re-checked against the access row on every request, so expiry and revocation apply immediately.
- Links expire (approval 14 days, change-request 7 days by default), can be revoked, and are replaced when a new link is created. Change-request links can never decide an approval request.
- Decisions require the reviewed version's content hash, lock the order row, close the request with a status-conditioned update and are unique per request, so duplicates or concurrent approve/decline cannot both succeed.
- The portal returns only the frozen customer-facing snapshot: no internal notes, evidence, other orders or source conversations. Media is limited to references selected in that version.
- Typed names are stored and labelled as self-reported. Link possession is the only authentication for customers in this release.

## Files
- Uploads are identified by magic bytes (JPEG, PNG, WebP, MP3, M4A/AAC, WAV, OGG/Opus, WebM, FLAC), never by name or declared type; size, duration, per-order total and count limits are enforced (tested).
- Image previews are re-encoded to WebP with all metadata (EXIF/GPS) removed; AI and customers only see previews.
- Objects live in a private bucket (or private local directory in development) under tenant-scoped keys and are streamed only after authorization, with `nosniff`, `Cache-Control: no-store` and the sniffed MIME type. Removing a source deletes its file unless a shared version references it, in which case the file is kept for that version.

## HTTP hardening
- API: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, `Content-Security-Policy: default-src 'none'`.
- Web: `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff`, a restrictive `Permissions-Policy` (microphone only for this origin), and in production a CSP limited to `'self'`; customer pages also send `noindex`.
- `TRUST_PROXY` must match the deployment so rate limits see real client IPs (Caddy: `1`).

## Data integrity and audit
- Published versions, decisions, payment entries, transcripts, AI results and audit events cannot be updated, and cannot be deleted outside the demo purge (database triggers, tested). Money columns have CHECK constraints.
- Every state change writes an audit event with actor type and label; the order page shows this history.

## AI
- Customer material is treated as untrusted in prompts; instructions inside it are ignored. Output must match a schema; quotes must exist in the cited source of the same order; nothing is applied without a person accepting it; AI cannot set prices, approve or message anyone.
- `GEMINI_API_KEY` and all other secrets are server-only environment variables, validated at startup and never logged or sent to the browser. Logs record ids, counts, timings and token usage — not customer content.

## Demo
- Public demo sandboxes are isolated per visitor, contain only synthetic data, expire and are purged. The presenter seed refuses to run in production unless `ALLOW_DEMO_SEED=true` and `DEMO_OWNER_PASSWORD` are set, only resets the flagged demo studio, and refuses if the demo email belongs to a real studio.

## Known gaps
- Web CSP allows `'unsafe-inline'` scripts (Next.js bootstrap); a nonce-based CSP is not implemented.
- No email verification, password reset, MFA or account/data deletion flow yet.
- Registration reveals whether an email is already registered.
- Single owner role per studio; staff roles are modelled but not exposed.
- No malware scanning of uploads (files are type-checked, never executed, and previews are re-encoded).
- Rate limits are per IP; customers behind shared mobile carrier IPs share limits.
- Customer identity is not verified (link possession plus a typed name).
- Dependency vulnerability scanning (`pnpm audit`) and a third-party security review have not been run.
