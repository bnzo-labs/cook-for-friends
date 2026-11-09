import type Stripe from "stripe"

import { revokeEntitlement } from "@/modules/access"
import { enqueueEmail } from "@/modules/notifications"
import type { Enrollment, Order } from "@/payload-types"

import { getStripe } from "../../server/stripe-port"
import { findOrderByPaymentIntent, lockOrder } from "../orders"
import { attendeeCustomerIds } from "../refund"
import { logEvent, relId, stripeId, type ApplyResult, type ApplyScope, type EventHandler } from "../shared"

type RefundedPrepared = { charge: Stripe.Charge; paymentIntentId: string | null; refunds: Stripe.Refund[] }

const COUNTED = new Set(["succeeded", "pending", "requires_action"])

/** Before the transaction: the charge's refunds (not expanded on the event since 2022-11-15). */
async function prepare(event: Stripe.Event): Promise<RefundedPrepared> {
  const charge = event.data.object as Stripe.Charge
  const paymentIntentId = stripeId(charge.payment_intent as string | { id: string } | null)
  let refunds = charge.refunds && !charge.refunds.has_more ? charge.refunds.data : null
  if (!refunds) refunds = (await getStripe().refunds.list({ charge: charge.id, limit: 100 })).data
  return { charge, paymentIntentId, refunds: refunds.filter((r) => COUNTED.has(String(r.status))) }
}

async function orderEnrollments(scope: ApplyScope, orderId: number): Promise<Enrollment[]> {
  const { docs } = await scope.tx.req.payload.find({
    collection: "enrollments",
    where: { order: { equals: orderId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    req: scope.tx.req,
  })
  return docs as Enrollment[]
}

/** Full refund: revoke every attendee's purchase entitlement, all seats `refunded`. */
async function applyFullRefund(scope: ApplyScope, order: Order, enrollments: Enrollment[]): Promise<number[]> {
  const courseId = relId(order.items?.[0]?.course)
  const customers = attendeeCustomerIds(order, enrollments.map((e) => relId(e.customer)))
  if (courseId !== null) {
    for (const customerId of customers) {
      const r = await revokeEntitlement({ customerId, courseId, source: "purchase", sourceRef: String(order.id), reason: "refund", tx: scope.tx })
      if (!r.ok && r.error.code !== "NOT_FOUND") throw new Error(`[commerce] revokeEntitlement failed: ${r.error.code}`)
    }
  }
  const now = new Date().toISOString()
  for (const e of enrollments) {
    if (e.status === "refunded") continue
    await scope.tx.req.payload.update({
      collection: "enrollments",
      id: e.id,
      data: { status: "refunded", cancelledAt: e.cancelledAt ?? now },
      depth: 0,
      overrideAccess: true,
      req: scope.tx.req,
    })
  }
  const sessionId = relId(order.items?.[0]?.session)
  return sessionId !== null && enrollments.length > 0 ? [sessionId] : []
}

type RefundRow = NonNullable<Order["refunds"]>[number]

function newRefundRows(p: RefundedPrepared, order: Order, enrollments: Enrollment[]): RefundRow[] {
  const known = new Set((order.refunds ?? []).map((r) => r.stripeRefundId))
  const ownEnrollments = new Set(enrollments.map((e) => Number(e.id)))
  return p.refunds
    .filter((r) => !known.has(r.id))
    .map((r) => {
      const raw = r.metadata?.enrollmentId
      const enrollment = raw && /^\d+$/.test(raw) && ownEnrollments.has(Number(raw)) ? Number(raw) : null
      if (raw && enrollment === null) logEvent("warn", "webhook.refund.enrollment_mismatch", { orderId: order.id })
      return {
        stripeRefundId: r.id,
        amount: Number(r.amount),
        reason: r.metadata?.reason ?? r.reason ?? null,
        at: new Date(r.created * 1000).toISOString(),
        ...(enrollment !== null ? { enrollment } : {}),
      }
    })
}

/**
 * W3-09 (CCR-W3-4): a partial refund linked to a seat (`refunds[].enrollment`)
 * that was cancelled by `executeSeatCancellation` → that seat `refunded`.
 * Confirmed seats are left alone (staff partial refunds, W2-07 behavior).
 */
async function markCancelledSeatsRefunded(scope: ApplyScope, added: RefundRow[], enrollments: Enrollment[]): Promise<void> {
  const linked = new Set(added.map((r) => r.enrollment).filter((x): x is number => typeof x === "number"))
  for (const e of enrollments) {
    if (!linked.has(Number(e.id)) || e.status !== "cancelled") continue
    await scope.tx.req.payload.update({
      collection: "enrollments",
      id: e.id,
      data: { status: "refunded" },
      depth: 0,
      overrideAccess: true,
      req: scope.tx.req,
    })
  }
}

async function apply(p: RefundedPrepared, scope: ApplyScope): Promise<ApplyResult> {
  if (!p.paymentIntentId) return { outcome: "skipped", note: "charge has no payment intent" }
  const payload = scope.tx.req.payload
  const found = await findOrderByPaymentIntent(payload, p.paymentIntentId, scope.tx.req)
  if (!found) {
    // Stripe retries; the order may not be committed yet.
    logEvent("error", "webhook.refund.order_missing", { chargeId: p.charge.id })
    throw new Error("[commerce] charge.refunded: no order for payment intent")
  }
  await lockOrder(scope.db, Number(found.id))
  const order = (await payload.findByID({ collection: "orders", id: found.id, depth: 0, overrideAccess: true, req: scope.tx.req })) as Order
  const enrollments = await orderEnrollments(scope, Number(order.id))
  const added = newRefundRows(p, order, enrollments)
  if (added.length === 0) return { outcome: "skipped", note: "no new refunds" }

  const wasRefunded = order.status === "refunded"
  const full = p.charge.refunded || Number(p.charge.amount_refunded) >= Number(p.charge.amount)
  const status = wasRefunded || full ? "refunded" : "partially_refunded"
  await payload.update({
    collection: "orders",
    id: order.id,
    data: { status, refunds: [...(order.refunds ?? []), ...added] },
    depth: 0,
    overrideAccess: true,
    req: scope.tx.req,
  })
  // Oversell orders are already refunded with their refund recorded: dedupe only.
  if (wasRefunded) return { outcome: "applied", note: "order already refunded: recorded only" }

  const released = full ? await applyFullRefund(scope, order, enrollments) : []
  if (!full) await markCancelledSeatsRefunded(scope, added, enrollments)
  const refundAmount = added.reduce((sum, r) => sum + Number(r.amount), 0)
  await enqueueEmail({
    template: "refund-issued",
    to: order.email,
    locale: order.locale,
    idempotencyKey: `refund-issued-${added.map((r) => r.stripeRefundId).join("-")}`,
    data: { orderNumber: order.number, refundAmount, currency: "cad", full },
    tx: scope.tx,
  })
  return { outcome: "applied", note: `${full ? "full" : "partial"} refund`, after: { releasedSessionIds: released, queuedEmails: true } }
}

/** CONTRACT §6 `charge.refunded`. */
export const chargeRefundedHandler: EventHandler<RefundedPrepared> = { prepare, apply }
