import type { Payload } from "payload"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { makeCustomer } from "../../../../test/fixtures"
import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { CART_COOKIE, newCartToken } from "../server/http"
import { setStripeForTests } from "../server/stripe-port"
import { makeFakeStripe } from "./fake-stripe"
import { guests, holdsOf, makeBookableSession, makePurchasableCourse } from "./helpers"

describe.skipIf(!hasTestDb)("createCheckout / releaseCartHolds (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../index")
  const fake = makeFakeStripe()
  vi.setConfig({ testTimeout: 60_000 })

  beforeAll(async () => {
    payload = await getTestPayload()
    commerce = await import("../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterAll(() => setStripeForTests(null))
  beforeEach(() => fake.reset())

  const buyer = () => `buyer-${uid()}@example.com`
  const holdById = (id: number | string) => payload.findByID({ collection: "seat-holds", id, depth: 0, overrideAccess: true })

  it("3 seats: one hold (quantity 3, buyer email, attendees in order) + Stripe params", async () => {
    const { course, session } = await makeBookableSession(payload, 5)
    const email = buyer()
    const g = guests(2)
    const cartToken = newCartToken()
    const before = Date.now()
    const r = await commerce.createCheckout({
      cart: [{ courseId: course.id, sessionId: session.id, quantity: 3, attendees: [{ ...g[0]!, email: ` ${g[0]!.email.toUpperCase()} ` }, g[1]!] }],
      locale: "fr",
      customerEmail: email,
      cartToken,
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(new URL(r.data.checkoutUrl).host).toBe("checkout.stripe.com")
    expect(r.data.holdIds).toHaveLength(1)

    const hold = await holdById(r.data.holdIds[0]!)
    expect(hold).toMatchObject({ quantity: 3, customerEmail: email, cartToken, status: "active" })
    expect(hold.attendees?.map(({ firstName, lastName, email }) => ({ firstName, lastName, email }))).toEqual(g)
    expect(new Date(hold.expiresAt).toISOString()).toBe(r.data.holdExpiresAt)
    const exp = new Date(r.data.holdExpiresAt).getTime()
    expect(exp).toBeGreaterThan(before)
    expect(exp).toBeLessThanOrEqual(Date.now() + 60 * 60_000)

    expect(fake.creates).toHaveLength(1)
    const { params, options } = fake.creates[0]!
    expect(options?.idempotencyKey).toBe(`hold-${hold.id}`)
    expect(params.line_items).toEqual([{ price: expect.stringMatching(/^price_test_/), quantity: 3 }])
    expect(params.metadata).toEqual({
      cartToken,
      holdId: String(hold.id),
      courseId: String(course.id),
      sessionId: String(session.id),
      locale: "fr",
      quantity: "3",
    })
    expect(params.customer_email).toBe(email)
    expect(JSON.stringify(params)).not.toContain(g[0]!.email)
    expect(hold.stripeCheckoutSessionId).toMatch(/^cs_test_fake_/)
    expect(await commerce.getAvailableSeats(session.id)).toBe(2)
  })

  it("guest email of an existing customer → ok, identical response shape", async () => {
    const existing = await makeCustomer(payload)
    const { course, session } = await makeBookableSession(payload, 5)
    const known = await commerce.createCheckout({
      cart: [{ courseId: course.id, sessionId: session.id, quantity: 2, attendees: [{ firstName: "A", lastName: "B", email: existing.email }] }],
      locale: "en",
      customerEmail: buyer(),
      cartToken: newCartToken(),
    })
    const unknown = await commerce.createCheckout({
      cart: [{ courseId: course.id, sessionId: session.id, quantity: 2, attendees: guests(1) }],
      locale: "en",
      customerEmail: buyer(),
      cartToken: newCartToken(),
    })
    expect(known.ok && unknown.ok).toBe(true)
    if (!known.ok || !unknown.ok) return
    expect(Object.keys(known.data).sort()).toEqual(Object.keys(unknown.data).sort())
    expect(typeof known.data.checkoutUrl).toBe(typeof unknown.data.checkoutUrl)
  })

  it("re-checkout with the same cart releases the previous hold (quantity 3 frees 3) and expires its session", async () => {
    const { course, session } = await makeBookableSession(payload, 4)
    const cartToken = newCartToken()
    const email = buyer()
    const first = await commerce.createCheckout({
      cart: [{ courseId: course.id, sessionId: session.id, quantity: 3, attendees: guests(2) }],
      locale: "fr",
      customerEmail: email,
      cartToken,
    })
    expect(first.ok).toBe(true)
    expect(await commerce.getAvailableSeats(session.id)).toBe(1)
    const firstHold = await holdById((first.ok && first.data.holdIds[0]) as number)

    // 4 seats would not fit next to the old hold of 3; releasing it first makes room.
    const second = await commerce.createCheckout({
      cart: [{ courseId: course.id, sessionId: session.id, quantity: 4, attendees: guests(3) }],
      locale: "fr",
      customerEmail: email,
      cartToken,
    })
    expect(second.ok).toBe(true)
    expect((await holdById(firstHold.id)).status).toBe("released")
    expect(fake.expires).toContain(firstHold.stripeCheckoutSessionId)
    expect(await holdsOf(payload, session.id, "active")).toHaveLength(1)
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)
  })

  it("SOLD_OUT leaves the cart's previous hold untouched (rollback)", async () => {
    const { course, session } = await makeBookableSession(payload, 3)
    const cartToken = newCartToken()
    const email = buyer()
    const first = await commerce.createCheckout({ cart: [{ courseId: course.id, sessionId: session.id, quantity: 2, attendees: guests(1) }], locale: "fr", customerEmail: email, cartToken })
    expect(first.ok).toBe(true)
    const r = await commerce.createCheckout({ cart: [{ courseId: course.id, sessionId: session.id, quantity: 4, attendees: guests(3) }], locale: "fr", customerEmail: email, cartToken })
    expect(!r.ok && r.error.code).toBe("SOLD_OUT")
    expect(await holdsOf(payload, session.id, "active")).toHaveLength(1)
    expect(await commerce.getAvailableSeats(session.id)).toBe(1)
  })

  it("releaseCartHolds: frees all 3 seats, expires the session, then 0", async () => {
    const { course, session } = await makeBookableSession(payload, 3)
    const cartToken = newCartToken()
    const r = await commerce.createCheckout({ cart: [{ courseId: course.id, sessionId: session.id, quantity: 3, attendees: guests(2) }], locale: "fr", customerEmail: buyer(), cartToken })
    expect(r.ok).toBe(true)
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)
    expect(await commerce.releaseCartHolds(cartToken)).toEqual({ released: 1 })
    expect(fake.expires).toHaveLength(1)
    expect(await commerce.getAvailableSeats(session.id)).toBe(3)
    expect(await commerce.releaseCartHolds(cartToken)).toEqual({ released: 0 })
    expect(await commerce.releaseCartHolds("not a token")).toEqual({ released: 0 })
  })

  it("Stripe failure → UPSTREAM and the hold becomes released", async () => {
    const { course, session } = await makeBookableSession(payload, 2)
    fake.failNextCreate()
    const r = await commerce.createCheckout({ cart: [{ courseId: course.id, sessionId: session.id, quantity: 2, attendees: guests(1) }], locale: "fr", customerEmail: buyer(), cartToken: newCartToken() })
    expect(!r.ok && r.error).toMatchObject({ code: "UPSTREAM", service: "stripe" })
    const holds = await holdsOf(payload, session.id)
    expect(holds.map((h) => h.status)).toEqual(["released"])
    expect(await commerce.getAvailableSeats(session.id)).toBe(2)
  })

  it("online: no hold, no sessionId/holdId metadata, quantity 1", async () => {
    const course = await makePurchasableCourse(payload, "online")
    const cartToken = newCartToken()
    const r = await commerce.createCheckout({ cart: [{ courseId: course.id, quantity: 1 }], locale: "en", cartToken })
    expect(r.ok && r.data.holdIds).toEqual([])
    expect(fake.creates[0]?.params.metadata).toEqual({ cartToken, courseId: String(course.id), locale: "en", quantity: "1" })
    expect(fake.creates[0]?.options).toBeUndefined()
  })

  it("cancelled and past sessions are rejected, no hold", async () => {
    const { course, session } = await makeBookableSession(payload, 5)
    await payload.update({ collection: "sessions", id: session.id, data: { status: "cancelled" }, overrideAccess: true })
    const cancelled = await commerce.createCheckout({ cart: [{ courseId: course.id, sessionId: session.id, quantity: 1 }], locale: "fr", cartToken: newCartToken() })
    expect(!cancelled.ok && cancelled.error).toEqual({ code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" })

    const past = await payload.create({
      collection: "sessions",
      data: { course: course.id, startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date().toISOString(), capacity: 5, status: "scheduled" },
      overrideAccess: true,
    })
    const r = await commerce.createCheckout({ cart: [{ courseId: course.id, sessionId: past.id, quantity: 1 }], locale: "fr", cartToken: newCartToken() })
    expect(!r.ok && r.error).toEqual({ code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" })
    expect(await holdsOf(payload, session.id)).toHaveLength(0)
    expect(await holdsOf(payload, past.id)).toHaveLength(0)
    expect(fake.creates).toHaveLength(0)
  })

  describe("validation (no hold, no Stripe call)", () => {
    let courseId: number
    let sessionId: number
    let onlineId: number
    beforeAll(async () => {
      const { course, session } = await makeBookableSession(payload, 10)
      courseId = course.id
      sessionId = session.id
      onlineId = (await makePurchasableCourse(payload, "online")).id
    })

    const email = "buyer-fixed@example.com"
    const cases: [string, () => Parameters<typeof import("../index").createCheckout>[0], string][] = [
      ["two lines", () => ({ cart: [{ courseId, sessionId, quantity: 1 }, { courseId, sessionId, quantity: 1 }], locale: "fr", cartToken: newCartToken() }), "lines"],
      ["quantity 0", () => ({ cart: [{ courseId, sessionId, quantity: 0 }], locale: "fr", cartToken: newCartToken() }), "lines.0.quantity"],
      ["quantity > 10", () => ({ cart: [{ courseId, sessionId, quantity: 11 }], locale: "fr", customerEmail: email, cartToken: newCartToken() }), "lines.0.quantity"],
      // "> staff max" is covered in checkout-unit.test.ts (settings 2 → 3): mutating the
      // shared site-settings global here would race other suites.
      ["non-integer quantity", () => ({ cart: [{ courseId, sessionId, quantity: 1.5 }], locale: "fr", cartToken: newCartToken() }), "lines.0.quantity"],
      ["online quantity 2", () => ({ cart: [{ courseId: onlineId, quantity: 2 }], locale: "fr", customerEmail: email, cartToken: newCartToken() }), "lines.0.quantity"],
      ["N > 1 without email", () => ({ cart: [{ courseId, sessionId, quantity: 2, attendees: guests(1) }], locale: "fr", cartToken: newCartToken() }), "email"],
      ["attendee count ≠ N − 1", () => ({ cart: [{ courseId, sessionId, quantity: 3, attendees: guests(1) }], locale: "fr", customerEmail: email, cartToken: newCartToken() }), "lines.0.attendees"],
      ["guest = buyer (case/space)", () => ({ cart: [{ courseId, sessionId, quantity: 2, attendees: [{ firstName: "A", lastName: "B", email: "  BUYER-fixed@Example.com " }] }], locale: "fr", customerEmail: email, cartToken: newCartToken() }), "lines.0.attendees.0.email"],
      ["duplicate guests", () => ({ cart: [{ courseId, sessionId, quantity: 3, attendees: [{ firstName: "A", lastName: "B", email: "dup@example.com" }, { firstName: "C", lastName: "D", email: "DUP@example.com" }] }], locale: "fr", customerEmail: email, cartToken: newCartToken() }), "lines.0.attendees.1.email"],
    ]

    it.each(cases)("%s → VALIDATION at %s", async (_label, input, path) => {
      const r = await commerce.createCheckout(input())
      expect(!r.ok && r.error.code).toBe("VALIDATION")
      expect(!r.ok && r.error.code === "VALIDATION" && r.error.issues.map((i) => i.path)).toContain(path)
      expect(await holdsOf(payload, sessionId)).toHaveLength(0)
      expect(fake.creates).toHaveLength(0)
    })

    it("duplicate guest message key", async () => {
      const r = await commerce.createCheckout(cases[8]![1]())
      expect(!r.ok && r.error.code === "VALIDATION" && r.error.issues).toEqual([
        { path: "lines.0.attendees.1.email", message: "errors.ATTENDEE_EMAIL_DUPLICATE" },
      ])
    })
  })

  describe("routes", () => {
    const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
    const post = async (path: "/api/checkout" | "/api/checkout/release", body: unknown, headers: Record<string, string> = {}) => {
      const mod = path === "/api/checkout" ? await import("@/app/api/checkout/route") : await import("@/app/api/checkout/release/route")
      return mod.POST(
        new Request(`http://localhost:3000${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip(), ...headers },
          body: JSON.stringify(body),
        }),
      )
    }

    it("POST /api/checkout: 200, sets cff_cart (HttpOnly, Lax, 30d, /) when absent", async () => {
      const { course, session } = await makeBookableSession(payload, 3)
      const res = await post("/api/checkout", { lines: [{ courseId: course.id, sessionId: session.id, quantity: 1 }], locale: "fr" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(Object.keys(body.data).sort()).toEqual(["checkoutUrl", "holdExpiresAt"])
      const cookie = res.headers.get("set-cookie") ?? ""
      expect(cookie).toMatch(new RegExp(`^${CART_COOKIE}=[A-Za-z0-9_-]{43}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax`))
      const token = cookie.split(";")[0]!.split("=")[1]!
      const [hold] = await holdsOf(payload, session.id, "active")
      expect(hold?.cartToken).toBe(token)

      // existing cookie → reused, no new Set-Cookie; release route frees the hold
      const again = await post("/api/checkout", { lines: [{ courseId: course.id, sessionId: session.id, quantity: 1 }], locale: "fr" }, { cookie: `${CART_COOKIE}=${token}` })
      expect(again.status).toBe(200)
      expect(again.headers.get("set-cookie")).toBeNull()
      const rel = await post("/api/checkout/release", {}, { cookie: `${CART_COOKIE}=${token}` })
      expect(rel.status).toBe(200)
      expect(await rel.json()).toEqual({ ok: true, data: { released: 1 } })
      expect(await commerce.getAvailableSeats(session.id)).toBe(3)
    })

    it("POST /api/checkout: invalid body → 400 envelope with field paths", async () => {
      const res = await post("/api/checkout", { lines: [{ courseId: 1, quantity: 0 }], locale: "xx" })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.ok).toBe(false)
      expect(body.error.code).toBe("VALIDATION")
      expect(body.error.messageKey).toBe("errors.VALIDATION")
      expect(body.error.details.issues.map((i: { path: string }) => i.path)).toEqual(expect.arrayContaining(["lines.0.quantity", "locale"]))
      const garbage = await post("/api/checkout", "not json")
      expect(garbage.status).toBe(400)
    })

    it("POST /api/checkout: SOLD_OUT → 409 with details.available", async () => {
      const { course, session } = await makeBookableSession(payload, 1)
      const res = await post("/api/checkout", { lines: [{ courseId: course.id, sessionId: session.id, quantity: 2, attendees: guests(1) }], locale: "fr", email: buyer() })
      expect(res.status).toBe(409)
      expect(await res.json()).toEqual({ ok: false, error: { code: "SOLD_OUT", messageKey: "errors.SOLD_OUT", details: { available: 1 } } })
    })

    it("POST /api/checkout: unpurchasable course → 409 errors.COURSE_NOT_PURCHASABLE; Stripe down → 502", async () => {
      const draft = await payload.create({ collection: "courses", data: { title: "Draft", slug: `draft-${uid()}`, format: "online", price: 100, status: "draft", _status: "draft" }, overrideAccess: true })
      const res = await post("/api/checkout", { lines: [{ courseId: draft.id, quantity: 1 }], locale: "fr" })
      expect(res.status).toBe(409)
      expect((await res.json()).error.messageKey).toBe("errors.COURSE_NOT_PURCHASABLE")

      const online = await makePurchasableCourse(payload, "online")
      fake.failNextCreate()
      const down = await post("/api/checkout", { lines: [{ courseId: online.id, quantity: 1 }], locale: "fr" })
      expect(down.status).toBe(502)
      expect(await down.json()).toEqual({ ok: false, error: { code: "UPSTREAM", messageKey: "errors.UPSTREAM" } })
    })

    it("cross-site Origin → 403 on both routes", async () => {
      const evil = { origin: "https://evil.example.net" }
      expect((await post("/api/checkout", {}, evil)).status).toBe(403)
      expect((await post("/api/checkout/release", {}, evil)).status).toBe(403)
    })

    it("11th checkout from one IP within the hour → 429 errors.CHECKOUT_RATE_LIMITED", async () => {
      const fixed = ip()
      for (let i = 0; i < 10; i++) {
        expect((await post("/api/checkout", {}, { "x-forwarded-for": fixed })).status).toBe(400)
      }
      const res = await post("/api/checkout", {}, { "x-forwarded-for": fixed })
      expect(res.status).toBe(429)
      expect(res.headers.get("retry-after")).toMatch(/^\d+$/)
      expect(await res.json()).toEqual({ ok: false, error: { code: "RATE_LIMITED", messageKey: "errors.CHECKOUT_RATE_LIMITED" } })
    })

    it("POST /api/checkout/release without cookie → 200 { released: 0 }", async () => {
      const res = await post("/api/checkout/release", {})
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true, data: { released: 0 } })
    })
  })
})
