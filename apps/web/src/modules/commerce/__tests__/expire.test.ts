import type { Payload } from "payload"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { setStripeForTests } from "../server/stripe-port"
import { makeFakeStripe } from "./fake-stripe"
import { addHold, guests, makeBookableSession } from "./helpers"

describe.skipIf(!hasTestDb)("expireStaleHolds (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../index")
  const fake = makeFakeStripe()
  vi.setConfig({ testTimeout: 30_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    commerce = await import("../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterAll(() => setStripeForTests(null))
  beforeEach(() => fake.reset())

  const holdById = (id: number | string) =>
    payload.findByID({ collection: "seat-holds", id, depth: 0, overrideAccess: true })

  it("expires due active holds, expires their open Checkout sessions, idempotent", async () => {
    const { session } = await makeBookableSession(payload, 10)
    const now = new Date()
    const due = await addHold(payload, session.id, { expiresAt: new Date(now.getTime() - 1000), stripeCheckoutSessionId: `cs_due_${uid()}` })
    const closed = await addHold(payload, session.id, { expiresAt: new Date(now.getTime() - 1000), stripeCheckoutSessionId: `cs_closed_${uid()}` })
    fake.closeSession(closed.stripeCheckoutSessionId as string)
    const noStripe = await addHold(payload, session.id, { expiresAt: new Date(now.getTime() - 1000) })
    const live = await addHold(payload, session.id, { expiresAt: new Date(now.getTime() + 600_000), stripeCheckoutSessionId: `cs_live_${uid()}` })

    const r = await commerce.expireStaleHolds(now)
    expect(r.expired).toBeGreaterThanOrEqual(3) // other suites may leave due holds too
    expect(fake.expires).toContain(due.stripeCheckoutSessionId)
    expect(fake.expires).not.toContain(closed.stripeCheckoutSessionId) // already closed → ignored, not an error
    expect(fake.expires).not.toContain(live.stripeCheckoutSessionId)
    expect(r.checkoutSessionsExpired).toBe(fake.expires.length)

    for (const h of [due, closed, noStripe]) expect((await holdById(h.id)).status).toBe("expired")
    expect((await holdById(live.id)).status).toBe("active")

    fake.reset()
    const again = await commerce.expireStaleHolds(now)
    expect(fake.expires).not.toContain(due.stripeCheckoutSessionId)
    expect((await holdById(due.id)).status).toBe("expired")
    expect(again.checkoutSessionsExpired).toBe(fake.expires.length)
  })

  it("7-day PII prune: empties attendees of non-active holds expired > 7 days ago only", async () => {
    const { session } = await makeBookableSession(payload, 10)
    const now = new Date()
    const day = 86_400_000
    const old = await addHold(payload, session.id, { status: "expired", quantity: 3, attendees: guests(2), expiresAt: new Date(now.getTime() - 8 * day) })
    const oldReleased = await addHold(payload, session.id, { status: "released", quantity: 2, attendees: guests(1), expiresAt: new Date(now.getTime() - 8 * day) })
    const recent = await addHold(payload, session.id, { status: "expired", quantity: 2, attendees: guests(1), expiresAt: new Date(now.getTime() - 6 * day) })
    const converted = await addHold(payload, session.id, { status: "converted", quantity: 2, attendees: guests(1), expiresAt: new Date(now.getTime() - 2 * day) })

    await commerce.expireStaleHolds(now)
    expect((await holdById(old.id)).attendees ?? []).toEqual([])
    expect((await holdById(oldReleased.id)).attendees ?? []).toEqual([])
    expect((await holdById(old.id)).quantity).toBe(3) // row itself kept
    expect((await holdById(recent.id)).attendees).toHaveLength(1)
    expect((await holdById(converted.id)).attendees).toHaveLength(1)
  })

  it("cron route: 401 without bearer, 200 JSON with it", async () => {
    const { GET } = await import("@/app/api/cron/expire-holds/route")
    const { NextRequest } = await import("next/server")
    const url = "http://localhost:3000/api/cron/expire-holds"
    expect((await GET(new NextRequest(url))).status).toBe(401)
    expect((await GET(new NextRequest(url, { headers: { authorization: "Bearer wrong" } }))).status).toBe(401)
    const res = await GET(new NextRequest(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true })
    expect(typeof body.expired).toBe("number")
    expect(typeof body.checkoutSessionsExpired).toBe("number")
  })
})
