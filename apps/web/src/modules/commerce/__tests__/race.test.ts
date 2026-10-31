import type { Payload } from "payload"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import type { Result } from "@/modules/_shared"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { newCartToken } from "../server/http"
import { setStripeForTests } from "../server/stripe-port"
import type { CheckoutResult } from "../types"
import { makeFakeStripe } from "./fake-stripe"
import { addHold, guests, holdsOf, makeBookableSession } from "./helpers"

/**
 * R5 (DISCOVERY §7): no oversell under concurrency, real Postgres, F3 lock.
 * Run against both the direct and the pooled (`-pooler`, PgBouncer) URL.
 */
describe.skipIf(!hasTestDb)("R5 seat race (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../index")
  const fake = makeFakeStripe()
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    commerce = await import("../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterAll(() => setStripeForTests(null))

  type Line = { courseId: number; sessionId: number; quantity: number; attendees?: ReturnType<typeof guests> }

  const buy = (line: Line, cartToken = newCartToken()) =>
    commerce.createCheckout({
      cart: [line],
      locale: "fr",
      customerEmail: line.quantity > 1 ? `buyer-${uid()}@example.com` : undefined,
      cartToken,
    })

  function tally(results: Result<CheckoutResult>[]) {
    const ok = results.filter((r) => r.ok).length
    const soldOut = results.filter((r) => !r.ok && r.error.code === "SOLD_OUT").length
    expect(ok + soldOut, JSON.stringify(results.filter((r) => !r.ok && r.error.code !== "SOLD_OUT"))).toBe(results.length)
    return { ok, soldOut }
  }

  it.each([2, 10])("capacity 1, %i concurrent buyers → exactly 1 ok, rest SOLD_OUT, 1 active hold", async (n) => {
    const { course, session } = await makeBookableSession(payload, 1)
    const results = await Promise.all(
      Array.from({ length: n }, () => buy({ courseId: course.id, sessionId: session.id, quantity: 1 })),
    )
    expect(tally(results)).toEqual({ ok: 1, soldOut: n - 1 })
    expect(await holdsOf(payload, session.id, "active")).toHaveLength(1)
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)
  })

  it("multi-seat: 3 left, two buyers quantity 2 concurrently → one hold of 2, other SOLD_OUT, 1 left", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    await addHold(payload, session.id, { quantity: 1 }) // someone else holds 1 → 3 left
    expect(await commerce.getAvailableSeats(session.id)).toBe(3)
    const results = await Promise.all(
      [0, 1].map(() => buy({ courseId: course.id, sessionId: session.id, quantity: 2, attendees: guests(1) })),
    )
    expect(tally(results)).toEqual({ ok: 1, soldOut: 1 })
    const active = await holdsOf(payload, session.id, "active")
    expect(active.map((h) => h.quantity).sort()).toEqual([1, 2])
    expect(await commerce.getAvailableSeats(session.id)).toBe(1)
  })

  it("10 concurrent quantity 1 for the last 3 seats → exactly 3 holds", async () => {
    const { course, session } = await makeBookableSession(payload, 3)
    const results = await Promise.all(
      Array.from({ length: 10 }, () => buy({ courseId: course.id, sessionId: session.id, quantity: 1 })),
    )
    expect(tally(results)).toEqual({ ok: 3, soldOut: 7 })
    expect(await holdsOf(payload, session.id, "active")).toHaveLength(3)
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)
  })

  it("quantity 4 with 3 left → SOLD_OUT, no hold (all-or-nothing)", async () => {
    const { course, session } = await makeBookableSession(payload, 3)
    const r = await buy({ courseId: course.id, sessionId: session.id, quantity: 4, attendees: guests(3) })
    expect(!r.ok && r.error).toEqual({ code: "SOLD_OUT", sessionId: session.id })
    expect(await holdsOf(payload, session.id)).toHaveLength(0)
    expect(await commerce.getAvailableSeats(session.id)).toBe(3)
  })

  it("double-click: same cart token twice concurrently → one active hold", async () => {
    const { course, session } = await makeBookableSession(payload, 5)
    const cart = newCartToken()
    const results = await Promise.all([0, 1].map(() => buy({ courseId: course.id, sessionId: session.id, quantity: 1 }, cart)))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await holdsOf(payload, session.id, "active")).toHaveLength(1)
    expect(await commerce.getAvailableSeats(session.id)).toBe(4)
  })
})
