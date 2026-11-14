---
type: task
id: W3-13
status: pending
wave: 3
module: catalog (media access)
agent: backend-engineer
model: opus
depends-on: [W3-10]
migration-owner: false
---

# W3-13 — Material files stored as images are publicly readable (`media` read access)

## Mission
Fix W3-10 finding **H-1**. `materials.file` uploads into the shared `media` collection. Non-staff read access on `media` is "any image" (`{ mimeType: { like: "image/" } }`), and `media` accepts `image/*`. A recipe uploaded as JPG/PNG (scanned recipe card or photo, both likely) is paid course content that should be served only through `/api/materials/:id` after an entitlement check. Today anyone can list it via `GET /api/media` (the response includes `filename` and `url`) and download it via `GET /api/media/file/<filename>`. No sign-in needed. This also breaks what `docs/GUIDE_ADMIN_FR.md` §4 tells the client ("Seuls les clients ayant accès au cours peuvent télécharger ces fichiers").

## Context loading (in order)
1. `CLAUDE.md` · 2. `docs/SESSION.md` (W3-03a entry) · 3. this file + `tasks/W3-10-wave3-security-review.md` (H-1)
4. `docs/CONTRACT.md` §3.1 (`media`, `materials`), §3.7 (access)
5. `apps/web/src/modules/catalog/collections/media.ts`, `materials.ts`, `server/materials.ts`; `apps/web/src/modules/learning/server/materials.ts`
6. PoC: `apps/web/test/security/w3-media-material-leak.test.ts`

## Evidence
- `apps/web/src/modules/catalog/collections/media.ts:22`: `read: ({ req }) => (isStaff(req.user) ? true : { mimeType: { like: "image/" } })`
- `apps/web/src/modules/catalog/collections/media.ts:28`: `mimeTypes: ["image/*", "application/pdf"]`
- `apps/web/src/modules/catalog/collections/materials.ts:30`: `file` is an `upload` to `media` with no mime restriction.
- `@payloadcms/storage-s3` (`payload.config.ts:123`) serves `/api/media/file/:filename` through the same collection read access.

## Acceptance criteria
- [ ] For non-staff (anonymous **and** signed-in customers), `media` read excludes every media doc referenced by any `materials.file`. Storefront images (course hero, gallery, SEO, blocks) stay publicly readable. Staff unchanged.
- [ ] Recommended, no schema change: make `read` async, `{ and: [{ mimeType: { like: "image/" } }, { id: { not_in: <ids of materials.file> } }] }`, ids loaded with `overrideAccess: true`, `select: { file: true }`, `depth: 0`. An empty list must not produce an invalid `not_in` (skip the clause). Short in-process cache (≤ 60 s) is fine. A schema-based fix (`media.visibility` or a private `material-files` upload collection) needs a migration → raise a CCR and go through W4-03b's `w4_security` slot instead.
- [ ] `/api/materials/:id` keeps working for entitled customers and staff (presign reads the R2 key directly, not through `media` access). Existing `materials-access` tests stay green.
- [ ] PoC `apps/web/test/security/w3-media-material-leak.test.ts`: remove `.fails`. Add one case for a signed-in customer (no entitlement) and one for `GET /api/media` list semantics (`payload.find` without `where`, `overrideAccess: false`) that must not return the material image.
- [ ] CI integration job runs the PoC (not skipped); link the run in the PR.
- [ ] Note in `## Completion notes`: material images already on staging/prod were exposed before the fix; R2 object keys do not change, so links copied earlier keep working through `/api/media/file/...` only until this fix is deployed (access is checked per request; there is no public bucket URL).

## Implementation steps
1. Worktree from `origin/main`, env copy, throwaway Neon branch from `dev` for the integration test (never `production`; never dev-boot Payload against `dev`).
2. Remove `.fails` (RED), implement the access change (GREEN), add the two extra cases.
3. PR `fix(W3-13): hide material files from public media reads`; do not merge.

## Files to create / edit
- Edit: `apps/web/src/modules/catalog/collections/media.ts` (+ a small helper under `catalog/server/` if needed), `apps/web/test/security/w3-media-material-leak.test.ts`, catalog unit tests as needed.

## DO NOT TOUCH
`apps/web/src/modules/learning/**`, other modules, migrations, `payload.config.ts`, `docs/**`.

## Erick handoffs
- None.

## Done when
Criteria ticked, PoC green without `.fails`, PR open with CI link, `status: complete`.

## Operating rules
Same standing rules as `tasks/W3-10-wave3-security-review.md` § Operating rules (worktree, Node 22, Neon throwaway branches, no `PAYLOAD_DB_PUSH`, never force-push, never merge, commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).

## Communication
Caveman. English only.
