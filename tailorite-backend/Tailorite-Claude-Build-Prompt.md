# Tailorite — complete hackathon build prompt

You are my lead full-stack engineer, product designer, and technical cofounder. Build **Tailorite**, a functional platform for independent tailors and small fashion studios, from the first repository inspection through a working, tested, deployable hackathon release.

Work in the actual codebase. Implement the application, run it, verify the critical workflows, and leave clear deployment and demonstration instructions. Do not stop after generating a plan, a landing page, a collection of UI components, or an architecture document.

Use this specification as the product brief. Make practical implementation decisions, explain material tradeoffs briefly, and continue through the phases. Preserve existing project instructions and useful code. If you encounter a genuine blocker, state precisely what is missing, complete everything that can proceed independently, and distinguish implemented work from work you could not verify.

## 1. Product, audience, and outcome

**Product name:** Tailorite  
**Tagline:** Every detail agreed. Every stitch understood.

**One-sentence pitch:** Tailorite turns reference pictures, voice notes, and scattered messages into clear, customer-approved tailoring orders before the first stitch.

Our initial users are independent tailors, bridal designers, and small fashion studios in Nigeria. Their customers usually describe an outfit through multiple pictures, messages, and voice notes. Details get lost, instructions conflict, and changes arrive after a price or delivery date has already been agreed.

Tailorite creates one shared record of the agreement:

1. A tailor adds selected messages, reference images, and voice notes.
2. AI proposes a structured brief and links its suggestions to the original sources.
3. Missing details and conflicting instructions are made visible.
4. The tailor resolves uncertainty, checks feasibility, and confirms the price and delivery date.
5. The customer reviews the exact brief through a mobile-friendly link.
6. Approval freezes that version of the agreement.
7. Later changes are reviewed separately, with a clear comparison and any additional price or delivery adjustment.
8. The approved revision becomes the active agreement only after the customer accepts it.

**The main demonstration must show:** a messy set of instructions becomes an agreed order; a later change produces a visible design, price, and date difference; the original agreement remains intact.

AI assists with drafting. People decide what they want, what is feasible, what it costs, and when it will be delivered. Tailorite does not guarantee fit, workmanship, legal enforceability, or the accuracy of an AI suggestion.

## 2. What “complete” means for this hackathon

Deliver a coherent, usable first version of a company. Every visible primary action must work against real application data.

### Required release scope

- Studio owner registration, login, logout, and onboarding.
- Studio-isolated data and persistent sessions.
- Customer records and manually entered measurements.
- Orders with text, image, and audio intake.
- Real AI transcription/extraction through one configured provider.
- Source-linked brief suggestions with human review.
- Missing-detail and conflict resolution.
- Versioned customer approval through a secure browser link.
- Change requests, exact before/after comparisons, and revision approval.
- Order progress, an activity timeline, and manually recorded deposits.
- A printable approved brief that the user can save as a PDF.
- Responsive application screens, useful empty states, and failure recovery.
- A labelled synthetic demonstration dataset.
- Meaningful tests, local setup, deployment configuration, and a five-minute demo script.

### Keep outside the first release

Do not spend the hackathon building a marketplace, social feed, native mobile application, body measurement estimation from photos, virtual try-on, sewing-pattern generation, full accounting suite, live payment processing, automated WhatsApp ingestion, or complex employee permissions.

Use one garment per order in this release. Group orders and multi-garment packages belong on the roadmap.

Support one studio owner in the initial UI. Model memberships so additional staff can be introduced later, without building invitations and a permission editor now.

Manual WhatsApp sharing is useful: generate a prefilled message containing the approval link and let the user send it. Do not claim that clicking this button delivered a message.

## 3. Preferred architecture and stack

First inspect the repository, its instructions, package manager, framework versions, existing authentication, and deployment setup. Preserve an existing suitable implementation rather than recreating it.

For a new repository, use:

| Area | Default |
| --- | --- |
| Language | TypeScript throughout |
| Web application | Next.js App Router, React |
| Styling | Tailwind CSS, accessible shadcn/ui components, Lucide icons |
| Forms and validation | React Hook Form and Zod |
| Client server-state | TanStack Query where appropriate |
| API | NestJS modular monolith |
| Database | PostgreSQL with Prisma migrations |
| Background work | BullMQ with Redis |
| File storage | Private S3-compatible storage; MinIO for local development |
| AI | Gemini provider adapter for text, images, audio, and structured extraction |
| Tests | Suitable unit/integration runner plus Playwright for critical journeys |
| Workspace | pnpm workspace |
| Local infrastructure | Docker Compose |

Use current compatible stable package versions, verify unfamiliar APIs in official documentation, and commit the lockfile. Do not copy obsolete SDK calls or guess a model identifier.

Keep the API modular and the extraction worker independently runnable from the same backend codebase. Avoid unnecessary services. The API owns authorization, agreement state, and financial calculations. The web application renders the product. The worker handles expensive AI/media work.

Expose the API through the same application origin where practical. Set up development and deployment routing consistently so cookie authentication works without improvised cross-origin exceptions.

PostgreSQL is the source of truth. Redis coordinates background jobs; losing a Redis job must not destroy an order. Store job state in the database and make dispatch/recovery reliable.

If an existing repository uses a different adequate stack, document the smallest justified adaptation in docs/DECISIONS.md. Do not introduce a second authentication system or database.

### Suggested repository layout

    apps/
      web/
      api/
        src/
          auth/
          studios/
          customers/
          orders/
          sources/
          briefs/
          approvals/
          changes/
          payments/
          ai/
          jobs/
          audit/
          health/
        prisma/
    packages/
      contracts/
      config/
    docs/
    fixtures/
      demo/
    docker-compose.yml
    .env.example
    README.md
    PROGRESS.md

Use a separate backend worker entrypoint, not a second copy of the domain logic.

Provide convenient root scripts for development, builds, lint, type checks, tests, browser tests, migrations, and demo seeding. Document the actual script names and execution order; a teammate should not need to infer how the services fit together.

The environment example must cover database/Redis connections, application origin, session secrets, private storage endpoint/bucket/credentials, AI mode, Gemini API key, and model identifiers. Include upload and AI usage limits. Keep server-only credentials out of public-prefixed environment variables.

## 4. Design direction

Build a polished working product with an approachable, trustworthy identity.

- White and soft-neutral backgrounds, dark readable text, blue primary actions.
- Suggested brand accents: blue #0666FF, teal #00BFB3, coral #FF6A55, and amber #FFB629.
- Use darker accessible variants where the accent colors fail text contrast.
- Use the supplied Tailorite wordmark and favicon if they are present. Put assets in an appropriate public/brand directory and preserve their appearance.
- If brand assets are missing, use a clean Tailorite text wordmark and simple temporary icon. Continue building.
- Use one clear, readable font family, consistent spacing, and restrained motion.
- Desktop: compact navigation, spacious content, useful tables, and a split view for source evidence versus the brief.
- Mobile: readable cards, progressive disclosure, large controls, and a prominent approval action.
- Use familiar language: “Needs clarification,” “Ready for customer review,” “Approved version,” and “Change awaiting approval.”
- Distinguish workflow states with labels and icons as well as color.
- Avoid decorative charts with invented data, fake testimonials, inflated savings claims, and dead navigation items.

Make the review-and-approval experience the strongest part of the design.

## 5. Screens and actual behavior

### A. Public landing page

Include the product promise, the problem, a three-step explanation, a truthful product preview, beta pricing language, and functional calls to action.

Primary CTA: “Create your first order.”  
Secondary CTA: “Explore demo.”

A public demo must contain synthetic data only and use isolated sessions or a read-only preview. Do not expose a shared writable account with access to real studio data.

State proposed pricing as a hypothesis: first three approved orders free, then a proposed ₦500 per newly approved order, with revisions included. In the hackathon release, explain that billing is not active. Do not collect payment or unexpectedly lock essential workflows.

### B. Authentication and onboarding

Implement registration, login, logout, protected routes, session expiry, and friendly validation.

Use an existing trusted auth solution if available. Otherwise implement conventional server-side sessions using established password-hashing and cookie libraries. Never store passwords in plain text or long-lived authentication tokens in browser local storage.

Onboarding collects studio name, owner name, optional contact details, and defaults:

- Currency: NGN.
- Time zone: Africa/Lagos.
- Measurement unit: inches or centimeters, explicitly chosen.

Password recovery may be added after the critical workflow is complete if a real email delivery integration is available. Do not show a nonfunctional recovery flow or claim an email was delivered when it was only logged.

### C. Dashboard and orders

Show useful counts calculated from stored data:

- Draft orders.
- Orders needing clarification.
- Orders awaiting customer approval.
- Approved orders not yet started.
- Orders due soon, excluding completed and cancelled orders.

Provide search, status filters, pagination, a “New order” action, and a clear next step on each order.

Keep agreement status separate from production progress. An approved order can be awaiting production; a garment in production can have a proposed change awaiting approval.

### D. Customers and measurements

Create, view, edit, and search customers. Store only necessary contact details.

Measurements are entered by people, with an explicit unit and recorded date. Provide common measurement fields plus custom labels. Do not imply that every garment needs every measurement.

Editing a customer's measurement profile must never rewrite an already published or approved brief. Copy selected measurements into the agreement snapshot.

Allow a tailor to record that measurements will be taken at a fitting, with an agreed date and note. This must be a deliberate agreement, not a silent blank field.

### E. New order and source intake

Create an order linked to a customer. Collect an order title and garment type, then allow:

- Pasted text messages and notes.
- JPEG, PNG, and WebP reference images.
- Audio uploads in a documented supported format.
- Browser voice recording when available, with permission/error handling and upload fallback.

Each source has an identifiable label, optional sender/context, added time, and processing state. Keep the original file or text.

Use sensible configurable limits, such as 10 MB per image, 25 MB per audio file, five minutes per recording, and a per-order total limit. Validate actual file types and provider compatibility server-side. Do not add document or arbitrary URL ingestion to this release.

Explain that the tailor should upload only material they have permission to use. Show whether AI processing is available before starting a job.

### F. Brief workbench

Use two connected panels:

1. Original sources, image previews, audio playback, and editable transcript corrections.
2. Structured brief fields, suggestions, evidence, missing information, and conflicts.

Required sections:

- Customer and garment.
- Overall style and selected references.
- Neckline, sleeves, length, fit preference, and other relevant design details.
- Fabric/color preferences and who supplies the fabric.
- Measurements or an explicitly agreed fitting plan.
- Embellishments and special requests.
- Explicit exclusions, such as “no slit.”
- Quoted total price.
- Deposit requirement and manually recorded deposits, clearly distinguished.
- Delivery date and any fitting date.
- Notes the customer should review.

Do not force irrelevant fields for every garment. Allow “Not applicable” with appropriate context.

Clicking an evidence chip opens the corresponding source and relevant text or audio segment when available. Preserve unsupported suggestions as unconfirmed; do not present them as customer instructions.

The tailor can accept, edit, or reject suggestions, resolve conflicts, and supply missing information. Publishing must be blocked while required agreement details or relevant conflicts remain unresolved.

### G. Order detail and timeline

Include the active approved brief, any pending revision, source material, progress, deposit records, approval events, and change history.

Show “Version 1 approved” and “Version 2 awaiting approval” together when applicable.

Actions should include:

- Continue draft.
- Share for review.
- Copy/share approval link.
- Revoke or regenerate a pending link.
- Create a change proposal.
- Record a manual deposit or refund.
- Update production progress.
- View/download the approved brief.
- Archive a completed order.

Do not let an “Edit” action silently modify an approved agreement.

### H. Customer approval portal

This must work on a mobile browser without creating an account.

Display the studio, customer, outfit, selected references, design decisions, measurements or fitting plan, price, deposit terms, delivery date, and version being reviewed.

Provide:

- “Approve this version.”
- “Request changes,” with a clear comment field.
- An explicit confirmation such as “I have reviewed the design details, price, and delivery date.”
- A name field for attribution.
- Clear pending, approved, expired, revoked, superseded, and already-processed states.

Link possession is the authentication mechanism in this release. A typed name is self-reported; do not describe it as verified identity or a legally verified signature.

The public portal must never expose internal notes, other customers, studio-wide analytics, or unrelated source conversations. Only display materials explicitly selected for customer review.

### I. Change requests and revision comparison

A customer or tailor can initiate a change request after approval. A customer suggests a change; only the tailor can confirm feasibility, the new quoted price, and delivery consequences.

An approved-version customer portal may accept a change request while its scoped access is valid. For later visits, allow the tailor to issue fresh, expiring access scoped to that order and approved version. Distinguish permission to request a change from permission to decide an approval request; renewed access must never reopen a completed approval decision.

Display a field-level comparison of the active agreement and proposed revision:

- Original value.
- Proposed value.
- Price increase or decrease.
- Original and proposed delivery dates.
- Reason for the change.

Approval activates the proposed revision atomically. Rejection leaves the current agreement unchanged. Keep the historical versions and decisions visible.

### J. Settings and exports

Implement studio details, default unit/time zone, basic usage counts, and AI availability.

Create a clean print view of the approved brief with studio branding, order/version identifiers, agreed details, reference thumbnails, and approval timestamp. Support the browser’s “Save as PDF” workflow with print CSS. A standalone server-generated PDF is optional.

Never label a draft printout as approved.

## 6. Data model and invariants

Design the Prisma schema before building complex forms. Use UUIDs or equivalent non-sequential external identifiers and explicit timestamps.

Suggested entities:

| Entity | Responsibility |
| --- | --- |
| User / Session | Owner authentication and session lifecycle |
| Studio / Membership | Tenant ownership and future staff association |
| Customer | Studio-scoped contact record |
| MeasurementProfile | Current measured values, units, and recorded date |
| Order | Customer, garment title, workflow state, active approved version |
| SourceAsset | Original text/file, private storage key, hash, type, visibility |
| Transcript | Machine transcript and separately preserved human correction |
| ExtractionJob | Durable processing status, attempts, input hash, safe error |
| ExtractionResult | Validated AI suggestions, provenance, provider metadata |
| BriefDraft | Mutable working brief with a concurrency revision counter |
| ClarificationIssue | Missing/contradictory field, evidence, resolution record |
| BriefVersion | Immutable, complete agreement snapshot and content hash |
| ApprovalRequest | Version-scoped token digest, expiry, revocation, decision state |
| CustomerPortalAccess | Purpose-limited access to a version, with token digest, expiry, and revocation |
| ApprovalEvent | Exact version/hash, decision, self-reported name, timestamp |
| ChangeRequest | Base approved version, requested change, proposal, decision |
| ManualPayment | Deposit/refund record, amount, note, recorder, timestamp |
| AuditEvent | Append-only application activity history |

Important constraints:

1. Every tenant-owned record is scoped to its studio. Derive the studio from the authenticated membership, never from a trusted client-provided studio ID.
2. Relations must prevent linking one studio's customer, source, version, or job into another studio's order.
3. Store monetary values as integer kobo or precise database decimals. Calculate totals and balances on the server.
4. Separate an agreed deposit requirement from an actual manually recorded payment.
5. Use date-only values for promised calendar delivery dates; store event timestamps in UTC and render with the studio's time zone.
6. Brief versions snapshot measurements, terms, references, and relevant display details. Later customer/profile changes cannot affect them.
7. Published version content is immutable, including versions still awaiting approval. Subsequent edits produce a new version and supersede the earlier pending request.
8. Preserve source assets referenced by retained agreement versions. Corrections create new records or derivatives; they do not overwrite historical evidence.
9. Generate a deterministic content hash of canonicalized snapshot JSON. Treat it as a consistency mechanism, not proof that a database administrator cannot alter data.
10. Approval and revision activation use database transactions with optimistic concurrency checks.
11. At most one proposal is actively awaiting approval for an order in this release. Superseding it revokes the earlier request.
12. Repeated submissions and job deliveries must be idempotent.
13. Audit events are append-only through application code. Do not claim blockchain-grade or tamper-proof guarantees.
14. Usage pricing, if displayed, counts a newly approved order once; revision approvals do not create another charge.

## 7. Agreement and production state rules

Use separate state machines.

### Agreement state

Draft → Needs clarification or Ready for review → Awaiting approval → Approved.

A request for changes records feedback and returns work to a draft. The published snapshot remains unchanged. The next publication creates another version.

For an approved order:

Approved V1 → Draft revision based on V1 → V2 awaiting approval → Approved V2.

V1 remains the active agreement until V2 is accepted.

If a newer agreement becomes active, an older proposal must fail with a clear stale-version response. Never apply a stale change by silently rebasing it.

### Production state

Not started → In progress → Ready for fitting, where relevant → Ready for collection → Completed.

Support cancellation with a recorded reason. Enforce valid transitions on the server.

Starting production requires an active approved agreement. If a revision is pending during production, show the pending-change warning and identify the version currently approved for work. Do not imply that the proposed change has been accepted.

Approval links must be invalidated appropriately when an order is cancelled or a proposal is superseded.

### Required transaction behavior

For approval:

1. Validate the public session, request status, expiry, and version.
2. Confirm the expected base version still matches the order.
3. Record the approval event.
4. Activate the exact immutable version.
5. Close the request and related change request.
6. Append the audit event and update usage if this is the first approval.
7. Commit atomically.

Use a status-conditioned update or equivalent database concurrency control so two simultaneous approve/reject requests cannot both win.

## 8. AI implementation

Implement one real provider cleanly behind an interface. Gemini is the default because this product needs text, image, and audio processing; verify the selected model's supported capabilities in the current official documentation.

Configure credentials and model identifiers on the server. Claude is the coding assistant here; the application does not have to use Claude as its runtime AI provider.

Suggested interface:

    transcribeAudio(input): TranscriptResult
    extractBrief(input): StructuredBriefSuggestions
    checkConflicts(input): ClarificationSuggestion[]

These may share a provider implementation. Avoid unnecessary model calls when one extraction pass plus deterministic checks is sufficient.

### Processing pipeline

1. Save validated sources privately.
2. Create a durable job tied to a fixed source/input revision.
3. Transcribe audio and retain the original audio.
4. Extract candidate details from text, transcripts, and reference images.
5. Validate the response against the shared schema.
6. Verify that evidence references belong to the submitted input set.
7. Detect missing required details and contradictory candidate values.
8. Save the result as suggestions.
9. Let the tailor merge suggestions into the draft explicitly.

An extraction result must never overwrite a newer human edit. If the draft or source set changed during processing, offer a reviewable result with a clear notice.

### Minimum structured response

Use a typed schema equivalent to:

    {
      schemaVersion: "1",
      garmentType: { value: string | null, evidence: Evidence[] },
      fields: [
        {
          key: string,
          proposedValue: string | number | null,
          unit: string | null,
          basis: "explicit_text" | "audio_transcript" | "visual_observation" | "inference",
          evidence: Evidence[],
          needsHumanReview: boolean
        }
      ],
      missingFields: [
        { key: string, question: string }
      ],
      conflicts: [
        {
          key: string,
          candidates: [
            { value: string, evidence: Evidence[] }
          ],
          question: string
        }
      ],
      warnings: string[]
    }

Evidence includes a valid source ID and, when available, a source quote, actual character range, or validated audio time range.

Important rules:

- Missing information stays null or explicitly unknown.
- Do not invent measurements, prices, deadlines, deposits, customer names, or fabric composition.
- A price or date mentioned in source material is a candidate until the tailor confirms it.
- Do not infer body size from photographs.
- Treat image interpretations as visual observations, not confirmed customer intent.
- A source quote must exist in the referenced source/transcript. Reject or downgrade invalid evidence.
- Machine transcripts may be wrong. Make correction possible and label their origin.
- Only make an audio timestamp clickable when it is valid for the file; omit it when reliable timing is unavailable.
- Do not fabricate bounding boxes or annotated image regions.
- Do not treat a later message as automatically superseding an earlier instruction. Show conflicts for deliberate resolution.
- Use review states instead of invented “99% accurate” scores.
- Uploaded text, images, and audio are untrusted content. Instructions inside them must not control system behavior or invoke privileged tools.
- The AI has no authority to approve a brief, modify a payment record, authorize a user, or send messages.
- Limit inputs, output size, retries, and per-studio usage to prevent runaway costs.
- Persist provider/model/prompt version and processing duration without logging raw private conversations.

### Provider failures and missing credentials

Use explicit modes:

- **Live:** real provider calls using configured credentials.
- **Manual:** intake, editing, approval, and revision workflows remain functional without AI.
- **Demo fixtures:** deterministic sample extraction results, visibly labelled as examples.

If credentials are missing, show “AI extraction is not configured” and allow manual work. Never silently return a fixture and label it as live AI.

Retry temporary failures with a bounded policy. Show a recoverable error for invalid responses, timeouts, rate limits, and unsupported files. Do not duplicate draft updates when a job is retried.

## 9. Backend API and validation

Use REST endpoints with shared request/response contracts. Generate useful API documentation. The exact route names may change, but cover these capabilities:

| Group | Operations |
| --- | --- |
| Auth | Register, login, logout, current session |
| Studio | Read/update owned studio settings |
| Customers | List, create, view, update, measurements |
| Orders | List/filter, create, detail, archive, production transitions |
| Sources | Upload/add text, list, preview/download through authorization |
| Processing | Start extraction, job status, retry failed job |
| Brief | Read/update draft with expected revision, resolve issues |
| Publication | Publish immutable version, supersede pending version |
| Approval links | Create, revoke, regenerate, inspect status |
| Public portal | Exchange token, view scoped version, approve/request changes |
| Changes | Create request, build proposal, compare, submit, decline |
| Payments | Record manual deposit/refund and calculate balance |
| History | Versions, approvals, audit timeline |
| Export | Authorized approved brief print data |
| Operations | Liveness and readiness |

Keep approval, financial calculation, and authorization logic in backend services, not duplicated in frontend components.

Return consistent safe errors with a code, user-facing message, optional field errors, and request ID. Use appropriate responses for validation failures, authentication, authorization, stale edits, rate limits, and server errors.

Paginate lists and use database queries scoped by tenant. Do not download all orders and filter them in the browser.

## 10. Security and privacy requirements

Implement these as part of the product, not as a final cosmetic checklist:

- Secure, HttpOnly session cookies with appropriate SameSite behavior and expiry.
- CSRF protection or equivalent verified origin protection for cookie-authenticated mutations.
- Server-side authorization on every order, customer, media, export, and job endpoint.
- High-entropy approval tokens stored as hashes, with expiry and revocation.
- Approval requests scoped to a single order and immutable version.
- No state changes on GET requests.
- Avoid placing raw tokens in access logs, analytics, or referrer headers.
- Prefer a token in the link fragment, exchanged through POST for a short-lived scoped customer session; remove the fragment after exchange.
- Revalidate request status on every decision, even when the public session is still valid.
- Rate limits for login, public token exchange, uploads, extraction, and approval.
- Private object storage with authorized short-lived access.
- File size limits, MIME allowlists, content validation, sanitized filenames, and safe image handling.
- Never execute uploaded files or fetch arbitrary user-provided URLs on the server.
- Keep secrets out of source control, browser bundles, screenshots, and logs.
- Keep public customer review content distinct from internal notes.
- Do not cache private order data in a service worker.
- Support archiving and deletion of unreferenced uploads; document retention for sources attached to historical agreements.
- Clearly explain AI processing and data handling without inventing compliance certifications.

Use synthetic customers in fixtures and the public demonstration.

## 11. Financial and business behavior

This is an agreement platform with lightweight order tracking, not a payment processor.

Store the agreed garment price, deposit requirement, and manual payment entries separately. Label entries “Recorded by studio” so they are not mistaken for provider-verified transactions.

Calculate:

    balanceDue = activeApprovedTotal - netRecordedPayments

For an unapproved order, show draft financial values clearly as estimates or proposed terms.

For changes:

    newAgreedTotal = previousAgreedTotal + approvedPriceAdjustment

A proposed price adjustment does not affect the active balance until its agreement version is approved. Allow a negative adjustment when intentionally entered and validated. If the resulting balance is negative, show credit/refund due explicitly; do not silently clamp it to zero.

Manual payment corrections should create a reversal or amendment with a note, rather than deleting history.

Create docs/BUSINESS.md covering:

- Initial customer segment and the specific problem.
- The value of fewer misunderstandings and clearer change pricing.
- Proposed pricing, explicitly unvalidated.
- A practical first-customer approach through local tailors and fashion schools.
- Metrics: activation, time to first approved order, approval completion, repeat orders, unresolved conflicts, and manual correction rate.
- A cost model using measured provider usage or clearly labelled assumptions.
- A validation plan with interview questions and empty result fields.

Do not invent interviews, customers, revenue, market-size estimates, accuracy percentages, or measured time savings.

## 12. Step-by-step implementation plan

Create PROGRESS.md before implementation. For each phase, record status, actual commands run, verification results, unresolved issues, and the next concrete action.

Build vertical slices: each phase should add a usable end-to-end behavior.

### Phase 0 — Inspect and establish the project

1. Read repository instructions and inspect existing files.
2. Identify available runtime, database, storage, and credentials without printing secret values.
3. Select compatible dependencies and document architecture decisions.
4. Create the workspace, environment validation, and local infrastructure.
5. Define shared domain schemas and the initial database model.
6. Write a short implementation checklist with priorities.

**Gate:** the web app and API start; the database migration applies; health endpoints reflect dependency readiness; environment errors are understandable.

### Phase 1 — Authentication, tenant boundary, and application shell

1. Implement owner accounts and sessions.
2. Create the studio during onboarding.
3. Add tenant-aware authorization.
4. Build navigation and protected layouts.
5. Add customers and manual measurements.
6. Add two isolated studios to test fixtures.

**Gate:** a user can register, sign in, create a studio/customer, refresh without losing data, and cannot access another studio's resources.

### Phase 2 — Manual order and source-backed brief

1. Create orders and source intake.
2. Persist private images/audio/text.
3. Build the brief editor with explicit units, terms, and required-field checks.
4. Add evidence references and human-entered notes.
5. Add draft revision checks and conflict-safe saves.
6. Add order listing, filters, and meaningful empty/loading/error states.

**Gate:** a tailor can create a complete brief manually, leave and return, and recover the same data and source files.

### Phase 3 — Versioned publication and customer approval

1. Implement immutable published snapshots.
2. Build secure review links and the mobile customer portal.
3. Implement approval and request-changes decisions.
4. Handle expiry, revocation, duplicate clicks, and superseded versions.
5. Add approval history and print/PDF styling.

**Gate:** approval in a separate browser session freezes the exact displayed version. Editing a customer, source transcript, or draft afterward cannot alter that version.

### Phase 4 — Change management and financial consequences

1. Create a change request against the current approved version.
2. Let the tailor quote a design/price/date revision.
3. Build the before/after comparison.
4. Activate the new version only through a valid approval transaction.
5. Implement manual deposit/refund records and accurate balances.
6. Add production status transitions and pending-change warnings.

**Gate:** V1 remains authoritative while V2 is pending; accepting V2 changes the active agreement and financial total once; rejecting or using a stale link preserves the valid agreement.

### Phase 5 — Real AI intake and review

1. Implement the provider adapter and configurable model.
2. Implement audio transcription, image/text extraction, and schema validation.
3. Add durable jobs, retry limits, status polling, and recovery.
4. Connect source evidence to suggested fields.
5. Generate missing-detail/conflict questions.
6. Preserve human edits when a job finishes late.
7. Add explicit live, manual, and fixture states.

**Gate:** real text/image/audio input produces reviewable suggestions when credentials are configured. A real contradictory instruction is surfaced, missing details remain unknown, and a failure never destroys the draft.

### Phase 6 — Product polish and demo readiness

1. Finish landing page, settings, usage counts, and product copy.
2. Apply brand assets, responsive layouts, and accessible interactions.
3. Add the synthetic demo scenario below.
4. Verify loading, empty, expired-link, and provider-failure states.
5. Remove dead actions, fake charts, and unintended placeholder copy.
6. Prepare the code walkthrough and five-minute demo script.

**Gate:** the complete demonstration works through the browser at desktop and mobile sizes using persisted data.

### Phase 7 — Verification, deployment, and handoff

1. Run the meaningful tests below and fix failures.
2. Run production builds, lint, and type checks.
3. Prepare production migrations, storage settings, HTTPS routing, and process definitions.
4. Deploy when an authorized connected environment is available; otherwise provide exact deployment steps and report that deployment remains unverified.
5. Perform a final smoke test against the deployed application if deployed.
6. Finish README, architecture, scalability, demo, and known-limitations documents.

**Gate:** a teammate can set up the application from the documented commands; the actual verification record is clear; no unfinished feature is described as complete.

If time becomes tight, drop optional embellishments before compromising source intake, approval integrity, change comparisons, tenant isolation, or the demonstration. Do not abandon an essential workflow to add another dashboard.

## 13. Meaningful tests and acceptance scenarios

Focus tests on behavior that could break trust or the demo. Avoid tests that merely reproduce implementation details.

### Domain and integration tests

- Studio A cannot read or mutate Studio B's customer, order, source, job, approval, or export.
- Cross-studio IDs cannot be linked through a create/update request.
- Missing required details and unresolved relevant conflicts block publication.
- A published snapshot is unchanged after profile or draft updates.
- Expired, revoked, superseded, and cancelled-order approval links cannot approve.
- Duplicate approval submissions produce one decision/event and one usage increment.
- Concurrent approve/reject requests cannot both succeed.
- A stale proposal cannot overwrite a newer approved version.
- A pending/rejected change cannot alter the active price or delivery date.
- Exact money arithmetic holds for deposits, increases, reductions, and refunds.
- Duplicate/retried AI jobs do not duplicate sources or overwrite newer edits.
- Invalid structured responses and evidence pointing to another order are rejected.
- File upload validation and private storage authorization are enforced.
- Event timestamps and delivery dates render correctly in Africa/Lagos.

### Browser tests

1. Owner onboarding → customer → manual order → published brief → customer approval.
2. Approved order → customer change request → tailor proposal → customer acceptance → correct history and balance.
3. Customer rejects/requests changes → old agreement remains intact → revised publication.
4. Source upload → live provider adapter or explicitly mocked test provider → conflict resolution → publication.
5. A phone-sized approval journey with keyboard-accessible controls.
6. Reload/restart persistence and a recoverable processing failure.

Use deterministic fake providers in automated tests. Separately perform and record a real-provider smoke test when credentials are available. A fake-provider test is not evidence that live AI was tested.

Do not claim performance at a user count you have not measured. If running a small load test, report the actual environment, workload, concurrency, latency, error rate, and limits.

## 14. Synthetic demonstration scenario

Create a clearly labelled demo studio, “Amina Atelier,” and a customer, “Ada Okafor.” These are fictional.

### Input material

Source A — selected text:

    I want a navy-blue floor-length dress with a square neckline.
    Please make the sleeves long and fitted. No slit.
    I will provide the fabric.

Source B — later voice note, provided as an actual recording for live transcription:

    Please make the sleeves elbow length. Keep the square neckline
    and no slit. Can we add light beading around the neckline?

Source C — a reference image:

Use an image the team owns, created for this demo, or has permission to use. A reference image may show details that differ from the messages; the application must not assume every visible feature is desired.

Do not silently resolve long sleeves versus elbow-length sleeves. Show both pieces of evidence and ask the tailor to confirm. After the clarification, choose elbow-length sleeves.

If the audio file or reference image is not available, include instructions for the teammate to add them. Do not pretend that a transcript fixture is a real audio transcription.

### Confirmed V1

- Garment: navy-blue floor-length dress.
- Neckline: square.
- Sleeves: elbow length.
- Slit: none.
- Fabric: supplied by customer.
- Embellishment: light neckline beading.
- Measurements: enter explicitly labelled synthetic values with units.
- Total price: ₦85,000.
- Deposit requirement: ₦30,000.
- Recorded deposit: ₦30,000.
- Balance: ₦55,000.
- Delivery date: a future date chosen when seeding.
- Approval: performed during the demo in the customer portal.

### Revision V2

Customer asks for heavier neckline beading.

The tailor proposes:

- Replace light beading with heavier beading.
- Additional price: ₦15,000.
- New total: ₦100,000.
- Move delivery two calendar days later.
- Keep all other agreed fields unchanged.

While V2 is pending, V1 and its ₦85,000 total remain active.

After V2 is accepted, the active total becomes ₦100,000 and the balance becomes ₦70,000. V1 remains visible in history.

Seed this scenario into a dedicated development/demo environment with a guarded, repeatable command. Never reset production data as part of seeding.

## 15. Five-minute submission video

Create docs/DEMO-SCRIPT.md with narration, exact screens, and reset/preparation instructions.

| Time | Segment | Show |
| --- | --- | --- |
| 0:00–0:30 | Problem and audience | Scattered customer instructions and the cost of misunderstanding |
| 0:30–1:00 | Product and business | Who Tailorite serves, its focused promise, and proposed pricing labelled as a hypothesis |
| 1:00–2:10 | Intake and clarification | Sources, real AI processing, source-linked fields, and the sleeve conflict |
| 2:10–2:50 | Customer approval | Mobile review, explicit approval, and the frozen version |
| 2:50–3:35 | Change request | Beading revision, price/date comparison, acceptance, and retained V1 |
| 3:35–4:25 | Code and architecture | Actual repo modules, schema, approval transaction, provider adapter, and one meaningful test |
| 4:25–5:00 | Scalability and next steps | Background workers, tenant-scoped queries, private storage, limits, and what still needs validation |

Record actual behavior. Do not show prerecorded AI output as a live call. Fixture mode may be used for rehearsal or a disclosed backup.

Keep a working local fallback ready in case the deployed service or provider is unavailable, and state which environment is being shown.

## 16. Scalability that is implemented and honestly explained

Build a sensible foundation:

- Stateless web/API processes with shared database-backed sessions.
- Independently scalable AI workers.
- Tenant-scoped, paginated queries with indexes aligned to access patterns.
- Private object storage for media rather than database blobs or local ephemeral disks.
- Durable job records, bounded concurrency, retries, and recovery.
- Idempotent mutations and transactional agreement updates.
- Rate limits and upload/AI usage limits.
- Connection pooling appropriate to the deployment.
- Structured logs and basic measurements for processing duration, queue backlog, and failures.

Document the first likely bottlenecks and the next steps, such as provider rate limits, worker concurrency, database connection limits, and media delivery.

Distinguish features already implemented from future architecture. Do not write “supports millions of users” without evidence.

## 17. Required project deliverables

Produce and keep accurate:

- README.md: product summary, prerequisites, exact setup/start/test/build/seed commands, demo walkthrough.
- .env.example: every required variable, safe placeholders, and optional feature flags.
- Database schema, migrations, and guarded synthetic seed command.
- Docker Compose configuration for local PostgreSQL, Redis, and private storage.
- Application and worker production build/start commands.
- docs/ARCHITECTURE.md: actual components, data flow, and a compact Mermaid diagram.
- docs/DATA-MODEL.md: entities, tenant boundaries, snapshot rules, and state transitions.
- docs/AI.md: provider/model configuration, prompts, schemas, limitations, and failure handling.
- docs/API.md or generated OpenAPI documentation.
- docs/SECURITY.md: implemented controls and known gaps.
- docs/BUSINESS.md: customer, value, pricing assumptions, costs, and validation plan.
- docs/SCALABILITY.md: implemented foundations, observed results, and future bottlenecks.
- docs/DEPLOYMENT.md: one concrete deployment path, environment settings, migrations, health checks, and rollback notes.
- docs/DEMO-SCRIPT.md: the five-minute walkthrough and preparation steps.
- docs/TEST-RESULTS.md: commands actually run, outcomes, and unverified items.
- docs/KNOWN-LIMITATIONS.md: honest remaining gaps and a short roadmap.
- PROGRESS.md: current phase, completed work, blockers, and next action.

Keep documents concise and consistent with the actual repository. Do not create pages of claims for features that do not exist.

## 18. How to work and communicate

1. Inspect first; do not erase existing work or reset a database without authorization.
2. State a concise plan, then start implementing Phase 0 in the same session.
3. After each phase, summarize what works, how it was verified, and the next phase.
4. Continue to the next phase without repeatedly asking whether to proceed.
5. Ask questions only when a missing answer materially blocks a decision you cannot reasonably make.
6. Keep secrets private. Request configuration by variable name; never ask for secrets to be pasted into committed files.
7. Do not purchase services, send messages to real customers, or publish externally without the appropriate authorization.
8. Preserve a reliable checkpoint before a context limit. A new session should resume from PROGRESS.md after checking the repository.
9. Prefer simple, maintainable implementations to unnecessary abstraction.
10. Do not mark a task complete because a component renders. Verify the underlying behavior and persistence.
11. Fix meaningful build/test failures before adding optional polish.
12. If your environment cannot edit or execute code, say so and provide files and commands in implementation order; do not claim execution.

At completion, report:

- What is implemented.
- Exact commands to run it.
- Tests and real-provider checks actually completed.
- Deployment URL, only if deployed and verified.
- Any configuration still needed.
- Remaining limitations.
- The exact sequence to demonstrate the product.

## 19. Official technical references

Consult current primary documentation before using unfamiliar or version-sensitive APIs:

- Next.js: https://nextjs.org/docs
- NestJS: https://docs.nestjs.com/
- Prisma: https://www.prisma.io/docs
- BullMQ: https://docs.bullmq.io/
- Gemini audio: https://ai.google.dev/gemini-api/docs/audio
- Gemini image understanding: https://ai.google.dev/gemini-api/docs/image-understanding
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Playwright: https://playwright.dev/docs/intro

The hackathon submission brief requires a five-minute video explaining the problem, codebase/architecture/stack, a working screen-share demonstration, and scalability. Treat the official event rules and the team's actual deadline as authoritative.

**Start now: inspect the repository, create PROGRESS.md, establish the architecture, and implement Phase 0. Continue through the phases until the complete required workflow is working or a specific external blocker prevents further progress.**

