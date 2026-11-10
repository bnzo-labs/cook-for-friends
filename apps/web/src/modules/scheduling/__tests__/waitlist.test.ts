/** W3-05 integration: waitlist join, notify-once FIFO, converted skip, expiry, POST /api/waitlist. */
import type { Payload } from "payload"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { getTestPayload, hasTestDb, uid } from "../../../../test/integration"
import { addHold, guests, makeBookableSession } from "../../commerce/__tests__/helpers"
import { setStripeForTests } from "../../commerce/server/stripe-port"
import { TEST_WEBHOOK_SECRET, inputOf, jobsFor, makeWebhookFake, moveSession, paidOrder } from "./ops-helpers"

describe.skipIf(!hasTestDb)("W3-05 waitlist (integration)", () => {
  let payload: Payload
  let commerce: typeof import("../../commerce")
  let scheduling: typeof import("../index")
  const fake = makeWebhookFake()
  vi.setConfig({ testTimeout: 120_000 })

  beforeAll(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET
    payload = await getTestPayload()
    commerce = await import("../../commerce")
    scheduling = await import("../index")
    setStripeForTests(fake.client)
  }, 60_000)
  afterAll(() => setStripeForTests(null))

  const entry = (sessionId: number, email: string, status: "waiting" | "notified" = "waiting", locale: "fr" | "en" = "fr") =>
    payload.create({ collection: "waitlist-entries", data: { session: sessionId, email, locale, status }, overrideAccess: true })
  const load = (id: number) => payload.findByID({ collection: "waitlist-entries", id, depth: 0, overrideAccess: true })
  const rowsFor = async (sessionId: number, email: string) =>
    (await payload.find({ collection: "waitlist-entries", where: { and: [{ session: { equals: sessionId } }, { email: { equals: email } }] }, depth: 0, overrideAccess: true })).docs

  it("joinWaitlist: normalizes email, duplicate (any case) → ok and still one row, no customer created", async () => {
    const { session } = await makeBookableSession(payload, 1)
    const email = `Wait-${uid()}@Example.com`
    const before = (await payload.count({ collection: "customers", overrideAccess: true })).totalDocs
    expect(await scheduling.joinWaitlist({ sessionId: session.id, email, locale: "fr" })).toEqual({ ok: true, data: undefined })
    expect(await scheduling.joinWaitlist({ sessionId: session.id, email: email.toUpperCase(), locale: "en" })).toEqual({ ok: true, data: undefined })
    const rows = await rowsFor(session.id, email.toLowerCase())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "waiting", locale: "fr" })
    expect(rows[0]!.customer ?? null).toBeNull()
    expect((await payload.count({ collection: "customers", overrideAccess: true })).totalDocs).toBe(before)
  })

  it("joinWaitlist: concurrent duplicates → one row; unknown / started / invalid → typed errors", async () => {
    const { session } = await makeBookableSession(payload, 1)
    const email = `race-${uid()}@example.com`
    const rs = await Promise.all([1, 2, 3, 4].map(() => scheduling.joinWaitlist({ sessionId: session.id, email, locale: "fr" })))
    expect(rs.every((r) => r.ok)).toBe(true)
    expect(await rowsFor(session.id, email)).toHaveLength(1)

    const missing = await scheduling.joinWaitlist({ sessionId: 2_000_000_000, email, locale: "fr" })
    expect(!missing.ok && missing.error.code).toBe("NOT_FOUND")
    await moveSession(payload, session.id, -1)
    const started = await scheduling.joinWaitlist({ sessionId: session.id, email: `late-${uid()}@example.com`, locale: "fr" })
    expect(!started.ok && started.error).toMatchObject({ code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" })
    const bad = await scheduling.joinWaitlist({ sessionId: session.id, email: "nope", locale: "fr" })
    expect(!bad.ok && bad.error.code).toBe("VALIDATION")
  })

  it("onSeatReleased: sold-out session → nobody notified; seat free → next 3 FIFO, once each", async () => {
    const { course, session } = await makeBookableSession(payload, 2)
    const hold = await addHold(payload, session.id, { quantity: 2, attendees: guests(1) })
    const { completedEvent, sign } = await import("../../commerce/__tests__/webhook-helpers")
    const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: 2 })
    const { raw, signature } = sign(c.event())
    expect((await commerce.handleStripeEvent(raw, signature)).ok).toBe(true)
    expect(await commerce.getAvailableSeats(session.id)).toBe(0)

    const ids = []
    for (let i = 0; i < 5; i += 1) ids.push((await entry(session.id, `fifo-${i}-${uid()}@example.com`, "waiting", i === 0 ? "en" : "fr")).id)
    await scheduling.onSeatReleased(session.id)
    for (const id of ids) expect((await load(id)).status).toBe("waiting") // full → no notice

    // free one seat (as a cancellation does)
    const seats = await payload.find({ collection: "enrollments", where: { session: { equals: session.id } }, depth: 0, overrideAccess: true })
    const freed = await commerce.executeSeatCancellation({ enrollmentId: seats.docs[1]!.id, outcome: "none", amount: 0, by: "staff", actorId: 1, reason: "test" })
    expect(freed.ok).toBe(true)
    expect(await commerce.getAvailableSeats(session.id)).toBe(1)

    await scheduling.onSeatReleased(session.id)
    const statuses = await Promise.all(ids.map(async (id) => (await load(id)).status))
    expect(statuses).toEqual(["notified", "notified", "notified", "waiting", "waiting"])
    const first = await jobsFor(payload, `waitlist-${ids[0]}`)
    expect(first).toHaveLength(1)
    const mail = inputOf(first[0]!)
    expect(mail).toMatchObject({ template: "waitlist-seat-available", locale: "en" })
    expect(String(mail.data.bookUrl)).toMatch(new RegExp(`^https?://[^/]+/en/courses/`))
    expect(mail.data.courseTitle).toBeTruthy()

    // a second release notifies the NEXT ones, never the same entry twice
    await scheduling.onSeatReleased(session.id)
    const after = await Promise.all(ids.map(async (id) => (await load(id)).status))
    expect(after).toEqual(["notified", "notified", "notified", "notified", "notified"])
    for (const id of ids) expect(await jobsFor(payload, `waitlist-${id}`)).toHaveLength(1)
  })

  it("concurrent onSeatReleased ×3 → each entry notified exactly once", async () => {
    const { session } = await makeBookableSession(payload, 6)
    const ids = []
    for (let i = 0; i < 7; i += 1) ids.push((await entry(session.id, `cc-${i}-${uid()}@example.com`)).id)
    await Promise.all([1, 2, 3].map(() => scheduling.onSeatReleased(session.id)))
    let notified = 0
    for (const id of ids) {
      const jobs = await jobsFor(payload, `waitlist-${id}`)
      expect(jobs.length).toBeLessThanOrEqual(1)
      const e = await load(id)
      expect(e.status === "notified").toBe(jobs.length === 1)
      if (e.status === "notified") {
        notified += 1
        expect(e.notifiedAt).toBeTruthy()
      }
    }
    expect(notified).toBeGreaterThanOrEqual(3)
  })

  it("an email that already holds a confirmed seat → converted, not emailed, and does not use the quota", async () => {
    const o = await paidOrder(payload, commerce, fake, { quantity: 2, startsInHours: 100 })
    const holderEmail = (await payload.findByID({ collection: "customers", id: o.seats[1]!.customer as number, depth: 0, overrideAccess: true })).email
    const holder = await entry(o.session.id, holderEmail.toUpperCase())
    const others = []
    for (let i = 0; i < 3; i += 1) others.push((await entry(o.session.id, `ok-${i}-${uid()}@example.com`)).id)

    await scheduling.onSeatReleased(o.session.id)
    expect((await load(holder.id)).status).toBe("converted")
    expect(await jobsFor(payload, `waitlist-${holder.id}`)).toHaveLength(0)
    for (const id of others) {
      expect((await load(id)).status).toBe("notified")
      expect(await jobsFor(payload, `waitlist-${id}`)).toHaveLength(1)
    }
  })

  it("never throws for an unknown session; session already started → nobody notified", async () => {
    await expect(scheduling.onSeatReleased(2_000_000_000)).resolves.toBeUndefined()
    const { session } = await makeBookableSession(payload, 6)
    const e = await entry(session.id, `past-${uid()}@example.com`)
    await moveSession(payload, session.id, -1)
    await scheduling.onSeatReleased(session.id)
    expect((await load(e.id)).status).toBe("waiting")
  })

  it("sendDueReminders sweep expires waiting + notified entries of started sessions", async () => {
    const { session } = await makeBookableSession(payload, 6)
    const w = await entry(session.id, `ex1-${uid()}@example.com`)
    const n = await entry(session.id, `ex2-${uid()}@example.com`, "notified")
    const future = await makeBookableSession(payload, 6)
    const keep = await entry(future.session.id, `keep-${uid()}@example.com`)
    await moveSession(payload, session.id, -3)
    await scheduling.sendDueReminders()
    expect((await load(w.id)).status).toBe("expired")
    expect((await load(n.id)).status).toBe("expired")
    expect((await load(keep.id)).status).toBe("waiting")
  })

  describe("POST /api/waitlist (route handler)", () => {
    const post = (body: unknown, headers: Record<string, string> = {}) =>
      new Request("http://localhost:3000/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers },
        body: JSON.stringify(body),
      })

    it("valid → 200 { ok: true }; duplicate → 200 and still one row", async () => {
      const { session } = await makeBookableSession(payload, 1)
      const email = `route-${uid()}@example.com`
      const body = { sessionId: session.id, email, locale: "fr" }
      const a = await scheduling.handleWaitlist(post(body))
      expect(a.status).toBe(200)
      expect(await a.json()).toEqual({ ok: true })
      expect((await scheduling.handleWaitlist(post(body))).status).toBe(200)
      expect(await rowsFor(session.id, email)).toHaveLength(1)
    })

    it("invalid body → 400; foreign Origin → 403; unknown session → 404", async () => {
      expect((await scheduling.handleWaitlist(post({ sessionId: "x", email: "a", locale: "zz" }))).status).toBe(400)
      expect((await scheduling.handleWaitlist(post({ sessionId: 1, email: "a@example.com", locale: "fr" }, { origin: "https://evil.example" }))).status).toBe(403)
      expect((await scheduling.handleWaitlist(post({ sessionId: 2_000_000_000, email: `u-${uid()}@example.com`, locale: "fr" }))).status).toBe(404)
    })

    it("6th request from one IP in an hour → 429 with retry-after", async () => {
      const { session } = await makeBookableSession(payload, 1)
      const ip = { "x-forwarded-for": `172.16.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` }
      const statuses = []
      for (let i = 0; i < 6; i += 1) {
        statuses.push((await scheduling.handleWaitlist(post({ sessionId: session.id, email: `ip-${i}-${uid()}@example.com`, locale: "fr" }, ip))).status)
      }
      expect(statuses).toEqual([200, 200, 200, 200, 200, 429])
      const limited = await scheduling.handleWaitlist(post({ sessionId: session.id, email: `ip-x-${uid()}@example.com`, locale: "fr" }, ip))
      expect(limited.status).toBe(429)
      expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0)
    })

    it("4th request for one email (different IPs) → 429", async () => {
      const { session } = await makeBookableSession(payload, 1)
      const email = `em-${uid()}@example.com`
      const statuses = []
      for (let i = 0; i < 4; i += 1) statuses.push((await scheduling.handleWaitlist(post({ sessionId: session.id, email, locale: "fr" }))).status)
      expect(statuses).toEqual([200, 200, 200, 429])
    })
  })
})
