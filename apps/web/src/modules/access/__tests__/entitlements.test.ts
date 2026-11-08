import type { Payload } from "payload"
import { ValidationError } from "payload"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { makeCourse, makeCustomer } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { isActiveAt, isUniqueConflict } from "../server/entitlements"

// ---------------------------------------------------------------------------
// isUniqueConflict — unit tests (no DB required)
// ---------------------------------------------------------------------------
describe("isUniqueConflict (unit)", () => {
  // Helper: plain object with a code property, simulating a raw PG error
  const pgError = (code: string) => Object.assign(new Error("pg"), { code })

  // Helper: construct a real Payload ValidationError with the given paths
  const ve = (...paths: string[]) =>
    new ValidationError({ errors: paths.map((path) => ({ message: "Value must be unique", path })) })

  // ---- TRUE cases ----------------------------------------------------------

  it("raw PG 23505 at top level", () => {
    expect(isUniqueConflict(pgError("23505"))).toBe(true)
  })

  it("PG 23505 wrapped one level deep (cause.code)", () => {
    const err = Object.assign(new Error("drizzle wrapper"), { cause: { code: "23505" } })
    expect(isUniqueConflict(err)).toBe(true)
  })

  it("PG 23505 two levels deep (cause.cause.code)", () => {
    const err = Object.assign(new Error("outer"), { cause: { cause: { code: "23505" } } })
    expect(isUniqueConflict(err)).toBe(true)
  })

  it("Payload ValidationError — all 4 unique cols as one comma-separated path", () => {
    // This matches what handleUpsertError produces when PG detail includes all columns.
    expect(isUniqueConflict(ve("customer_id, course_id, source, source_ref"))).toBe(true)
  })

  it("Payload ValidationError — single unique col path", () => {
    expect(isUniqueConflict(ve("source_ref"))).toBe(true)
  })

  it("Payload ValidationError — multiple separate errors all on unique cols", () => {
    expect(isUniqueConflict(ve("customer_id", "course_id", "source", "source_ref"))).toBe(true)
  })

  it("Payload ValidationError — FR locale message, language-independent via path inspection", () => {
    // handleUpsertError translates the message via req.t but path is always the SQL column name.
    const frVe = new ValidationError({
      errors: [{ message: "La valeur doit être unique", path: "customer_id, course_id, source, source_ref" }],
    })
    expect(isUniqueConflict(frVe)).toBe(true)
  })

  // ---- FALSE cases ---------------------------------------------------------

  it("Payload ValidationError — unrelated field (email) must NOT match", () => {
    expect(isUniqueConflict(ve("email"))).toBe(false)
  })

  it("Payload ValidationError — mix of unique col and unrelated field must NOT match", () => {
    // e.g. a constraint that spans both — treat as unrelated
    expect(isUniqueConflict(ve("customer_id, email"))).toBe(false)
  })

  it("Payload ValidationError — empty errors array must NOT match", () => {
    // Simulate via name-spoofed Error since the constructor handles empty fine
    const fake = Object.assign(new Error("ve empty"), {
      name: "ValidationError",
      data: { errors: [] },
    })
    expect(isUniqueConflict(fake)).toBe(false)
  })

  it("generic Error (non-unique message) must NOT match", () => {
    expect(isUniqueConflict(new Error("connection refused"))).toBe(false)
  })

  it("null must NOT match", () => {
    expect(isUniqueConflict(null)).toBe(false)
  })

  it("PG error with different code (23502 NOT NULL) must NOT match", () => {
    expect(isUniqueConflict(pgError("23502"))).toBe(false)
  })
})

describe("isActiveAt (boundaries)", () => {
  const from = "2026-01-01T00:00:00.000Z"
  const until = "2026-02-01T00:00:00.000Z"
  const at = (iso: string) => new Date(iso)
  it("validFrom is inclusive", () => {
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: null }, at(from))).toBe(true)
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: null }, at("2025-12-31T23:59:59.999Z"))).toBe(false)
  })
  it("validUntil is exclusive; null = no expiry", () => {
    expect(isActiveAt({ validFrom: from, validUntil: until, revokedAt: null }, at("2026-01-31T23:59:59.999Z"))).toBe(true)
    expect(isActiveAt({ validFrom: from, validUntil: until, revokedAt: null }, at(until))).toBe(false)
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: null }, at("2099-01-01T00:00:00Z"))).toBe(true)
  })
  it("revoked is never active", () => {
    expect(isActiveAt({ validFrom: from, validUntil: null, revokedAt: from }, at("2026-01-02T00:00:00Z"))).toBe(false)
  })
})

describe.skipIf(!hasTestDb)("access entitlements (integration)", () => {
  let payload: Payload
  let access: typeof import("../index")
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    access = await import("../index")
  }, 60_000)

  const count = async (customer: number | string, course: number | string, sourceRef: string) =>
    (
      await payload.count({
        collection: "entitlements",
        where: { and: [{ customer: { equals: customer } }, { course: { equals: course } }, { sourceRef: { equals: sourceRef } }] },
        overrideAccess: true,
      })
    ).totalDocs

  it("grant -> hasActive / list; respects `at`", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const from = new Date(Date.now() - 1000)
    const until = new Date(Date.now() + 60_000)
    const r = await access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref, validFrom: from, validUntil: until })
    expect(r.ok).toBe(true)
    expect(await access.hasActiveEntitlement(c.id, course.id)).toBe(true)
    expect(await access.hasActiveEntitlement(c.id, course.id, new Date(from.getTime() - 1))).toBe(false)
    expect(await access.hasActiveEntitlement(c.id, course.id, until)).toBe(false)
    const list = await access.listActiveEntitlements(c.id)
    expect(list.map((e) => e.courseId)).toEqual([course.id])
  })

  it("idempotent: sequential and concurrent x5 -> one row, same id", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const input = { customerId: c.id, courseId: course.id, source: "purchase" as const, sourceRef: ref }
    const a = await access.grantEntitlement(input)
    const b = await access.grantEntitlement(input)
    expect(a.ok && b.ok && a.data.id === b.data.id).toBe(true)

    const c2 = await makeCustomer(payload)
    const par = await Promise.all(Array.from({ length: 10 }, () => access.grantEntitlement({ ...input, customerId: c2.id })))
    expect(par.every((r) => r.ok)).toBe(true)
    expect(new Set(par.map((r) => (r.ok ? r.data.id : null))).size).toBe(1)
    expect(await count(c2.id, course.id, ref)).toBe(1)
  })

  it("revoked row is returned as-is, not un-revoked", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const i = { customerId: c.id, courseId: course.id, source: "manual" as const, sourceRef: `u-${uid()}` }
    await access.grantEntitlement(i)
    expect((await access.revokeEntitlement({ ...i, reason: "refund" })).ok).toBe(true)
    const again = await access.grantEntitlement(i)
    expect(again.ok && again.data.revokedAt).toBeTruthy()
    expect(await access.hasActiveEntitlement(c.id, course.id)).toBe(false)
  })

  it("multi-seat: one order, three customers -> three rows; revoking one leaves two", async () => {
    const course = await makeCourse(payload, "in_person")
    const ref = `ord-${uid()}`
    const customers = await Promise.all([makeCustomer(payload), makeCustomer(payload), makeCustomer(payload)])
    const res = await Promise.all(
      customers.map((c) => access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref })),
    )
    expect(res.every((r) => r.ok)).toBe(true)
    const { totalDocs } = await payload.count({
      collection: "entitlements",
      where: { and: [{ course: { equals: course.id } }, { sourceRef: { equals: ref } }] },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(3)
    const rev = await access.revokeEntitlement({ customerId: customers[0].id, courseId: course.id, source: "purchase", sourceRef: ref, reason: "seat cancelled" })
    expect(rev.ok).toBe(true)
    expect(await access.hasActiveEntitlement(customers[0].id, course.id)).toBe(false)
    expect(await access.hasActiveEntitlement(customers[1].id, course.id)).toBe(true)
    expect(await access.hasActiveEntitlement(customers[2].id, course.id)).toBe(true)
  })

  it("revoke: sets reason + revokedAt, idempotent, missing -> NOT_FOUND", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const i = { customerId: c.id, courseId: course.id, source: "gift" as const, sourceRef: `g-${uid()}` }
    expect(await access.revokeEntitlement({ ...i, reason: "x" })).toEqual({ ok: false, error: { code: "NOT_FOUND", entity: "entitlement" } })
    await access.grantEntitlement(i)
    expect((await access.revokeEntitlement({ ...i, reason: "first" })).ok).toBe(true)
    expect((await access.revokeEntitlement({ ...i, reason: "second" })).ok).toBe(true)
    const { docs } = await payload.find({ collection: "entitlements", where: { sourceRef: { equals: i.sourceRef } }, overrideAccess: true })
    expect(docs[0]?.revokedReason).toBe("first")
    expect(docs[0]?.revokedAt).toBeTruthy()
  })

  it("tx: grant joins the caller's transaction; rollback leaves no row", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, killTransaction } = await import("payload")
    await initTransaction(req)
    try {
      const r = await access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref, tx: { req } })
      expect(r.ok).toBe(true)
      expect(await count(c.id, course.id, ref)).toBe(0) // not visible outside the tx
    } finally {
      await killTransaction(req)
    }
    expect(await count(c.id, course.id, ref)).toBe(0)
  })

  it("tx: commit persists", async () => {
    const c = await makeCustomer(payload)
    const course = await makeCourse(payload, "online")
    const ref = `ord-${uid()}`
    const req = { payload } as unknown as import("payload").PayloadRequest
    const { initTransaction, commitTransaction } = await import("payload")
    await initTransaction(req)
    await access.grantEntitlement({ customerId: c.id, courseId: course.id, source: "purchase", sourceRef: ref, tx: { req } })
    await commitTransaction(req)
    expect(await count(c.id, course.id, ref)).toBe(1)
  })
})
