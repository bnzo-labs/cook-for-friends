---
type: task
id: W2-09
status: pending
wave: 2
module: commerce (attendees) + admin-ext
agent: backend-engineer
model: sonnet
depends-on: [W2-04]
---

# W2-09 — Attendee list: `listAttendees`, CSV export, session admin view

## Mission
Staff see who is coming to each in-person session inside the Payload admin and export the list to CSV for Excel FR. Replaces the Google Forms response sheet.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan entry + W2-04 entry)
3. This file
4. `docs/CONTRACT.md` §1 (commerce, admin-ext rows + CCR-W2-4 in `tasks/W2-04-seat-holds-checkout.md`), §3.2 customers, §3.4 enrollments/orders, §3.7, §4 `commerce.listAttendees`, `identity.isStaff`, §5.1 attendees.csv row
5. `docs/MASTER_BUILD_SPEC.md` §3.2 (session view with enrollments, exportable attendee list)
6. `apps/web/src/modules/catalog/collections/sessions.ts`, `apps/web/src/modules/catalog/admin/MoneyCell.tsx` (existing custom admin component pattern), `apps/web/src/app/(payload)/admin/importMap.js`

## Acceptance criteria
- [ ] `listAttendees(sessionId)` (CONTRACT §4) exported via `commerce/attendees/index.ts`; `AttendeeRow` = `{ enrollmentId, firstName, lastName, email, phone?, dietaryNotes?, orderNumber, enrollmentStatus, attendance, paidAt }`, sorted by last name then first name; includes all statuses (UI separates confirmed vs cancelled/refunded). Reads `customers` (name, email, phone, dietaryNotes) **read-only** per CCR-W2-4 item 5 (see `docs/SESSION.md` Wave 2 plan) — no writes outside commerce.
- [ ] Seat summary helper for the view: `{ capacity, confirmed, activeHolds, available }` using `getAvailableSeats` from W2-04.
- [ ] `GET /api/sessions/:id/attendees.csv`: staff/admin only (Payload `users` session via `payload.auth({ headers })` + `identity.isStaff`); customer or anonymous → 403/401; unknown session → 404. `text/csv; charset=utf-8`, UTF-8 BOM, `;` delimiter (Excel fr-CA), FR headers by default (`?locale=en` for EN), `Content-Disposition` filename `participants-<course-slug>-<YYYY-MM-DD>.csv`. Cells starting with `= + - @` (or tab/CR) are prefixed with `'` (CSV-injection guard). Quotes escaped.
- [ ] Admin: a `ui` field "Participants" on `sessions` (exception: catalog file, ui field only → no DB column, no migration) renders `src/admin/SessionAttendees` (server component): seat summary, confirmed attendees table (name, email, phone, dietary notes, order number), cancelled/refunded collapsed, "Exporter CSV" link. FR + EN labels (staff admin language). Shown only on existing sessions.
- [ ] `importMap.js` regenerated (`NEXT_PUBLIC_SKIP_ENV_VALIDATION=1 pnpm payload generate:importmap`) and committed (exception; only this 2c task touches it).
- [ ] Tests: integration for `listAttendees` (seeded enrollments, sort, statuses) and CSV route (BOM, delimiter, injection guard, auth matrix); Playwright `apps/web/e2e/w2-09-admin-attendees.test.ts` (local): staff logs in, opens a seeded session with enrollments → table rows visible, CSV link returns 200 `text/csv`.
- [ ] `/admin` session edit page returns **200** with the Participants panel locally (not just a redirect).
- [ ] CI green; Vercel deploy Ready. Staging: `vercel curl /admin/login` → 200; `vercel curl /api/sessions/1/attendees.csv` without staff cookie → 401/403 (not 500).

## Implementation steps
1. Worktree + env copy; throwaway Neon branch from `dev`, migrate, seed; insert test enrollments via Local API in tests.
2. `commerce/attendees/{list.ts,csv.ts,summary.ts,index.ts}`.
3. Route `app/api/sessions/[id]/attendees.csv/route.ts` (or `[id]/attendees/route.ts` serving `.csv` — keep the CONTRACT URL exactly).
4. `src/admin/SessionAttendees/*`; ui field in `sessions.ts`; regenerate importMap.
5. Tests, push, CI, Vercel Ready, staging probes.

## Files to create / edit
- Create/edit: `apps/web/src/modules/commerce/attendees/**` (owns this sub-barrel), `apps/web/src/modules/commerce/__tests__/attendees*.test.ts`, `apps/web/src/app/api/sessions/**`, `apps/web/src/admin/**`, `apps/web/e2e/w2-09-admin-attendees.test.ts`.
- Edit (exceptions): `apps/web/src/modules/catalog/collections/sessions.ts` (one `ui` field), `apps/web/src/app/(payload)/admin/importMap.js` (regenerated).

## DO NOT TOUCH
- Attendance marking (W3-05), enrollment cancellation (W3-05).
- `commerce/index.ts`, `commerce/server/**`, `commerce/webhook/**`, `commerce/sync/**`, `catalog/collections/courses.ts` (W2-08 edits it in parallel), `src/migrations/**`, `src/payload-types.ts`, `payload.config.ts`.
- `messages/*.json` (admin strings live with the admin component).

## Erick handoffs
- None.

## Done when
All criteria ticked, CI green, Vercel deploy Ready, SESSION entry added, `status: complete`.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-09 -b w2-09 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
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
