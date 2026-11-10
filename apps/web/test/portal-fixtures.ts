/**
 * Portal seed helpers (W3-01). Real Postgres via the Local API, throwaway
 * branch only (TEST_DATABASE_URL). Fictional data, @example.com only.
 */
import { createHash, randomBytes } from "node:crypto"
import type { Payload } from "payload"

import { makeCourse, makeSession } from "./fixtures"
import { uid } from "./integration"

type Course = Awaited<ReturnType<typeof makeCourse>>

export async function makeNamedCustomer(
  payload: Payload,
  over: { firstName?: string; lastName?: string; locale?: "fr" | "en" } = {},
) {
  return payload.create({
    collection: "customers",
    data: {
      email: `portal-${uid()}@example.com`,
      preferredLocale: over.locale ?? "fr",
      firstName: over.firstName,
      lastName: over.lastName,
    },
    overrideAccess: true,
  })
}

export async function makePaidOrder(
  payload: Payload,
  customerId: number,
  course: Course,
  opts: { quantity?: number; sessionId?: number; paidAt?: Date; invoicePdfUrl?: string; total?: number } = {},
) {
  const id = uid()
  const quantity = opts.quantity ?? 1
  return payload.create({
    collection: "orders",
    data: {
      number: `CFF-P${id}`.toUpperCase(),
      customer: customerId,
      email: `order-${id}@example.com`,
      locale: "fr",
      status: "paid",
      items: [{ course: course.id, session: opts.sessionId, quantity, unitAmount: 5000, description: course.title }],
      subtotal: 5000 * quantity,
      discountTotal: 0,
      taxGst: 0,
      taxQst: 0,
      total: opts.total ?? 5000 * quantity,
      currency: "cad",
      stripeCheckoutSessionId: `cs_test_${id}`,
      paidAt: (opts.paidAt ?? new Date()).toISOString(),
      invoicePdfUrl: opts.invoicePdfUrl,
    },
    overrideAccess: true,
  })
}

export async function makeSeat(
  payload: Payload,
  i: {
    sessionId: number
    customerId: number
    orderId: number
    index: number
    attendeeName?: string
    status?: "confirmed" | "cancelled" | "refunded"
  },
) {
  return payload.create({
    collection: "enrollments",
    data: {
      session: i.sessionId,
      customer: i.customerId,
      order: i.orderId,
      attendeeIndex: i.index,
      attendeeName: i.attendeeName,
      seatAmount: 5000,
      status: i.status ?? "confirmed",
      attendance: "unknown",
    },
    overrideAccess: true,
  })
}

export async function grantCourse(payload: Payload, customerId: number, courseId: number, revoked = false) {
  return payload.create({
    collection: "entitlements",
    data: {
      customer: customerId,
      course: courseId,
      source: "manual",
      sourceRef: `portal-${uid()}`,
      validFrom: new Date(Date.now() - 86_400_000).toISOString(),
      revokedAt: revoked ? new Date().toISOString() : undefined,
      revokedReason: revoked ? "test" : undefined,
    },
    overrideAccess: true,
  })
}

/**
 * Test-only login token (never a real inbox): same row `requestMagicLink` writes,
 * hashed with the same sha256. Returns the raw token for the verify URL.
 */
export async function mintLoginToken(payload: Payload, customerId: number, next?: string): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  await payload.create({
    collection: "magic-link-tokens",
    data: {
      customer: customerId,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      requestIp: "127.0.0.1",
      next: next ?? null,
    },
    overrideAccess: true,
  })
  return token
}

export type PortalWorld = Awaited<ReturnType<typeof seedPortalWorld>>

/**
 * buyer: 3-seat order (own + 2 guests) + 1 online entitlement + 1 revoked one + 2 orders (one with receipt).
 * guest1: occupies seat #1 only.  empty: signed-up, owns nothing.
 */
export async function seedPortalWorld(payload: Payload) {
  const inPerson = await makeCourse(payload, "in_person")
  const online = await makeCourse(payload, "online")
  const onlineRevoked = await makeCourse(payload, "online")
  const onlineOther = await makeCourse(payload, "online")
  const session = await makeSession(payload, inPerson.id, 6)

  const buyer = await makeNamedCustomer(payload, { firstName: "Bea", lastName: "Buyer" })
  const guest1 = await makeNamedCustomer(payload, { firstName: "Gus", lastName: "Guest" })
  const guest2 = await makeNamedCustomer(payload, { firstName: "Gia", lastName: "Guest" })
  const empty = await makeNamedCustomer(payload, { locale: "en" })

  const seatsOrder = await makePaidOrder(payload, buyer.id, inPerson, {
    quantity: 3,
    sessionId: session.id,
    paidAt: new Date(Date.now() - 2 * 86_400_000),
    invoicePdfUrl: "https://invoice.example.com/a.pdf",
  })
  const onlineOrder = await makePaidOrder(payload, buyer.id, online, { paidAt: new Date(Date.now() - 86_400_000) })
  const seats = [
    await makeSeat(payload, { sessionId: session.id, customerId: buyer.id, orderId: seatsOrder.id, index: 0 }),
    await makeSeat(payload, { sessionId: session.id, customerId: guest1.id, orderId: seatsOrder.id, index: 1, attendeeName: "Gus Guest" }),
    await makeSeat(payload, { sessionId: session.id, customerId: guest2.id, orderId: seatsOrder.id, index: 2, attendeeName: "Gia Guest" }),
  ]
  await grantCourse(payload, buyer.id, online.id)
  await grantCourse(payload, buyer.id, onlineRevoked.id, true)

  return { inPerson, online, onlineRevoked, onlineOther, session, buyer, guest1, guest2, empty, seatsOrder, onlineOrder, seats }
}
