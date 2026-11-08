/** Integration: Stripe catalog sync against real Postgres (TEST_DATABASE_URL) + fake Stripe. */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { Payload } from "payload"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { makeCourse } from "../../../../test/fixtures"
import { syncCourseToStripe, syncDiscountToStripe, syncJobTasks } from "../sync"
import { setStripeForTests } from "../server/stripe-port"
import { makeCatalogFake } from "./sync-fake-stripe"

// Remote Postgres round-trips; the default 5s per-test budget is too tight under CI load.
vi.setConfig({ testTimeout: 30_000 })

const d = hasTestDb ? describe : describe.skip

d("stripe catalog sync", () => {
  let payload: Payload
  const fake = makeCatalogFake()

  beforeAll(async () => {
    payload = await getTestPayload()
    setStripeForTests(fake.client)
  }, 60_000)
  afterEach(() => fake.clearWrites())

  const jobsFor = async (slug: string, id: number) => {
    const { docs } = await payload.find({ collection: "payload-jobs", where: { taskSlug: { equals: slug } }, limit: 500, depth: 0, pagination: false, overrideAccess: true })
    return docs.filter((j) => {
      const i = j.input as Record<string, unknown> | null
      return i?.courseId === id || i?.discountCodeId === id
    })
  }
  const reload = (id: number) => payload.findByID({ collection: "courses", id, depth: 0, overrideAccess: true })

  it("registers both tasks with retries 3", () => {
    expect(syncJobTasks.map((t) => [t.slug, t.retries])).toEqual([["stripe-sync-course", 3], ["stripe-sync-discount", 3]])
  })

  it("publish enqueues exactly one job and marks pending; draft save enqueues none", async () => {
    const draft = await makeCourse(payload, "in_person", "draft")
    expect(await jobsFor("stripe-sync-course", draft.id)).toHaveLength(0)
    await payload.update({ collection: "courses", id: draft.id, data: { title: "Brouillon 2" }, draft: true, overrideAccess: true })
    expect(await jobsFor("stripe-sync-course", draft.id)).toHaveLength(0)

    await payload.update({ collection: "courses", id: draft.id, data: { status: "published", _status: "published" }, overrideAccess: true })
    expect(await jobsFor("stripe-sync-course", draft.id)).toHaveLength(1)
    expect((await reload(draft.id)).stripeSyncStatus).toBe("pending")
  })

  it("context.skipStripeSync suppresses enqueue", async () => {
    const c = await makeCourse(payload, "online", "draft")
    await payload.update({ collection: "courses", id: c.id, data: { status: "published", _status: "published" }, context: { skipStripeSync: true }, overrideAccess: true })
    expect(await jobsFor("stripe-sync-course", c.id)).toHaveLength(0)
  })

  it("first sync, no-op resync, price change, archive", async () => {
    const c = await makeCourse(payload, "in_person")
    const first = await syncCourseToStripe(c.id)
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error("unreachable")
    expect(fake.writes).toEqual(["products.create", "prices.create", "products.update"])
    expect(fake.products.get(first.data.productId)).toMatchObject({ metadata: { payloadCourseId: String(c.id) }, default_price: first.data.priceId })
    expect(fake.prices.get(first.data.priceId)).toMatchObject({ unit_amount: 5000, currency: "cad", tax_behavior: "exclusive" })
    let row = await reload(c.id)
    expect(row).toMatchObject({ stripeSyncStatus: "synced", stripeProductId: first.data.productId, stripePriceId: first.data.priceId })

    fake.clearWrites()
    expect((await syncCourseToStripe(c.id)).ok).toBe(true)
    expect(fake.writes).toEqual([])

    await payload.update({ collection: "courses", id: c.id, data: { price: 7500, _status: "published", stripeProductId: first.data.productId, stripePriceId: first.data.priceId }, context: { skipStripeSync: true }, overrideAccess: true })
    const third = await syncCourseToStripe(c.id)
    if (!third.ok) throw new Error(JSON.stringify(third.error))
    expect(third.ok && third.data.priceId).not.toBe(first.data.priceId)
    expect(fake.prices.get(first.data.priceId)?.active).toBe(false)
    if (third.ok) expect(fake.products.get(third.data.productId)?.default_price).toBe(third.data.priceId)
    row = await reload(c.id)
    expect(row.stripePriceId).toBe(third.ok ? third.data.priceId : "")

    await payload.update({ collection: "courses", id: c.id, data: { status: "archived", _status: "published" }, context: { skipStripeSync: true }, overrideAccess: true })
    await syncCourseToStripe(c.id)
    expect(fake.products.get(first.data.productId)?.active).toBe(false)
  })

  it("recovers the product by metadata when a stale save lost the ids (no duplicate)", async () => {
    const c = await makeCourse(payload, "in_person")
    const first = await syncCourseToStripe(c.id)
    await payload.update({ collection: "courses", id: c.id, data: { stripeProductId: null, stripePriceId: null, _status: "published" }, context: { skipStripeSync: true }, overrideAccess: true })
    fake.clearWrites()
    const again = await syncCourseToStripe(c.id)
    expect(again.ok && again.data).toEqual(first.ok ? first.data : null)
    expect(fake.writes).toEqual([])
  })

  it("error path writes error status", async () => {
    const c = await makeCourse(payload, "in_person")
    fake.failNext()
    const res = await syncCourseToStripe(c.id)
    expect(res.ok).toBe(false)
    const row = await reload(c.id)
    expect(row.stripeSyncStatus).toBe("error")
    expect(row.stripeSyncError).toContain("stripe down")
  })

  it("unknown course => NOT_FOUND", async () => {
    const res = await syncCourseToStripe(2_000_000_000)
    expect(res).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } })
  })

  it("discount: create, no-op, value change replaces, deactivate", async () => {
    const course = await makeCourse(payload, "in_person")
    const cs = await syncCourseToStripe(course.id)
    const code = `SYNC${uid().toUpperCase()}`
    const dc = await payload.create({ collection: "discount-codes", data: { code, kind: "percent", value: 10, appliesTo: [course.id], active: true }, overrideAccess: true })
    expect(await jobsFor("stripe-sync-discount", dc.id)).toHaveLength(1)

    const r1 = await syncDiscountToStripe(dc.id)
    expect(r1.ok && r1.data.status).toBe("synced")
    const row1 = await payload.findByID({ collection: "discount-codes", id: dc.id, depth: 0, overrideAccess: true })
    expect(row1.stripeCouponId && row1.stripePromotionCodeId).toBeTruthy()
    expect(fake.coupons.get(row1.stripeCouponId!)).toMatchObject({ percent_off: 10, duration: "once", applies_to: { products: [cs.ok ? cs.data.productId : ""] } })
    expect(fake.promos.get(row1.stripePromotionCodeId!)).toMatchObject({ code, active: true })
    // write-back used skipStripeSync: no second job
    expect(await jobsFor("stripe-sync-discount", dc.id)).toHaveLength(1)

    fake.clearWrites()
    await syncDiscountToStripe(dc.id)
    expect(fake.writes).toEqual([])

    await payload.update({ collection: "discount-codes", id: dc.id, data: { value: 25 }, context: { skipStripeSync: true }, overrideAccess: true })
    await syncDiscountToStripe(dc.id)
    const row2 = await payload.findByID({ collection: "discount-codes", id: dc.id, depth: 0, overrideAccess: true })
    expect(row2.stripeCouponId).not.toBe(row1.stripeCouponId)
    expect(fake.promos.get(row1.stripePromotionCodeId!)?.active).toBe(false)
    expect(fake.coupons.get(row2.stripeCouponId!)).toMatchObject({ percent_off: 25 })

    await payload.update({ collection: "discount-codes", id: dc.id, data: { active: false }, context: { skipStripeSync: true }, overrideAccess: true })
    await syncDiscountToStripe(dc.id)
    expect(fake.promos.get(row2.stripePromotionCodeId!)?.active).toBe(false)
  })

  it("discount: personalFor skipped", async () => {
    const cust = await payload.create({ collection: "customers", data: { email: `p-${uid()}@example.com`, preferredLocale: "fr" } })
    const dc = await payload.create({ collection: "discount-codes", data: { code: `PERS${uid().toUpperCase()}`, kind: "amount", value: 500, personalFor: cust.id }, overrideAccess: true })
    expect(await jobsFor("stripe-sync-discount", dc.id)).toHaveLength(0)
    expect(await syncDiscountToStripe(dc.id)).toMatchObject({ ok: true, data: { status: "skipped" } })
  })
})
