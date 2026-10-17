/**
 * Minimal document factories for schema tests. Fictional data, @example.com only.
 * All writes use the Local API with overrideAccess (as module functions do).
 */
import type { Payload } from "payload"

import { uid } from "./integration"

export async function makeCustomer(payload: Payload) {
  return payload.create({
    collection: "customers",
    data: { email: `cust-${uid()}@example.com`, preferredLocale: "fr" },
  })
}

export async function makeStaff(payload: Payload, role: "admin" | "staff") {
  return payload.create({
    collection: "users",
    data: { email: `${role}-${uid()}@example.com`, password: uid() + uid(), role },
  })
}

export async function makeCourse(
  payload: Payload,
  format: "in_person" | "online",
  status: "draft" | "published" = "published",
) {
  return payload.create({
    collection: "courses",
    data: {
      title: `Test ${format}`,
      slug: `test-${format}-${uid()}`,
      format,
      price: 5000,
      status,
      _status: status,
    },
  })
}

export async function makeSession(payload: Payload, courseId: number, capacity = 4) {
  const start = new Date(Date.now() + 7 * 86_400_000)
  return payload.create({
    collection: "sessions",
    data: {
      course: courseId,
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
      capacity,
      status: "scheduled",
    },
  })
}

export async function makeLesson(payload: Payload, courseId: number, order = 0) {
  return payload.create({
    collection: "lessons",
    data: { course: courseId, title: `Lesson ${order}`, order },
  })
}

export async function makeOrder(payload: Payload, customerId: number, courseId: number) {
  const id = uid()
  return payload.create({
    collection: "orders",
    data: {
      number: `CFF-T${id}`,
      customer: customerId,
      email: `order-${id}@example.com`,
      locale: "fr",
      status: "paid",
      items: [{ course: courseId, quantity: 1, unitAmount: 5000 }],
      subtotal: 5000,
      discountTotal: 0,
      taxGst: 250,
      taxQst: 499,
      total: 5749,
      currency: "cad",
      stripeCheckoutSessionId: `cs_test_${id}`,
    },
  })
}
