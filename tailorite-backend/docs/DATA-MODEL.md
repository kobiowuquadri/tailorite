# Data model

Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations` (the second migration, `integrity_guards`, adds the database triggers and CHECK constraints described below). Identifiers are UUIDv7; timestamps are UTC; calendar dates (delivery, fitting, payment received) are `DATE` values interpreted in the studio's time zone (chosen at onboarding). Money is integer cents of US dollars (`BIGINT`); columns ending in `Kobo` hold cents.

## Entities

| Group | Models | Notes |
| --- | --- | --- |
| Identity | `User`, `Session`, `Membership`, `Studio` | A studio is the tenant. Sessions store only a SHA-256 hash of the cookie token, with absolute and idle expiry. |
| Customers | `Customer`, `MeasurementProfile` | A profile holds the current measurements with an explicit unit. Briefs copy measurements; later profile edits never change a brief or a version. |
| Orders | `Order` | One garment per order. Holds `agreementStatus`, `productionStatus`, `activeVersionId`, cached due date, cancel/archive data and a per-studio order number (`ORD-0001`). |
| Sources | `SourceAsset`, `Transcript` | Text, image or audio with private storage keys, sniffed type, size, duration and processing state. Transcripts are append-only; a human correction is a new row that points to the one it corrects. |
| AI | `ExtractionJob`, `ExtractionResult`, `BriefSuggestion`, `ClarificationIssue` | Jobs are durable (status, attempts, lease, next attempt, input fingerprint). Results keep the validated payload, model, prompt version, usage and validation stats. Suggestions and questions reference the result that produced them. |
| Working brief | `BriefDraft` | One per order: the editable brief JSON, a `revision` counter for optimistic concurrency, and the change request it belongs to (if any). |
| Agreement | `BriefVersion`, `BriefVersionSource`, `ApprovalRequest`, `CustomerPortalAccess`, `ApprovalEvent` | Immutable published versions, the request for a decision, hashed customer links, and exactly one decision event per request. |
| Changes | `ChangeRequest` | Customer request or studio proposal against a base version, with customer messages, reason, proposed version and outcome. |
| Money | `ManualPayment` | Deposits, payments, refunds and reversals recorded by the studio. |
| Operations | `UsageEvent`, `AuditEvent`, `RateLimitBucket`, `WorkerHeartbeat` | Usage counts (one "approved order" per order), append-only order history, fixed-window rate limits, worker liveness. |

## Tenant boundary

- Every tenant-owned row carries `studioId`. The API derives the studio from the session; it never trusts a studio id from the request.
- Child rows reference parents through composite keys such as `(customerId, studioId)` and `(orderId, studioId)` (`@@unique([id, studioId])` on parents), so the database itself rejects linking an order to another studio's customer, or a version to another studio's order.
- Every query filters by `studioId` (and `orderId` for order children). Cross-tenant ids return 404, not 403, so ids cannot be probed. Integration tests cover reads and writes across two studios.

## Snapshot rules

- A `BriefVersion` stores a complete snapshot (`schemaVersion`, order reference and title, studio contact details, customer name, the brief, selected references with their dimensions, change context) and `contentHash` = SHA-256 of its canonical JSON (keys sorted, no whitespace).
- Totals, deposit, delivery and fitting dates are also copied into columns for queries; they are derived from the same snapshot.
- `BriefVersionSource` pins the sources a version references, so their files are retained ("retained by version") even if removed from the working brief.
- Triggers reject `UPDATE` on `BriefVersion`, `ApprovalEvent`, `ManualPayment`, `Transcript`, `ExtractionResult` and `AuditEvent`, and reject `DELETE` unless the transaction sets `tailorite.purge = on` (used only to delete expired demo sandboxes).

## State

### Agreement (`Order.agreementStatus`, recomputed after every change)

| Status | Meaning |
| --- | --- |
| `DRAFT` | No approved version; brief incomplete. |
| `NEEDS_CLARIFICATION` | Open questions or conflicts (including customer feedback). |
| `READY_FOR_REVIEW` | Server readiness check passes; nothing pending. |
| `AWAITING_APPROVAL` | A first version is with the customer. |
| `APPROVED` | An active version exists and no change is open. |
| `REVISION_DRAFT` | A change is being prepared; the active version stays in force. |
| `REVISION_AWAITING_APPROVAL` | A revision is with the customer; the active version stays in force. |

`ApprovalRequest.status`: `PENDING` → `APPROVED` | `CHANGES_REQUESTED` | `DECLINED` (revisions only) | `SUPERSEDED` (a newer version was shared) | `WITHDRAWN` (studio withdrew or order cancelled). `pendingSlot` (unique, set only while pending) guarantees one pending request per order.

`ChangeRequest.status`: `REQUESTED` (customer asked) → `DRAFTING` → `AWAITING_APPROVAL` → `APPROVED` | `DECLINED_BY_CUSTOMER`, or `DECLINED_BY_STUDIO` / `WITHDRAWN`. `openSlot` (unique while open) guarantees one open change per order. A proposal based on a version that is no longer active cannot be approved (stale check).

### Production (`Order.productionStatus`)

| From | Allowed next states |
| --- | --- |
| `NOT_STARTED` | `IN_PROGRESS` (only once a version is approved), `CANCELLED` |
| `IN_PROGRESS` | `READY_FOR_FITTING`, `READY_FOR_COLLECTION`, `CANCELLED` |
| `READY_FOR_FITTING` | `IN_PROGRESS`, `READY_FOR_COLLECTION`, `CANCELLED` |
| `READY_FOR_COLLECTION` | `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `COMPLETED`, `CANCELLED` | none (can be archived and restored) |

Cancelling withdraws any pending approval and open change and stops every customer link; approved versions, payments and history are kept.

## Money

`balanceDue = max(0, activeVersion.total − netRecorded)` and `creditDue = max(0, netRecorded − activeVersion.total)` where `netRecorded = deposits + payments − refunds + reversals`. A proposed revision never changes these numbers; the order page shows what the balance would become. Payment entries cannot be edited or deleted; a correction adds an opposite `REVERSAL` linked to the original.
