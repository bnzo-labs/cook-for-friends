import { test, expect } from "./fixtures"
import type { Payload } from "payload"

import { getTestPayload, uid } from "../test/integration"
import { mintLoginToken } from "../test/portal-fixtures"
import {
  completePayment, expectSuccessPage, fillBooking, openCartFromCourse, startCheckout,
  stubHostedCheckoutPage, useUniqueClientIp, type Guest,
} from "../test/e2e-stripe/checkout"
import {
  customerByEmail, enrollmentsOf, eventOutcome, holdByCheckoutSession, holdOf, purchaseEntitlements,
  queuedEmails, relId, waitOrder,
} from "../test/e2e-stripe/db"
import { deliver, fakeSession, invoiceFinalizedPayload, replayablePayload } from "../test/e2e-stripe/events"
import { archiveStripeProducts, seedPurchaseWorld, syncCoursesLive, type PurchaseWorld } from "../test/e2e-stripe/fixtures"
import { isLive, logMode, requireEnv } from "../test/e2e-stripe/mode"

/** W4-01 flow A: in-person 3 seats (buyer + 2 guests), FR. Serial: later tests reuse the order. */
test.skip(!process.env.TEST_DATABASE_URL, "needs the throwaway CI DB branch")
test.describe.configure({ mode: "serial" })

let payload: Payload
let w: PurchaseWorld
const run = uid()
const buyerEmail = `e2e+buyer-${run}@example.test`
const guests: Guest[] = [
  { firstName: "Invité", lastName: "Un", email: `e2e+g1-${run}@example.test` },
  { firstName: "Invitée", lastName: "Deux", email: `e2e+g2-${run}@example.test` },
]
const state: { sessionId?: string; orderId?: number; eventId?: string | null; payload?: string | null } = {}

test.beforeAll(async ({ request }) => {
  test.setTimeout(240_000)
  payload = await getTestPayload()
  w = await seedPurchaseWorld(payload)
  await syncCoursesLive(payload, request, [w.inPerson.id, w.online.id, w.otherOnline.id])
})
test.afterAll(async () => {
  if (w) await archiveStripeProducts(payload, [w.inPerson.id, w.online.id, w.otherOnline.id])
})
test.beforeEach(({}, info) => logMode(info))

test("A1 buy 3 seats FR -> success page, order, enrollments, entitlements, hold, jobs", async ({ page, request }) => {
  test.setTimeout(240_000)
  await useUniqueClientIp(page)
  await stubHostedCheckoutPage(page)
  await openCartFromCourse(page, "fr", w.inPerson.slugFr, w.sessionA.id)
  await fillBooking(page, { quantity: 3, email: buyerEmail, guests })
  const started = await startCheckout(page, "fr")
  state.sessionId = started.sessionId
  const paid = await completePayment(page, request, started, { email: buyerEmail, name: "Bea Buyer" })
  state.eventId = paid.eventId
  state.payload = paid.payload
  if (paid.delivery) expect(paid.delivery.outcome).toBe("applied")
  await expectSuccessPage(page, "fr")

  const order = await waitOrder(payload, started.sessionId)
  state.orderId = Number(order.id)
  expect(order.status).toBe("paid")
  expect(order.number).toMatch(/^CFF-/)
  expect(order.items?.[0]?.quantity).toBe(3)
  if (process.env.STRIPE_TAX_ENABLED !== "true") expect(order.total).toBe(3000)

  await expect.poll(async () => (await enrollmentsOf(payload, order.id)).length, { timeout: 60_000 }).toBe(3)
  const enr = await enrollmentsOf(payload, order.id)
  expect(enr.map((e) => e.status)).toEqual(["confirmed", "confirmed", "confirmed"])
  expect(enr.map((e) => e.attendeeIndex)).toEqual([0, 1, 2])
  expect(new Set(enr.map((e) => relId(e.customer))).size).toBe(3)
  expect(enr.reduce((s, e) => s + Number(e.seatAmount), 0)).toBe(order.total)
  expect((await purchaseEntitlements(payload, order.id)).length).toBe(3)
  const guest = await customerByEmail(payload, guests[0]!.email)
  expect(guest?.firstName).toBe("Invité")

  const hold = await holdByCheckoutSession(payload, started.sessionId)
  expect((await holdOf(payload, hold.id)).status).toBe("converted")
  if (paid.eventId) expect(await eventOutcome(payload, paid.eventId)).toBe("applied")

  const confirmations = await queuedEmails(payload, `order-confirmation-${order.id}`)
  expect(confirmations).toHaveLength(1)
  expect(confirmations[0]!.ics).toHaveLength(1)
  expect(JSON.stringify(confirmations[0]!.data)).toContain(guests[0]!.email)
  for (const e of enr.filter((x) => x.attendeeIndex > 0)) {
    const mails = await queuedEmails(payload, `enrollment-confirmation-${e.id}`)
    expect(mails).toHaveLength(1)
    expect(mails[0]!.ics).toHaveLength(1)
  }

  await page.goto(`/fr/cours/${w.inPerson.slugFr}`)
  await expect(page.locator(`[data-session-id="${w.sessionA.id}"]`)).toHaveAttribute("data-seats-left", "1")
})

test("A2 webhook replay leaves counts unchanged", async ({ request }) => {
  const body = await replayablePayload(state.sessionId!, state.payload ?? null)
  const delivery = await deliver(request, body)
  expect(delivery.status).toBe(200)
  expect(delivery.outcome).toBe("skipped")
  expect(await enrollmentsOf(payload, state.orderId!)).toHaveLength(3)
  const { totalDocs } = await payload.count({
    collection: "orders", where: { stripeCheckoutSessionId: { equals: state.sessionId! } }, overrideAccess: true,
  })
  expect(totalDocs).toBe(1)
})

test("A3 staff sees 3 attendees + CSV; anonymous CSV 401", async ({ page, request }) => {
  await page.goto("/admin/login")
  await page.locator("input#field-email").fill(requireEnv("E2E_STAFF_EMAIL"))
  await page.locator("input#field-password").fill(requireEnv("E2E_STAFF_PASSWORD"))
  await page.locator("form button[type=submit]").click()
  await page.waitForURL(/\/admin(\/)?$/)
  const res = await page.goto(`/admin/collections/sessions/${w.sessionA.id}`)
  expect(res?.status()).toBe(200)
  await expect(page.getByTestId("attendee-row")).toHaveCount(3)
  await expect(page.getByTestId("session-attendees")).toContainText(buyerEmail)
  await expect(page.getByTestId("session-attendees")).toContainText(guests[1]!.email)

  const csv = await page.request.get(`/api/sessions/${w.sessionA.id}/attendees.csv?locale=en`)
  expect(csv.status()).toBe(200)
  expect(csv.headers()["content-type"]).toContain("text/csv")
  const text = await csv.text()
  expect(text.startsWith("﻿")).toBe(true)
  expect(text).toContain("Booked by")
  for (const e of [buyerEmail, guests[0]!.email, guests[1]!.email]) expect(text).toContain(e)

  const anon = await request.get(`/api/sessions/${w.sessionA.id}/attendees.csv`)
  expect(anon.status()).toBe(401)
})

test("A4 receipt: invoice.finalized stores PDF; anon refused, buyer 302", async ({ page, request }) => {
  let pdfUrl: string | null = null
  if (!isLive) {
    const info = await fakeSession(state.sessionId!)
    const inv = invoiceFinalizedPayload(info)
    pdfUrl = inv.pdfUrl
    const d = await deliver(request, inv.payload)
    expect(d.status).toBe(200)
    expect(d.outcome).toBe("applied")
  }
  await expect
    .poll(async () => (await payload.findByID({ collection: "orders", id: state.orderId!, depth: 0, overrideAccess: true })).invoicePdfUrl ?? null, { timeout: 60_000 })
    .not.toBeNull()
  const anon = await request.get(`/api/orders/${state.orderId}/receipt`, { maxRedirects: 0 })
  expect([403, 404]).toContain(anon.status())

  const buyer = await customerByEmail(payload, buyerEmail)
  const token = await mintLoginToken(payload, buyer!.id)
  await page.goto(`/fr/connexion/verifier?token=${token}`)
  await page.locator("[data-verify-submit]").click()
  await page.waitForURL((u) => !u.pathname.includes("verifier"))
  const res = await page.request.get(`/api/orders/${state.orderId}/receipt`, { maxRedirects: 0 })
  expect(res.status()).toBe(302)
  if (pdfUrl) expect(res.headers().location).toBe(pdfUrl)
  // GST/QST receipt lines: deferred (D6) while STRIPE_TAX_ENABLED=false.
})
