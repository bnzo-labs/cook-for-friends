---
type: task
id: W2-11
status: pending
wave: 2
module: review (commerce, access, identity rate limit, notifications)
agent: security-reviewer
model: opus
depends-on: [W2-03, W2-04, W2-05, W2-07, W2-08, W2-09]
---

# W2-11 — Security + correctness review of Wave 2 money paths

## Mission
Independent Opus review of every Wave 2 path that touches money, seats, access or personal data, before Erick accepts Wave 2. Read-only on app code: findings go in this file; CRITICAL/HIGH findings become fix briefs.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md` (Wave 2 plan + every W2 entry)
3. This file
4. `docs/CONTRACT.md` §2–§7 (commerce, access, identity, notifications)
5. `docs/DISCOVERY.md` §6 F1–F3 F5, §7 R5 R6 R12 R13
6. `docs/MASTER_BUILD_SPEC.md` §4, §8
7. The diffs: `git log --oneline` for commits tagged `W2-03`, `W2-04`, `W2-05`, `W2-07`, `W2-08`, `W2-09`, then `git diff <before-W2-03>..origin/main -- apps/web/src`

## Acceptance criteria
- [ ] Checklist reviewed and each item marked PASS / FINDING with file:line:
  - Webhook: signature on the raw body; fail closed without secret; event-id insert in the same transaction as side effects; no email or Stripe write that survives a rollback without an idempotency key; `after()` job run cannot double-send.
  - Seats: `FOR UPDATE` on the session row in the same transaction as the count and hold insert; availability formula = F2; no path creates an enrollment without the lock; oversell path refunds with an idempotency key.
  - Raw SQL: parameterized only; no string interpolation of input.
  - Checkout: input validation (zod), quantity/lines limits, rate limit, Origin check, `cff_cart` cookie flags, no open redirect in success/cancel URLs, metadata cannot be forged to grant another course (webhook trusts Stripe-side metadata it set, re-validates course/session ids exist).
  - Access: entitlements only via `access` functions; revocation on full refund; receipt and CSV routes enforce owner/staff; anonymous gets no existence leak.
  - Data: no PII or secrets in logs; CSV injection guard; email header injection impossible (`to` validated); `.ics` escaping.
  - Module boundaries: no deep imports across modules; only commerce writes commerce collections; catalog never imports commerce.
  - Tests: R5 race and R6 replay tests exist, assert exact counts, and ran (not skipped) in the latest CI integration job — link the run.
- [ ] Run the full suite on a throwaway Neon branch from `dev`; record pass count. Delete branch after.
- [ ] Findings table: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, impact, fix suggestion.
- [ ] For each CRITICAL/HIGH: write `tasks/W2-2N-fix-<slug>.md` (same frontmatter/sections as this brief, owner = module's agent per CONTRACT §1, `depends-on: [W2-11]`) and set this task `status: blocked` with "fixes required" until they close. No CRITICAL/HIGH → `status: complete`.

## Implementation steps
1. Worktree (read-only use) + env copy; throwaway Neon branch.
2. Walk the checklist; run tests; check the latest CI integration job log.
3. Write findings + fix briefs; SESSION entry.

## Files to create / edit
- Edit: this file (findings). Create: `tasks/W2-2N-fix-*.md` only if needed. Append to `docs/SESSION.md`.

## DO NOT TOUCH
- Any file under `apps/**` or `infra/**` (review only). `docs/CONTRACT.md`, `docs/DISCOVERY.md`.

## Erick handoffs
- None.

## Done when
Checklist complete, findings recorded, fix briefs written if needed, SESSION entry added, status set as above.

## Operating rules (Wave 2, from Wave 1 lessons)
- Own git worktree: `git -C /Users/erick/work/CookForFriends worktree add ../cff-w2-11 -b w2-11 origin/main`; then `cp -p apps/web/.env.local <worktree>/apps/web/.env.local`. Never edit the original `.env*` files. Never run `vercel env pull` or `vercel link` inside the repo.
- Node 22. `VIDEO_PROVIDER=none` locally.
- Integration tests locally: throwaway Neon branch from `dev` (project `empty-rain-36048098`) via `neonctl`, migrate it, run with `TEST_DATABASE_URL`, delete the branch after.
- **Never Neon `production`.**
- Rebase on `origin/main`, push docs to `main`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Fully autonomous: never wait for Erick. Blocker → `status: blocked` + reason here + SESSION.md entry, then exit.

## Communication
Caveman. English only.
