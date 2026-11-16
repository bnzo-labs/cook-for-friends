/** Local-API read helpers for W4-01 assertions (throwaway CI branch). Test-only. */
import { expect } from "@playwright/test"
import type { Payload } from "payload"

import type { Enrollment, Order } from "@/payload-types"

export const relId = (v: unknown): number => (typeof v === "object" && v !== null ? Number((v as { id: number }).id) : Number(v))

export async function findOrder(payload: Payload, checkoutSessionId: string): Promise<Order | null> {
  const { docs } = await payload.find({
    collection: "orders",
    where: { stripeCheckoutSessionId: { equals: checkoutSessionId } },
    depth: 0,
    limit: 2,
    overrideAccess: true,
  })
  return (docs[0] as Order | undefined) ?? null
}

/** Poll (deterministic, no sleeps) until the webhook produced the order. */
export async function waitOrder(payload: Payload, checkoutSessionId: string, timeout = 60_000): Promise<Order> {
  await expect.poll(async () => (await findOrder(payload, checkoutSessionId)) !== null, { timeout, intervals: [500, 1_000, 2_000] }).toBe(true)
  return (await findOrder(payload, checkoutSessionId)) as Order
}

export async function enrollmentsOf(payload: Payload, orderId: number): Promise<Enrollment[]> {
  const { docs } = await payload.find({
    collection: "enrollments",
    where: { order: { equals: orderId } },
    sort: "attendeeIndex",
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs as Enrollment[]
}

export async function enrollmentsOfSession(payload: Payload, sessionId: number): Promise<Enrollment[]> {
  const { docs } = await payload.find({
    collection: "enrollments",
    where: { session: { equals: sessionId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs as Enrollment[]
}

export async function purchaseEntitlements(payload: Payload, orderId: number) {
  const { docs } = await payload.find({
    collection: "entitlements",
    where: { and: [{ sourceRef: { equals: String(orderId) } }, { source: { equals: "purchase" } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

export async function eventOutcome(payload: Payload, eventId: string): Promise<string | null> {
  const { docs } = await payload.find({
    collection: "processed-stripe-events",
    where: { eventId: { equals: eventId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  return (docs[0]?.outcome as string | undefined) ?? null
}

export async function holdOf(payload: Payload, id: number) {
  return payload.findByID({ collection: "seat-holds", id, depth: 0, overrideAccess: true })
}

export async function holdsOfSession(payload: Payload, sessionId: number) {
  const { docs } = await payload.find({
    collection: "seat-holds",
    where: { session: { equals: sessionId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
}

export async function holdByCheckoutSession(payload: Payload, checkoutSessionId: string) {
  await expect
    .poll(
      async () => {
        const { totalDocs } = await payload.count({
          collection: "seat-holds",
          where: { stripeCheckoutSessionId: { equals: checkoutSessionId } },
          overrideAccess: true,
        })
        return totalDocs
      },
      { timeout: 30_000 },
    )
    .toBe(1)
  const { docs } = await payload.find({
    collection: "seat-holds",
    where: { stripeCheckoutSessionId: { equals: checkoutSessionId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  return docs[0]!
}

export async function expireHoldNow(payload: Payload, holdId: number): Promise<void> {
  await payload.update({
    collection: "seat-holds",
    id: holdId,
    overrideAccess: true,
    data: { expiresAt: new Date(Date.now() - 60_000).toISOString() },
  })
}

export async function customerByEmail(payload: Payload, email: string) {
  const { docs } = await payload.find({
    collection: "customers",
    where: { email: { equals: email.toLowerCase() } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  return docs[0] ?? null
}

export type QueuedEmail = {
  template: string
  to: string
  idempotencyKey: string
  data: Record<string, unknown>
  ics?: Array<{ uid: string }>
}

/**
 * Queued `send-email` job inputs whose idempotency key starts with `prefix`.
 * Email delivery is not mocked in the app but fails in CI (placeholder Resend key),
 * so the rows stay in the queue; we assert on what was queued, never on delivery.
 */
export async function queuedEmails(payload: Payload, prefix: string): Promise<QueuedEmail[]> {
  const { docs } = await payload.find({
    collection: "payload-jobs",
    where: { taskSlug: { equals: "send-email" } },
    sort: "-createdAt",
    limit: 2000,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return docs
    .map((d) => d.input as unknown as QueuedEmail | null)
    .filter((i): i is QueuedEmail => Boolean(i) && typeof i?.idempotencyKey === "string" && i.idempotencyKey.startsWith(prefix))
}
