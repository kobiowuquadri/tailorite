# Test results

Commands actually run on the development machine (Windows 11, Node 24.16, pnpm 10.34.6, embedded PostgreSQL 18, Chromium from Playwright 1.64). Latest run: 2026-10-14.

## Automated

| Where | Command | Result |
| --- | --- | --- |
| backend | `pnpm test` | **7 files, 50 tests passed** (real PostgreSQL, fresh database per run) |
| backend | `pnpm lint` (oxlint, type-aware) | 0 warnings, 0 errors |
| backend | `pnpm typecheck` | clean |
| web | `pnpm lint` · `pnpm typecheck` · `pnpm contracts:check` | clean · clean · in sync (13 files) |
| web | `pnpm test:e2e` | **6 passed** in 5.4 min, including a backend build and a production web build |

### Backend coverage of the required scenarios
| Scenario (build prompt §13) | Test |
| --- | --- |
| Studio A cannot read or change Studio B's data; cross-studio ids cannot be linked | `auth-and-tenancy` (two-studio isolation, client-supplied studio id ignored), `orders-sources-brief` (refuses another studio's customer, isolates orders, evidence/references from another order rejected) |
| Missing details and unresolved conflicts block publication | `approvals-and-changes` → blocks publication while required details are missing; `ai-pipeline` → conflict surfaced |
| Published snapshot unchanged after profile/draft edits | `approvals-and-changes` → freezes the published snapshot (including direct database updates, blocked by triggers) |
| Expired, revoked, superseded and cancelled-order links cannot approve | `approvals-and-changes` → refuses expired, revoked, superseded and cancelled-order links |
| Duplicate approvals give one decision/event and one usage increment | `approvals-and-changes` → approves exactly once |
| Concurrent approve/reject cannot both succeed | `approvals-and-changes` → lets only one of two simultaneous decisions win |
| Stale proposal cannot overwrite a newer approved version | `approvals-and-changes` → keeps V1 authoritative while V2 is pending; renewed change-request access cannot decide approvals |
| Pending/rejected change cannot alter active price or date | `approvals-and-changes` → declined or withdrawn change leaves the agreement untouched |
| Exact money arithmetic (deposits, increases, reductions, refunds) | `approvals-and-changes` → refunds, reversals and credit due |
| Retried AI jobs do not duplicate sources or overwrite edits | `ai-pipeline` → idempotent starts and deliveries; never overwrites edits made while processing; recovers lost dispatches and dead workers |
| Invalid structured responses and foreign evidence rejected | `ai-pipeline`, `evidence-and-normalize.spec` |
| Upload validation and private storage authorization | `orders-sources-brief` → validates uploads by content, size and type; serves private files only to the owning studio |
| Timestamps and delivery dates in Africa/Lagos | `dates.spec` |
| Demo sandboxes isolated and purged; presenter seed only resets the flagged studio | `demo` |

### Browser journeys (`tailorite-frontend/e2e`)
Run against an isolated stack: API + worker on :4100 with a freshly created `tailorite_e2e` database and the **deterministic fake AI provider**, production web build on :3100.
1. Sign-up → onboarding → customer → manual order → share → customer approves on a phone.
2. Approved order → deposit → change-request link → customer request → tailor proposal (+₦15,000, +2 days) → V1 and V2 shown together, balance unchanged → customer approves → ₦100,000 agreed, balance ₦70,000, V1 kept.
3. Customer requests changes on V1 → feedback resolved → V2 shared and approved → studio proposal V3 declined → V2 and its price remain.
4. Paste message + upload voice note and picture → test provider → sleeve conflict shown with both sources → resolved → shared.
5. Phone-sized review using only the keyboard; no horizontal scrolling; validation messages; a second approval is impossible.
6. Edits survive a reload and a new browser context; a temporary AI failure is retried automatically and succeeds (attempt 2).

## Manual verification (browser, development stack)
Walked through in Chromium with screenshots: demo sandbox, example extraction, conflict resolution, sharing, mobile approval, deposit, change-request link, revision comparison on the phone, V2 approval (balance ₦70,000), version page, print view (approved) and draft print, expired/invalid link pages, settings, landing page (no horizontal scroll at 412 px), presenter demo sign-in after `pnpm demo:seed`. `GET /api/health/ready` returned `ok` for database, storage and queue.

## Problems found during verification and fixed
- A first AI run was reported as out of date because the job's own transcript changed the input fingerprint → the processed input now includes transcripts the job produced (regression assertion in `demo.test.ts`).
- Re-opening the same customer link in a tab already showing it left the token in the address bar → the review page also handles fragment-only navigations (caught by browser journey 2).
- The approval button overflowed the screen at phone width → actions stack on phones.
- The presenter demo studio showed the sandbox "deleted automatically" banner → studios now expose the sandbox expiry (assertion in `demo.test.ts`).
- Example (fixture) results were labelled "flagged by AI" / "AI suggestion" → neutral or "example results" wording.

## Not verified
- **Live Gemini calls** — no `GEMINI_API_KEY` configured. Passing tests with the fake provider are not evidence that live AI works.
- **Docker Compose, Dockerfiles, Caddy** — not built or run (no Docker on this machine).
- **Deployment** — none; no public URL.
- **Other browsers and real phones** — only Chromium (desktop and Pixel 7 emulation).
- **Performance** — no load test.
