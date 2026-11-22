---
type: task
id: W4-13
status: complete
wave: 4
batch: 4d
module: platform (CI)
agent: devops-agent
model: sonnet
depends-on: [W4-03c]
migration-owner: false
---

# W4-13 — CI hardening: workflow permissions, SHA pins, strip bypass from LHR

## Mission
Address three LOW findings from W4-03c (F-1, F-2, F-3) in `.github/workflows/`.

- **F-1:** Add explicit least-privilege `permissions:` block to every workflow file for defence
  in depth (repo default is `read`, but explicit is better).
- **F-2:** SHA-pin `pnpm/action-setup` (only third-party action not yet SHA-pinned; Neon actions
  already pinned; `actions/*` are GitHub-owned, tag-pin accepted).
- **F-3:** Strip `configSettings` (contains `extraHeaders` → Vercel bypass secret) from
  Lighthouse JSON reports before uploading the `lighthouse-staging-reports` artifact.
  **Rotation of `VERCEL_AUTOMATION_BYPASS_SECRET` is Erick's step** (noted in Erick handoffs).

## Context
- `tasks/W4-03c-final-security-review.md` findings F-1, F-2, F-3
- `.github/workflows/ci.yml`, `lighthouse-staging.yml`, `neon-cleanup.yml`

## Ownership
`.github/workflows/` (devops only, per Wave 4 ownership rules).

## Changes
### F-1 — explicit `permissions:` (all three workflow files)
- `ci.yml`: workflow-level `permissions: contents: read`
  All jobs only read the repo; no PR comment/check writes needed; Neon and Stripe via secrets.
- `lighthouse-staging.yml`: workflow-level `permissions: contents: read`
- `neon-cleanup.yml`: already had `permissions: contents: read` — no change needed.

### F-2 — SHA-pin `pnpm/action-setup`
SHA for tag `v4`: `b906affcce14559ad1aafd4ab0e942779e9f58b1`
Applies in: `ci.yml` (3 occurrences: verify, integration, e2e jobs), `lighthouse-staging.yml` (1 occurrence).
Format: `pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4`

### F-3 — strip `configSettings` from LHR JSON before artifact upload
In `lighthouse-staging.yml`, add a step between "Run Lighthouse CI" and "Upload Lighthouse
reports" that uses `jq` (pre-installed on ubuntu-latest) to delete `configSettings` from every
`*.json` in `.lighthouseci/`. The key `configSettings.extraHeaders` holds the bypass secret.
HTML reports are unaffected (no secrets in them).

## Erick handoffs
- **Rotate `VERCEL_AUTOMATION_BYPASS_SECRET`** in Vercel (Settings → Deployment Protection →
  Protection Bypass for Automation → regenerate secret), then update the GitHub secret:
  `gh secret set VERCEL_AUTOMATION_BYPASS_SECRET`. The old value may have been read by any repo
  collaborator who downloaded the `lighthouse-staging-reports` artifact (private repo, low blast
  radius). Rotation removes residual exposure.

## Done When
- [x] `permissions: contents: read` present at workflow level in `ci.yml` and `lighthouse-staging.yml`.
- [x] `pnpm/action-setup` SHA-pinned with tag comment in both `ci.yml` and `lighthouse-staging.yml`.
- [x] Strip step present in `lighthouse-staging.yml` before the upload step; verified `jq` deletes `configSettings` key.
- [x] CI green on this PR (`secret-scan`, `verify`; `integration` + `e2e` skipped if no Neon key — expected).

## DO NOT TOUCH
`apps/web/src/**`, migrations, `docs/**`.

## Operating rules
Wave 4 standing rules (worktree, no force-push, never merge, etc.)

## Completion notes
Implemented F-1, F-2, F-3 as described. neon-cleanup.yml already had permissions block — no edit.
Rotation reminder for VERCEL_AUTOMATION_BYPASS_SECRET is an Erick handoff.
