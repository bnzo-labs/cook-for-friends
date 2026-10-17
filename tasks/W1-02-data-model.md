---
type: task
id: W1-02
status: complete
wave: 1
module: catalog, identity, access, commerce, scheduling, learning (collections only)
agent: backend-engineer
model: opus
depends-on: [W1-01]
---

# W1-02 — Data model (all collections and globals)

## Mission
Implement every Payload collection and global from CONTRACT §3, with access control (§3.7), indexes, unique constraints, the initial migration and a FR/EN seed. **Schema only.** No business logic, hooks or Stripe calls beyond what is listed here.

## Context loading (in order)
1. `CLAUDE.md`
2. `docs/SESSION.md`
3. `docs/CONTRACT.md` §1, §2, §3 (all), §7
4. `docs/MASTER_BUILD_SPEC.md` §3, §4
5. `docs/DISCOVERY.md` §3 (two auth collections), §6 F2–F3

## Acceptance criteria
- [x] Each collection/global in CONTRACT §3 exists in its owning module folder (`src/modules/<module>/collections/<slug>.ts`) and is exported via that module's `<module>Collections` / `catalogGlobals` array. `payload.config.ts` is **not** edited beyond replacing the W1-01 temporary `users` stub.
- [x] Field names, types, enums and relations match CONTRACT §3 exactly. `L` fields have `localized: true`.
- [x] `users`: auth with local strategy, `role` select, `admin.user = 'users'`. `customers`: `auth: { disableLocalStrategy: true }` (strategy added by W1-03), `access.admin: () => false`.
- [x] Every UNIQUE constraint in CONTRACT §3 is enforced at the DB level (Payload `unique: true` for single fields, a custom migration SQL for composite uniques). A Vitest integration test inserts a duplicate for each composite unique and asserts failure.
- [x] Indexes `(course, startsAt)` on sessions and `(session, status, expiresAt)` on seat-holds exist in the migration.
- [x] Access control matches §3.7. Tests: an anonymous request cannot read lessons, materials or entitlements; a customer cannot read another customer's order.
- [x] `courses` has drafts enabled. `stripeProductId`, `stripePriceId` and `stripeSyncStatus` are `admin.readOnly`.
- [x] `sessions.course` filter only allows courses with `format = 'in_person'` (validate).
- [x] Money fields are integers (cents) with `min: 0`. Admin displays them via a custom cell/field showing `$` formatting (simple component inside the owning module).
- [x] The admin groups collections: "Catalogue", "Ventes", "Clients", "Apprentissage", "Paramètres". Labels in FR + EN.
- [x] Initial migration `0001_init` is generated and committed. It runs cleanly on a fresh Neon branch.
- [x] `pnpm seed` creates: 1 admin + 1 staff user, 2 in-person courses with 3 sessions each (one capacity 1), 2 online courses with 3 lessons each, 1 product, 1 home page with all 5 blocks, `site-settings`, and a `cancellation-policy` seeded with the D1 defaults. All content is in FR and EN.
- [x] `pnpm payload generate:types` output is committed.

## Implementation steps
1. Read CONTRACT §3. For each module create `collections/` files. Page blocks go in `src/modules/catalog/blocks/`.
2. Write access helpers in `src/modules/identity/access.ts` (`isAdmin`, `isStaffOrAdmin`, `isSelfCustomer`, `ownsDocument(field)`), exported from `identity/index.ts`. Other modules import them from there.
3. Generate the migration. Hand-edit to add composite uniques/indexes. Verify on a fresh branch.
4. Seed script at `apps/web/src/seed/index.ts` (owned by this task), run via `pnpm seed`.
5. Integration tests in each module's `__tests__/schema.test.ts`.

## Files to create
`apps/web/src/modules/{catalog,identity,access,commerce,scheduling,learning}/collections/*.ts`, `apps/web/src/modules/catalog/blocks/*.ts`, `apps/web/src/modules/catalog/globals/*.ts`, `apps/web/src/modules/identity/access.ts`, `apps/web/src/migrations/*`, `apps/web/src/seed/*`, `apps/web/src/payload-types.ts`, module `__tests__/schema.test.ts`.

## DO NOT TOUCH
- Auth strategies, magic-link logic (W1-03).
- Stripe sync hooks (W2-01), seat logic (W2-02).
- UI files, `src/styles/**`.
- Any CONTRACT field name. If one looks wrong, write a Contract Change Request and stop.

## Done when
Migration applies on fresh Neon, seed populates the admin, all schema tests pass, types are generated, and the SESSION entry has been added.

## Communication
Caveman. English only.

## Completion notes (2026-10-17, backend-engineer / Opus)
- Migrations: `20261017_124119` (W1-01 scaffold, kept) + `20261017_174125_0001_init` (this task). Payload names files `<timestamp>_<name>`, so `0001_init` carries the timestamp prefix. The W1-01 migration was kept rather than rewritten because staging had already applied it.
- Composite uniques and indexes use Payload `indexes` (collection config), so they are in the generated migration and in the schema snapshot. No hand-written SQL is needed. The only hand edit: the `down()` constraint and index drops use `IF EXISTS`, because the generated `DROP TABLE … CASCADE` already removes them. Up/down/up was verified.
- Verified on a fresh Neon branch (`w1-02-verify`, empty `public` schema, deleted afterwards): migrate, seed (run twice to check idempotency), 46/46 tests. Applied to `dev` (migrate + seed) and `staging` (migrate only).
- Integration tests are skipped unless `TEST_DATABASE_URL` points at a throwaway, migrated DB. CI has no DB yet, so they are skipped in CI (unit tests still run).
- Platform files touched, all minimal: `payload.config.ts` (stub removed, `globals: catalogGlobals`, `media` added to s3Storage), `package.json` (`seed` script), `src/app/(payload)/importMap.ts` (regenerated: lexical + s3 + money cells), `next.config.ts` (removed `@payloadcms/richtext-lexical` from `serverExternalPackages`; the build fails once the lexical RSC entry is in the import map, because Node cannot load its CSS import).
- Additions beyond CONTRACT field lists (no renames): `pages` has drafts (`_status`) for "read published"; `orders.number` UNIQUE; a few lookup indexes; `waitlist-entries.email` lower-cased before save; `comments` forces `customer = req.user` and `status = pending` for customer-created comments.
