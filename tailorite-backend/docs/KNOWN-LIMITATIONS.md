# Known limitations

Honest list of what this release does not do, or has not verified.

## Not verified
- **Live AI.** No `GEMINI_API_KEY` was available, so no real Gemini call has been made. The demo can run with labelled example results (`fixture`) or in manual mode. Automated tests use a deterministic fake provider, which is not evidence that live AI works.
- **Docker and deployment.** Dockerfiles, `docker-compose.yml` and the Caddy configuration were written but not built or run (no Docker on the development machine). The Clever Cloud database is migrated, but the apps are not deployed yet, so there is no public URL.
- **Small production database.** The Clever Cloud DEV plan allows 5 connections; the app is configured to use 3–4, so requests may fail briefly while an old and a new instance overlap during a deploy. Its TLS certificate is self-signed and not verified.
- **Demo sandbox setup is query-heavy.** Creating one sandbox makes roughly 1,000 sequential database queries. With the database ~220 ms away it took 210 s; next to the database it should take seconds to tens of seconds (not yet measured on the free hosting). The demo page tells visitors it can take up to a minute.
- **Performance.** No load test has been run. See `SCALABILITY.md` for likely bottlenecks.
- **Platforms.** Development and tests ran on Windows 11 with Chromium only. Other operating systems and browsers (Safari/iOS, Firefox) were not tested.

## Product scope
- One garment per order; multi-garment packages need separate orders.
- Payments are records kept by the studio; Tailorite does not process or verify payments. Naira only.
- Billing is not implemented; the pricing shown is a hypothesis.
- Tailorite never sends messages. Sharing uses a prefilled WhatsApp link or copy/paste; there are no reminders or notifications.
- Customers are identified by link possession and a typed name — not verified identity or a legal signature.
- Printing uses the browser's "Save as PDF"; there is no server-generated PDF.
- No data export, account deletion, password reset, email verification, MFA or staff accounts yet.
- AI processes all of an order's current sources in one run; it cannot be pointed at a subset. Its quality on accented English, dialects and non-English voice notes is unmeasured.

## Technical
- Uploads are buffered in API memory (≤ 25 MB per file) and media is streamed through the API rather than from signed URLs or a CDN.
- Web CSP allows inline scripts (no nonces).
- Time zones other than Africa/Lagos are selectable but only Lagos is covered by tests.
- Accessibility: keyboard approval on a phone-sized screen is tested; no full audit (screen readers, contrast tooling) has been run.

## Roadmap (next steps, in order)
1. Live Gemini smoke test, then measure suggestion accuracy and correction rates on consented real orders.
2. Deploy one environment with Compose + Caddy, HTTPS and database backups; run the verification checklist in `DEPLOYMENT.md`.
3. Pilot with a small group of tailors and fashion-school students; run the interview plan in `BUSINESS.md`.
4. Password reset, email verification and staff accounts.
5. Signed media URLs or CDN, and image processing in the worker.
6. Optional notifications through an approved WhatsApp Business integration — only with the studio's and customer's consent.
