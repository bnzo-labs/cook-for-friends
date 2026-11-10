/** W3-05 integration helpers (real Postgres). Fictional data, @example.com only. */
import type { Payload } from "payload"
import { expect } from "vitest"

import { uid } from "../../../../test/integration"
import { addHold, guests, makeBookableSession } from "../../commerce/__tests__/helpers"
import {
  TEST_WEBHOOK_SECRET,
  completedEvent,
  enrollmentsOf,
  makeWebhookFake,
  ordersFor,
  sign,
} from "../../commerce/__tests__/webhook-helpers"

export { TEST_WEBHOOK_SECRET, makeWebhookFake }

export const HOUR = 3_600_000

type Commerce = typeof import("../../commerce")
type Fake = ReturnType<typeof makeWebhookFake>

/** Move a session's start (end = start + 3 h) relative to now. */
export async function moveSession(payload: Payload, sessionId: number, startsInHours: number): Promise<Date> {
  const start = new Date(Date.now() + startsInHours * HOUR)
  await payload.update({
    collection: "sessions",
    id: sessionId,
    data: { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3 * HOUR).toISOString() },
    overrideAccess: true,
  })
  return start
}

/** Paid in-person order of `quantity` seats (5000 ¢ each) through the real W2-07 webhook, session start moved to now + `startsInHours`. */
export async function paidOrder(
  payload: Payload,
  commerce: Commerce,
  fake: Fake,
  o: { quantity: number; startsInHours: number; capacity?: number },
) {
  const { course, session } = await makeBookableSession(payload, o.capacity ?? 6)
  const hold = await addHold(payload, session.id, { quantity: o.quantity, attendees: guests(o.quantity - 1) })
  const buyerEmail = `buyer-${uid()}@example.com`
  const c = completedEvent(fake, { courseId: course.id, sessionId: session.id, holdId: hold.id, quantity: o.quantity, email: buyerEmail })
  const { raw, signature } = sign(c.event())
  const r = await commerce.handleStripeEvent(raw, signature)
  if (!r.ok) throw new Error(JSON.stringify(r.error))
  const [order] = await ordersFor(payload, c.csId)
  const seats = await enrollmentsOf(payload, { order: order!.id })
  expect(seats).toHaveLength(o.quantity)
  const startsAt = await moveSession(payload, session.id, o.startsInHours)
  return { course, session, order: order!, seats, buyerId: Number(order!.customer), buyerEmail, startsAt, pi: c.pi }
}

/** `send-email` jobs queued with this idempotency key. */
export async function jobsFor(payload: Payload, key: string) {
  const res = await payload.find({ collection: "payload-jobs", where: {}, sort: "-createdAt", limit: 3000, depth: 0, overrideAccess: true })
  return res.docs.filter((d) => (d.input as Record<string, unknown> | null)?.["idempotencyKey"] === key)
}

export type EmailInput = { template: string; to: string; locale: string; data: Record<string, unknown>; ics?: { uid: string }[] }
export const inputOf = (job: { input?: unknown }) => job.input as EmailInput

export async function customerEmail(payload: Payload, id: number | string): Promise<string> {
  return (await payload.findByID({ collection: "customers", id, depth: 0, overrideAccess: true })).email
}
