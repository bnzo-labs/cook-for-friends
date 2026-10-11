---
type: task
id: W1-02
status: pending
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
- [ ] Each collection/global in CONTRACT §3 exists in its owning module folder (`src/modules/<module>/collections/<slug>.ts`) and is exported via that module's `<module>Collections` / `catalogGlobals` array. `payload.config.ts` is **not** edited beyond replacing the W1-01 temporary `users` stub.
- [ ] Field names, types, enums and relations match CONTRACT §3 exactly. `L` fields have `localized: true`.
- [ ] `users`: auth with local strategy, `role` select, `admin.user = 'users'`. `customers`: `auth: { disableLocalStrategy: true }` (strategy added by W1-03), `access.admin: () => false`.
- [ ] Every UNIQUE constraint in CONTRACT §3 is enforced at the DB level (Payload `unique: true` for single fields, a custom migration SQL for composite uniques). A Vitest integration test inserts a duplicate for each composite unique and asserts failure.
- [ ] Indexes `(course, startsAt)` on sessions and `(session, status, expiresAt)` on seat-holds exist in the migration.
- [ ] Access control matches §3.7. Tests: an anonymous request cannot read lessons, materials or entitlements; a customer cannot read another customer's order.
- [ ] `courses` has drafts enabled. `stripeProductId`, `stripePriceId` and `stripeSyncStatus` are `admin.readOnly`.
- [ ] `sessions.course` filter only allows courses with `format = 'in_person'` (validate).
- [ ] Money fields are integers (cents) with `min: 0`. Admin displays them via a custom cell/field showing `$` formatting (simple component inside the owning module).
- [ ] The admin groups collections: "Catalogue", "Ventes", "Clients", "Apprentissage", "Paramètres". Labels in FR + EN.
- [ ] Initial migration `0001_init` is generated and committed. It runs cleanly on a fresh Neon branch.
- [ ] `pnpm seed` creates: 1 admin + 1 staff user, 2 in-person courses with 3 sessions each (one capacity 1), 2 online courses with 3 lessons each, 1 product, 1 home page with all 5 blocks, `site-settings`, and a `cancellation-policy` seeded with the D1 defaults. All content is in FR and EN.
- [ ] `pnpm payload generate:types` output is committed.

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
