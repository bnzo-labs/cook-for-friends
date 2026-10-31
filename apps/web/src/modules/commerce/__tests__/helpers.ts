/**
 * Commerce integration-test helpers (real Postgres). Fictional data, @example.com only.
 */
import type { Payload } from "payload"

import { recordCourseStripeSync } from "@/modules/catalog"

import { makeCourse, makeCustomer, makeOrder, makeSession } from "../../../../test/fixtures"
import { uid } from "../../../../test/integration"

export async function makePurchasableCourse(payload: Payload, format: "in_person" | "online") {
  const course = await makeCourse(payload, format)
  await recordCourseStripeSync(course.id, {
    status: "synced",
    productId: `prod_test_${uid()}`,
    priceId: `price_test_${uid()}`,
  })
  return course
}

/** Published in-person course with one future scheduled session of `capacity`. */
export async function makeBookableSession(payload: Payload, capacity: number) {
  const course = await makePurchasableCourse(payload, "in_person")
  const session = await makeSession(payload, course.id, capacity)
  return { course, session }
}

export async function addConfirmedEnrollment(payload: Payload, sessionId: number, courseId: number) {
  const customer = await makeCustomer(payload)
  const order = await makeOrder(payload, customer.id, courseId)
  return payload.create({
    collection: "enrollments",
    data: { session: sessionId, customer: customer.id, order: order.id, attendeeIndex: 0, status: "confirmed", attendance: "unknown" },
    overrideAccess: true,
  })
}

export async function addHold(
  payload: Payload,
  sessionId: number,
  over: { quantity?: number; status?: "active" | "converted" | "expired" | "released"; expiresAt?: Date; stripeCheckoutSessionId?: string; attendees?: { firstName: string; lastName: string; email: string }[] } = {},
) {
  return payload.create({
    collection: "seat-holds",
    data: {
      session: sessionId,
      quantity: over.quantity ?? 1,
      cartToken: `cart_${uid()}_${uid()}`,
      status: over.status ?? "active",
      expiresAt: (over.expiresAt ?? new Date(Date.now() + 15 * 60_000)).toISOString(),
      stripeCheckoutSessionId: over.stripeCheckoutSessionId,
      attendees: over.attendees,
    },
    overrideAccess: true,
  })
}

export async function holdsOf(payload: Payload, sessionId: number, status?: string) {
  const { docs } = await payload.find({
    collection: "seat-holds",
    where: { and: [{ session: { equals: sessionId } }, ...(status ? [{ status: { equals: status } }] : [])] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

export const guests = (n: number, tag = uid()) =>
  Array.from({ length: n }, (_, i) => ({ firstName: `Guest${i + 1}`, lastName: "Test", email: `guest${i + 1}-${tag}@example.com` }))
