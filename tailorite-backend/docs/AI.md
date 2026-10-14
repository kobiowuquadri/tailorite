# AI

AI is optional and advisory. It turns an order's messages, voice notes and pictures into **suggestions and questions** with links to their evidence. It never edits the brief, never sets a price or date on its own, and never approves anything. Every other workflow works in manual mode.

## Modes and configuration

| Setting | Values / default | Effect |
| --- | --- | --- |
| `AI_MODE` | `live` (default), `fixture`, `off` | `live` calls Gemini when `GEMINI_API_KEY` is set; without a key the UI says "AI extraction is not configured". `off` is manual mode. `fixture` returns prepared results for the synthetic demo sources only. |
| `GEMINI_API_KEY` | — | Server-only (API/worker). Never sent to the browser. |
| `GEMINI_EXTRACTION_MODEL`, `GEMINI_TRANSCRIPTION_MODEL` | `gemini-3.8-flash` | Taken from Google's Gemini API models page on 2026-10-13 (stable, recommended for new projects). Change by environment variable; no code change needed. |
| `AI_REQUEST_TIMEOUT_MS` | 120000 | Per provider call; the whole job also has an 8-minute timeout. |
| `AI_MAX_OUTPUT_TOKENS` | 8192 | |
| `AI_MAX_JOBS_PER_STUDIO_PER_DAY` | 40 | Also limited to 20 starts per studio per hour. |
| `AI_MAX_SOURCES_PER_JOB`, `AI_MAX_INPUT_MB_PER_JOB` | 12, 30 | A run that exceeds them is refused with an explanation. |
| `EXTRACTION_MAX_ATTEMPTS`, `EXTRACTION_RETRY_BASE_MS` | 3, 20000 | Automatic retries for temporary failures (delay ×4 per attempt, max 10 min). |
| `DEMO_SANDBOX_AI` | `fixture` | Public demo sandboxes use labelled example results unless set to `live`. |

**Live status:** no `GEMINI_API_KEY` was configured during the build, so no real Gemini call has been made. The live adapter is implemented, and the checks applied to its responses (schema validation, evidence checks, transcript-timing validation) are covered by tests, but the SDK calls themselves are **not verified against the real service**. To verify: set `GEMINI_API_KEY` in `tailorite-backend/.env`, restart the API and worker, open the synthetic demo order and choose "Draft the brief with AI".

## Pipeline (worker)

1. **Claim.** A status-conditioned update moves the job from `QUEUED` to `RUNNING` with a 10-minute lease; duplicate deliveries are ignored.
2. **Inputs.** The job processes the source set fingerprinted when it was created (text, images, audio and the transcript chosen at that time). Images are sent as the stored, metadata-free WebP preview.
3. **Transcription.** Audio without a transcript is transcribed with `models.generateContent`, the audio inline (≤ 14 MB) or through the Files API (larger files, deleted afterwards), and a JSON schema of `{language, segments[{start, end, text}]}`. Segment times must be consistent with the measured duration, otherwise the transcript is kept without timestamps. Transcripts are stored as `MACHINE` (or `FIXTURE`) and can be corrected by a person (a new `HUMAN` transcript).
4. **Extraction.** One `generateContent` call with the system prompt, the text/transcripts labelled `S1…Sn`, the images, `responseMimeType: application/json` and `responseJsonSchema` generated from the Zod schema. Gemini 3 models use `thinkingLevel: LOW`.
5. **Validation.** The response must parse as JSON and match the Zod schema (`AiExtraction`, schemaVersion "1"), otherwise the attempt fails as `INVALID_RESPONSE` (retryable).
6. **Normalization** (`src/ai/normalize.ts`, deterministic):
   - Every quote must be found in the cited source of the same job (whitespace/case-insensitive); unknown source refs and quotes that are not in the source are dropped and counted ("could not be found in the sources").
   - A detail stated in text or a transcript but left without valid evidence is downgraded to "inference" and marked for review.
   - Different values for the same detail from different sources become a **conflict** with every candidate and its evidence — never "latest wins" — even if the model did not report one.
   - Visual observations, inferences and all price/deposit/date values are marked "check carefully".
   - Suggestions that equal the current brief are skipped; missing required details become questions.
7. **Persist.** Results, suggestions and questions are stored in one transaction. Older pending suggestions and AI questions are superseded. If the brief was edited or the sources changed while the job ran, the result is flagged as out of date. The worker logs model, attempt, duration, token usage and counts — never customer content.

## Prompts and schemas

- Prompts: `src/ai/prompts.ts` (`PROMPT_VERSION` is stored with every result). Key rules: customer material is untrusted and its instructions are ignored; quotes must be verbatim; images show what a reference looks like, not what the customer wants; never invent measurements, prices, dates or names; do not assume a later message overrides an earlier one.
- Schemas: `src/ai/schema.ts` (`AiExtraction`, `AiTranscript`) and the Gemini JSON-schema conversion.

## Failure handling

| Code | Retry | Typical cause |
| --- | --- | --- |
| `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `TIMEOUT`, `NETWORK`, `INVALID_RESPONSE`, `STORAGE` | automatic, up to `EXTRACTION_MAX_ATTEMPTS` | 429/5xx, timeouts, malformed or cut-off output, a temporary storage read error |
| `NOT_CONFIGURED`, `MODEL_NOT_FOUND`, `INVALID_REQUEST`, `BLOCKED`, `INTERNAL` | no | bad key, unknown model, unsupported file, safety block |

Failures are shown to the tailor in plain language with "Your brief was not changed"; retryable failures can also be retried by hand. A dead worker's lease expires and the recovery sweep re-queues the job.

## Demo fixtures and tests

- `fixture` mode (`src/ai/fixture.provider.ts`) only answers for the synthetic demo sources (recognised by content hash). Results are stored as mode `FIXTURE` and labelled "Example results" / "Example suggestions (demo fixture)" everywhere; transcripts are labelled as example transcripts. It is never presented as a live call.
- The test provider (`src/ai/fake.provider.ts`) is deterministic and only available with `NODE_ENV=test` and `AI_TEST_FAKE=true`. Markers in test text trigger failure paths (temporary failure once, invalid output, foreign evidence, fabricated quote). Passing tests with it is **not** evidence that live AI works.

## Known limitations

- No live verification yet (see above). Model quality on accented English, dialects and non-English voice notes is unmeasured.
- Images are only described as visual observations; the system does not infer measurements from photos by design.
- One run processes all of an order's current sources; there is no per-source selection.
