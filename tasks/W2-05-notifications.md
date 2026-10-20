---
type: task
id: W2-05
status: pending
wave: 2
module: notifications
agent: backend-engineer
model: sonnet
depends-on: [W2-01, W2-02b, W2-03]
---

# W2-05 — Notifications: React Email FR/EN, `.ics`, `send-email` job

## Mission
Build the notifications module: `sendEmail`, `buildIcs`, `enqueueEmail` (transactional, sent after commit by the jobs queue), the `send-email` job task, and the five Wave 2 templates in FR and EN (incl. the guest-seat `enrollment-confirmation`, D9 change 2026-10-19). Swap identity's magic-link email onto the new template. This task owns the **only Wave 2 migration in batch 2b** (Payload jobs table). Its migration must be generated **after W2-02b's `w2_multi_seat` migration is on `main`** (snapshot chain) — rebase first, then `migrate:create`.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry)
3. This file
4. `docs/CONTRACT.md` §4 `@/modules/notifications`, §6 (envelope step 3: emails enqueued in-transaction), §1 i18n-messages row
5. `docs/DISCOVERY.md` §4 (locale resolution for emails), §6 F10 (.ics), §7 R15, §8 D8
6. `docs/DESIGN_SPEC.md` (email section if present; otherwise tokens for colors/fonts — inline values derived from `tokens.css`, no external CSS)
7. `apps/web/src/modules/identity/server/ports.ts` (current plain magic-link sender)

## Contract Change Request (CCR-W2-3, approved 2026-10-19; amended by CCR-W2-6) — authoritative text now in `docs/CONTRACT.md` 1.2 §4 `@/modules/notifications`
CCR-W2-6 deltas vs the block below: `order-confirmation.items[]` gains `quantity: number` and `attendees?: { name, email }[]`; `oversell-refund` gains `quantity`; new `enrollment-confirmation` data type. CONTRACT 1.2 wins on any difference.
Additive to `@/modules/notifications`:
```ts
export type IcsInput = { uid: string; title: string; description: string; location: string; startsAt: ISODate; endsAt: ISODate; url: string }
export type Attachment = { filename: string; content: string /* utf-8 or base64 */; contentType: string }
export function enqueueEmail<T extends EmailTemplate>(i: { template: T; to: string; locale: Locale; data: EmailData[T]; idempotencyKey: string; ics?: IcsInput[]; tx?: TxContext }): Promise<void>
//   queues Payload job 'send-email' with req = tx?.req → rolled back with the caller's transaction
export const notificationsJobTasks: TaskConfig[]   // contains 'send-email'
export type EmailData = {
  'magic-link': { link: string; expiresInMinutes: number }
  'order-confirmation': { orderNumber: string; customerFirstName?: string
    items: { title: string; sessionStartsAt?: ISODate; sessionEndsAt?: ISODate
             location?: { name: string; address: string; city: string; postalCode?: string; mapsUrl?: string }; amount: number }[]
    subtotal: number; discountTotal: number; taxTotal: number; total: number; currency: 'cad'
    receiptUrl?: string; contactEmail?: string }
  'oversell-refund': { orderNumber: string; courseTitle: string; sessionStartsAt: ISODate; refundAmount: number; currency: 'cad' }
  'refund-issued': { orderNumber: string; refundAmount: number; currency: 'cad'; full: boolean }
  // remaining EmailTemplate members get their data types in Wave 3
}
```
Money in cents (formatted `fr-CA` / `en-CA`), dates ISO UTC (rendered `America/Toronto`).

## Acceptance criteria
- [ ] Exports per CONTRACT §4 + CCR-W2-3. `sendEmail` for a template not built in Wave 2 returns `{ ok: false, error: { code: 'VALIDATION', … } }` (no throw).
- [ ] Templates `magic-link`, `order-confirmation`, `enrollment-confirmation`, `oversell-refund`, `refund-issued` with `@react-email/components@1.0.12`, FR and EN, HTML + plain text. All copy from `messages/{fr,en}.json` under `notifications.*` (no hard-coded customer strings). `order-confirmation` shows each in-person item's date/time in `America/Toronto`, location + maps link, an "Add to Google Calendar" link, totals, and `receiptUrl` when present. Multi-seat: shows `quantity` × unit, and when `attendees` is non-empty a "Seats booked for" list (names + emails) with a line that each guest gets their own email. `enrollment-confirmation` (guest variant): "<buyerName> booked a seat for you", course, date/time `America/Toronto`, location + maps link, Google Calendar link, how to sign in later with this email address (text, no magic link in Wave 2 — Q3), contact email; **no prices, totals, order number or receipt**. `oversell-refund` mentions the number of seats refunded. All names are escaped (React Email default) and never placed in the subject line.
- [ ] `buildIcs` (CONTRACT signature) emits RFC 5545: CRLF line endings, `METHOD:PUBLISH`, `VTIMEZONE` for `America/Toronto`, `DTSTART;TZID=America/Toronto`, `DTSTAMP`, stable `UID`, escaped `, ; \ \n`, lines folded at 75 **octets** (UTF-8 safe with French accents). Unit tests cover each rule; output imports cleanly into a parser check (e.g. validate structure with a small hand-written parser in the test, no new dependency).
- [ ] `send-email` job task: input is JSON-serializable `{ template, to, locale, data, idempotencyKey, ics? }`; handler builds `.ics` attachments via `buildIcs` (`text/calendar; method=PUBLISH`), calls `sendEmail`, passes `idempotencyKey` to Resend, retries 3. Registered through `notificationsJobTasks` (platform composes it, W2-01).
- [ ] Snapshot/render tests: `order-confirmation` with quantity 3 + 2 attendees (FR + EN), `enrollment-confirmation` (FR + EN) contains no amount/currency string, a guest name with `<script>` renders escaped.
- [ ] `enqueueEmail` integration tests: inside a transaction then commit → one `payload-jobs` row; rollback → zero rows. Job handler test with the test transport (see below) asserts attachment count/filename and locale.
- [ ] Test seam: `setEmailTransportForTests()` in `notifications/server/transport.ts`; production path always Resend (`resend@6.32.1`, `EMAIL_FROM`, `EMAIL_REPLY_TO`).
- [ ] Identity magic-link default sender now calls `sendEmail({ template: 'magic-link', … })` (edit `identity/server/ports.ts` default only; `setMagicLinkEmailSender` and the port type unchanged). All identity tests still pass.
- [ ] Migration `<timestamp>_w2_jobs_send_email` (Payload jobs table + task-slug enum) generated, committed, verified up/down/up on a throwaway branch, applied to Neon `dev` then `staging`. `payload-types.ts` regenerated.
- [ ] Live smoke: one real `order-confirmation` (FR) with an `.ics` attachment sent via Resend to `W2_TEST_EMAIL` (read from the copied `.env.local`; if absent → skip this one criterion, note it, continue). Record Resend message id here.
- [ ] CI green; Vercel deploy Ready. Staging: `vercel curl /api/cron/jobs` with bearer → 200 `{ ok: true, ran: n }` (jobs now enabled).

## Implementation steps
1. Worktree + env copy; throwaway Neon branch from `dev`.
2. `notifications/{types.ts,server/transport.ts,server/send.ts,server/ics.ts,server/enqueue.ts,jobs/send-email.ts,templates/*.tsx}`.
3. Fill `notificationsJobTasks` in `notifications/index.ts`; export everything.
4. Generate migration (`pnpm payload migrate:create w2_jobs_send_email`), regenerate types; verify on throwaway branch; apply dev → staging.
5. Swap identity default sender.
6. Tests, live smoke, push, CI, Vercel Ready, staging probe.

## Files to create / edit
- Create/edit: `apps/web/src/modules/notifications/**`.
- Create: `apps/web/src/migrations/<timestamp>_w2_jobs_send_email.{ts,json}`; edit `apps/web/src/migrations/index.ts`, `apps/web/src/payload-types.ts` (regenerated). **Batch 2b migration owner — no other 2b task migrates.**
- Edit (exception): `apps/web/src/modules/identity/server/ports.ts` (default sender only).
- Edit: `messages/{fr,en}.json` under `notifications.*` only.

## DO NOT TOUCH
- `payload.config.ts` (jobs wiring is W2-01's), any `collections/**`, other modules, `errors.*` message keys.
- Wave 3 templates (reminder, waitlist, certificate, comment, cancellation). Guest reminders/certificates are Wave 3.

## Erick handoffs
- Add `W2_TEST_EMAIL=<address that Resend test sender can deliver to>` to `apps/web/.env.local` (staging uses the Resend test domain; it only delivers to the Resend account owner's address — D8).

## Done when
All criteria ticked, migration applied dev + staging (never production), CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-05 -b w2-05 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally. Never commit `apps/web/AGENTS.md` or `apps/web/CLAUDE.md` generated by `next dev`.
- Integration tests locally: throwaway Neon branch from `dev` (project `empty-rain-36048098`) via `neonctl`, migrate it, run with `TEST_DATABASE_URL`, delete the branch after. CI creates its own branch per run.
- Migrations: Neon `dev` first, then `staging`. **Never Neon `production`.**
- Verify on the real target: final HTTP 200 + expected content. A 307 is not "loads". Staging is Vercel-auth protected: `vercel curl <path> --deployment https://cook-for-friends.vercel.app`.
- After pushing: CI green **and** Vercel prod deploy `Ready` (`vercel ls`; failure reason via `vercel api /v13/deployments/<id>`).
- `messages/{fr,en}.json` is shared: add keys only under your own namespace; on rebase conflict keep both sides.
- Rebase on `origin/main`, push to `main`. Small conventional commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## Communication
Caveman. English only.
