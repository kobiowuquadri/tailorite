# Five-minute demo script

Synthetic data only: studio "Amina Atelier", customer "Ada Okafor" (both fictional). State on screen which environment you are showing (local machine or a deployed URL).

## Preparation (10 minutes before recording)

1. Backend (`tailorite-backend`), each in its own terminal, or `pnpm dev:all` for all four:
   ```bash
   pnpm db:local                 # embedded PostgreSQL (skip if you use your own)
   pnpm db:migrate
   pnpm build && pnpm demo:seed  # creates/resets ONLY the flagged demo studio; prints the sign-in email and order URL
   pnpm start                    # API on :4000
   pnpm start:worker             # extraction worker
   ```
2. Web (`tailorite-frontend`): `pnpm dev` (or `pnpm build && pnpm start`) on :3000.
3. AI: for the live segment set `GEMINI_API_KEY` in `tailorite-backend/.env` (with `AI_MODE=live`) **before** starting the API and worker. If no key is available, set `AI_MODE=fixture`, and say on camera: "This run uses prepared example results; the screen labels them as examples."
4. Two browser windows:
   - **Studio:** sign in at `/login` with `demo@tailorite.local` and the `DEMO_OWNER_PASSWORD` from `.env`.
   - **Customer phone:** a private/incognito window with device emulation (Chrome DevTools → Pixel 7), or a real phone if the app is deployed (a phone cannot open `localhost` links).
5. Reset between takes: `pnpm demo:seed` again.

## Script

| Time | Screen | Do and say |
| --- | --- | --- |
| 0:00–0:30 | Landing page, then the order's sources | "A tailor gets a dress order across WhatsApp: a message, a voice note days later, a picture. The message says long sleeves; the voice note says elbow length. Misunderstandings like this mean remakes and arguments about price." Open ORD-0001 → Brief and sources; point at the three sources. |
| 0:30–1:00 | Landing: How it works, Pricing; then Settings → Usage | "Tailorite is for independent tailors and small studios. One promise: every detail agreed before the first cut. Pricing is a hypothesis we are testing — first three approved orders free, then ₦500 per approved order — and billing is not active." |
| 1:00–2:10 | Brief workbench | Click **Draft the brief with AI** (live). While it runs: "The voice note is transcribed and the material is read by Gemini, but it can only suggest." Show suggestions with evidence chips; click the voice-note chip — the audio jumps to the quote. Show the **sleeves conflict** with both sources; resolve with "Elbow length", note "Confirmed with Ada by phone". Accept the remaining suggestions. If the run flags the picture's side slit against "No slit" (the example results do), point it out: pictures are references, not instructions. Tick the reference picture, check price ₦85,000, deposit ₦30,000 and delivery date, then **Share for review**. |
| 2:10–2:50 | Phone window, then studio order page | Open the link on the phone: "No account — a private link." Scroll: price, dates, measurements, reference. **Approve this version**, type "Ada Okafor", tick the confirmation, approve. Back on the order page: "Version 1 approved", fingerprint, timestamp. **Record payment** ₦30,000 deposit → balance ₦55,000. Show **Print / PDF**. |
| 2:50–3:35 | Order page ↔ phone | **Send a change-request link** → on the phone **Ask for a change**: "Heavier beading on the neckline". Studio: **Prepare a proposal** → embellishments "Heavier beading around the neckline", price ₦100,000, delivery +2 days → **Share change for approval**. Order page shows "Version 1 approved" and "Version 2 awaiting approval" together; balance still ₦55,000. Phone: the comparison shows ₦85,000 → ₦100,000 (+₦15,000) and delivery 2 days later → approve. Studio: Version 2 in force, balance ₦70,000, Version 1 kept as "Approved, later replaced". |
| 3:35–4:25 | Editor / repository | `tailorite-backend/src`: modules (`approvals`, `portal`, `changes`, `payments`, `ai`, `jobs`). `prisma/schema.prisma` → `BriefVersion` (immutable snapshot + content hash) and the `integrity_guards` migration (triggers). `src/portal/portal.service.ts` → `decide`: row lock, hash check, conditional update, one event per request. `src/ai/gemini.provider.ts` and `src/ai/normalize.ts` (evidence checks, conflicts never "latest wins"). One test: `test/approvals-and-changes.test.ts` → "lets only one of two simultaneous decisions win", or `tailorite-frontend/e2e/02-change-request.spec.ts`. |
| 4:25–5:00 | `docs/ARCHITECTURE.md` diagram | "API and worker scale separately; jobs are durable in PostgreSQL so a lost queue message only delays work; every query is tenant-scoped; media is in private storage; uploads and AI usage are limited. Next we need real tailors: validate the pricing, measure AI quality on Nigerian voice notes, and load-test." |

## If something fails live
- AI unavailable: switch `AI_MODE=fixture`, restart API and worker, and say so; or fill the brief by hand (manual mode works end to end).
- Phone cannot reach the app: use the emulated phone window on the same machine.
- Data out of order: `pnpm demo:seed` restores the starting state in a few seconds.
