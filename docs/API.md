# API

NestJS JSON API under `/api`, served on the web app's origin (Caddy routes `/api/*` in production; a Next.js rewrite does it in development). Request and response shapes are the Zod schemas and types in `src/contracts` (the web app uses a generated copy). There is no generated OpenAPI document; this page is the reference.

## Conventions

- **Auth.** Studio routes need the `tl_session` cookie (`__Host-tl_session` over HTTPS). The studio is always taken from the session, never from the request. Customer routes under `/api/portal/:accessId` need the path-scoped `tl_portal` cookie from the token exchange.
- **CSRF.** Every non-GET request must send `x-tailorite-csrf: 1`, and its `Origin` (or `Referer`) must equal `APP_ORIGIN`.
- **Errors.** `{ "error": { "code", "message", "fieldErrors"?, "requestId", "meta"? } }` (codes listed in `src/contracts/common.ts`): `VALIDATION_FAILED` and `PUBLISH_BLOCKED` (422); `UNAUTHENTICATED` and `PORTAL_SESSION_REQUIRED` (401); `FORBIDDEN`, `ONBOARDING_REQUIRED`, `CSRF_REJECTED` (403); `NOT_FOUND` and `LINK_INVALID` (404 — also for other studios' ids); `CONFLICT`, `STALE_REVISION`, `STALE_VERSION`, `ALREADY_DECIDED`, `INVALID_STATE` (409); `LINK_EXPIRED`, `LINK_REVOKED` (410); `PAYLOAD_TOO_LARGE` (413); `UNSUPPORTED_MEDIA` (415); `RATE_LIMITED`, `LIMIT_REACHED` (429); `AI_NOT_CONFIGURED`, `SERVICE_UNAVAILABLE` (503); `INTERNAL` (500). Every response carries `x-request-id`.
- **Concurrency and retries.** Brief writes send `expectedRevision`; publishing, AI runs, payments and reversals send an `idempotencyKey` so a retried request does not act twice.
- **Pagination.** List endpoints accept `page` and `pageSize` (≤ 100) and return `{ items, page, pageSize, total }`.
- **Money and dates.** Amounts are integer kobo; calendar dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC.

## Routes

### Health and session
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health/live` | Process is up (public). |
| GET | `/api/health/ready` | Database, storage and queue checks plus AI availability; 503 when a dependency is down (public). |
| POST | `/api/auth/register` · `/api/auth/login` · `/api/auth/logout` | Rate limited per IP and email. |
| GET | `/api/auth/session` | Current user, studio and role (works before onboarding). |
| POST | `/api/studios` | Onboarding: creates the studio and owner membership. |
| GET / PATCH | `/api/studio` | Studio details, unit, time zone. |
| GET | `/api/studio/usage` | Usage counts and the inactive pricing hypothesis. |
| GET | `/api/ai/status` | Mode, availability, limits, worker heartbeat. |
| POST | `/api/demo/sessions` | Public: creates an isolated synthetic demo studio and signs the visitor in. |

### Customers
| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/customers` | Search and paginate / create. |
| GET / PATCH | `/api/customers/:customerId` | Includes the measurement profile. |
| PUT | `/api/customers/:customerId/measurements` | Replaces the profile (explicit unit). |

### Orders, production and history
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/dashboard` | Counts by state, orders needing attention, recent orders. |
| GET / POST | `/api/orders` | Filters: `search`, `agreement`, `production`, `filter` (dashboard shortcuts), `customerId`, `view` (active/archived/all). |
| GET / PATCH | `/api/orders/:orderId` | Detail with versions, allowed production moves, next step. PATCH renames. |
| POST | `/api/orders/:orderId/production` | `{ to }` — state machine, only after approval. |
| POST | `/api/orders/:orderId/cancel` · `/archive` · `/unarchive` | Cancel needs a reason. |
| GET | `/api/orders/:orderId/timeline` | Append-only history. |

### Sources and transcripts
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/orders/:orderId/sources` | Sources plus the upload policy (limits). |
| POST | `/api/orders/:orderId/sources/text` | Pasted message with sender/context. |
| POST | `/api/orders/:orderId/sources/files` | Multipart `file` (image or audio, identified by content). |
| GET / PATCH / DELETE | `/api/orders/:orderId/sources/:sourceId` | Removing a source used by a shared version keeps its file for that version. |
| GET | `/api/orders/:orderId/sources/:sourceId/content` · `/preview` | Private file streaming with HTTP ranges (audio seeking). |
| POST | `/api/orders/:orderId/sources/:sourceId/transcripts` | Human transcript correction (new row). |

### Brief, questions and suggestions
| Method | Path | Notes |
| --- | --- | --- |
| GET / PUT | `/api/orders/:orderId/brief` | Working brief, readiness, issues, suggestions. PUT needs `expectedRevision`. |
| POST | `/api/orders/:orderId/brief/measurements/copy` | Copies the customer's profile into the brief. |
| POST | `/api/orders/:orderId/brief/reset` | Discards unshared edits back to the active version. |
| POST | `/api/orders/:orderId/issues` · `/issues/:id/resolve` · `/issues/:id/dismiss` | Questions and conflicts. |
| POST | `/api/orders/:orderId/suggestions/:id/accept` · `/reject` | Accept (optionally edited) or reject a suggestion. |
| GET / POST | `/api/orders/:orderId/extractions` | Overview / start an AI run (`idempotencyKey`). |
| POST | `/api/orders/:orderId/extractions/:jobId/retry` | Manual retry of a retryable failure. |

### Versions, links and changes
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/orders/:orderId/versions` | Publish the working brief as an immutable version; returns the one-time link. |
| GET | `/api/orders/:orderId/versions` · `/versions/:versionId` | Versions with decisions; detail includes the frozen comparison for revisions. |
| GET | `/api/orders/:orderId/compare` | Working brief vs active version (for a change being prepared). |
| GET | `/api/orders/:orderId/links` | Link status (never the token). |
| POST | `/api/orders/:orderId/links/approval` | New link for the pending version; earlier links stop working. |
| POST | `/api/orders/:orderId/links/change` | Link that lets the customer view the approved version and ask for a change (cannot approve). |
| POST | `/api/orders/:orderId/links/:accessId/revoke` | Stop a link. |
| GET / POST | `/api/orders/:orderId/change-requests` | List / start a studio proposal (`reason`). |
| POST | `/api/orders/:orderId/change-requests/:id/start` · `/decline` | Work on a customer request / decline or withdraw. |

### Money
| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/api/orders/:orderId/payments` | Finance summary / record a deposit, payment or refund. |
| POST | `/api/orders/:orderId/payments/:paymentId/reverse` | Correction entry with a note. |

### Customer portal (no account)
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/portal/:accessId/session` | `{ token }` from the link fragment → short portal cookie. Rate limited per IP. |
| GET | `/api/portal/:accessId/review` | The frozen version, state, permissions and comparison (only customer-facing content). |
| GET | `/api/portal/:accessId/media/:sourceId` | Only references selected in that version. |
| POST | `/api/portal/:accessId/decision` | `APPROVE` (name + confirmation + `contentHash`), `REQUEST_CHANGES` (comment), `DECLINE` (revisions only). |
| POST | `/api/portal/:accessId/change-requests` | Ask for a change to the approved version. |
