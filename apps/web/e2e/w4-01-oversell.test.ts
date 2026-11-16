import { test, expect } from "@playwright/test"
import type { Payload } from "payload"

import { getTestPayload, uid } from "../test/integration"
import {
  completePayment, fillBooking, openCartFromCourse, startCheckout, stubHostedCheckoutPage, useUniqueClientIp,
} from "../test/e2e-stripe/checkout"
import {
  enrollmentsOfSession, eventOutcome, expireHoldNow, findOrder, holdByCheckoutSession, holdOf, queuedEmails, waitOrder,
} from "../test/e2e-stripe/db"
import { deliver, completedPayload, fakeRefunds, fakeSession, paymentIntentOf, setFakeSessionStatus } from "../test/e2e-stripe/events"
import { archiveStripeProducts, seedPurchaseWorld, syncCoursesLive, type PurchaseWorld } from "../test/e2e-stripe/fixtures"
import { isLive, logMode, requireEnv } from "../test/e2e-stripe/mode"

/** W4-01 flow C (expired-hold oversell -> automatic refund) + hold expiry. */
test.skip(!process.env.TEST_DATABASE_URL, "needs the throwaway CI DB branch")
test.describe.configure({ mode: "serial" })

let payload: Payload
let w: PurchaseWorld
const run = uid()

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000)
  payload = await getTestPayload()
  w = await seedPurchaseWorld(payload)
  await syncCoursesLive(payload, request, [w.inPerson.id])
})
test.afterAll(async () => {
  if (w) await archiveStripeProducts(payload, [w.inPerson.id, w.online.id, w.otherOnline.id])
})
test.beforeEach(({}, info) => logMode(info))

test("C expired hold A loses the seat to B -> A refunded, B keeps the only enrollment", async ({ browser, request }) => {
  test.setTimeout(300_000)
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
  const emailA = `e2e+a-${run}@example.test`
  const emailB = `e2e+b-${run}@example.test`

  const ctxA = await browser.newContext({ baseURL })
  const pageA = await ctxA.newPage()
  await useUniqueClientIp(pageA)
  await stubHostedCheckoutPage(pageA)
  await openCartFromCourse(pageA, "en", w.inPerson.slugEn, w.sessionOne.id)
  await fillBooking(pageA, { email: emailA })
  const a = await startCheckout(pageA, "en")
  const holdA = await holdByCheckoutSession(payload, a.sessionId)
  // Past expiry only (no expire-holds cron): the Checkout session must stay payable.
  await expireHoldNow(payload, holdA.id)

  const ctxB = await browser.newContext({ baseURL })
  const pageB = await ctxB.newPage()
  await useUniqueClientIp(pageB)
  await stubHostedCheckoutPage(pageB)
  await openCartFromCourse(pageB, "en", w.inPerson.slugEn, w.sessionOne.id)
  await fillBooking(pageB, { email: emailB })
  const b = await startCheckout(pageB, "en")
  await completePayment(pageB, ctxB.request, b, { email: emailB, name: "Bob Buyer" })
  const orderB = await waitOrder(payload, b.sessionId)
  expect(orderB.status).toBe("paid")
  await expect.poll(async () => (await enrollmentsOfSession(payload, w.sessionOne.id)).length, { timeout: 60_000 }).toBe(1)

  // A now completes its still-open Checkout.
  let eventA: string | null = null
  if (isLive) {
    await pageA.waitForLoadState()
    await completePayment(pageA, ctxA.request, a, { email: emailA, name: "Ana Buyer" })
  } else {
    const info = await fakeSession(a.sessionId)
    const evt = completedPayload(info, { email: emailA, name: "Ana Buyer" })
    eventA = evt.id
    await setFakeSessionStatus(a.sessionId, "complete")
    const d = await deliver(request, evt.payload)
    expect(d.status).toBe(200)
    expect(d.outcome).toBe("refunded")
  }
  const orderA = await waitOrder(payload, a.sessionId)
  await expect.poll(async () => (await findOrder(payload, a.sessionId))?.status, { timeout: 60_000 }).toBe("refunded")
  if (eventA) expect(await eventOutcome(payload, eventA)).toBe("refunded")
  if (!isLive) {
    const refunds = await fakeRefunds(paymentIntentOf(a.sessionId))
    expect(refunds).toHaveLength(1)
    expect(refunds[0]!.amount).toBe(1000)
  }
  expect(await queuedEmails(payload, `oversell-refund-${orderA.id}`)).toHaveLength(1)
  const enr = await enrollmentsOfSession(payload, w.sessionOne.id)
  expect(enr).toHaveLength(1)
  expect(enr[0]!.order && typeof enr[0]!.order === "object" ? enr[0]!.order.id : enr[0]!.order).toBe(orderB.id)
  await ctxA.close()
  await ctxB.close()
})

test("hold expiry: unpaid hold past expiresAt + cron -> expired, Stripe session expired", async ({ page, request }) => {
  test.setTimeout(180_000)
  await useUniqueClientIp(page)
  await stubHostedCheckoutPage(page)
  await openCartFromCourse(page, "en", w.inPerson.slugEn, w.sessionHold.id)
  await fillBooking(page, { email: `e2e+h-${run}@example.test` })
  const started = await startCheckout(page, "en")
  const hold = await holdByCheckoutSession(payload, started.sessionId)
  expect((await holdOf(payload, hold.id)).status).toBe("active")
  await expireHoldNow(payload, hold.id)
  const cron = await request.get("/api/cron/expire-holds", { headers: { authorization: `Bearer ${requireEnv("CRON_SECRET")}` } })
  expect(cron.status()).toBe(200)
  expect((await holdOf(payload, hold.id)).status).toBe("expired")
  if (!isLive) {
    expect((await fakeSession(started.sessionId)).status).toBe("expired")
  } else {
    const { default: Stripe } = await import("stripe")
    const s = await new Stripe(requireEnv("STRIPE_SECRET_KEY")).checkout.sessions.retrieve(started.sessionId)
    expect(s.status).toBe("expired")
  }
})
