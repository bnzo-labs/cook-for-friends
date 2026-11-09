import { sql } from "@payloadcms/db-postgres/drizzle"
import type Stripe from "stripe"

import { grantEntitlement } from "@/modules/access"
import type { Order } from "@/payload-types"

import { countAvailable } from "../../server/availability"
import { enqueueGuestConfirmations, enqueueOrderConfirmation, enqueueOversellRefund } from "../emails"
import { formatOrderNumber, pendingOrderNumber, splitSeatAmounts } from "../order-number"
import { findOrderByCheckoutSession, lockCheckoutSession, readHold, setHoldStatus } from "../orders"
import { createStripeRefund } from "../refund"
import { logEvent, type ApplyResult, type ApplyScope } from "../shared"
import type { CompletedPrepared } from "./completed-prepare"

type Paid = Extract<CompletedPrepared, { kind: "paid" }>
type Placement = "hold" | "available" | "oversell" | "online"

/** F3: lock the session row, then decide where the N seats come from. */
async function placeSeats(p: Paid, { db }: ApplyScope, now: Date): Promise<Placement> {
  if (p.meta.sessionId === null) return "online"
  await db.execute(sql`SELECT id FROM sessions WHERE id = ${p.meta.sessionId} FOR UPDATE`)
  const hold = p.hold ? await readHold(db, p.hold.id, true) : null
  if (hold && hold.status === "active" && new Date(hold.expires_at).getTime() > now.getTime()) return "hold"
  // Invalid hold no longer counts in F2, so this is "available excluding this hold".
  const available = await countAvailable(db, p.meta.sessionId, now)
  return available >= p.quantity ? "available" : "oversell"
}

async function createOrder(p: Paid, { tx }: ApplyScope, now: Date): Promise<{ id: number; number: string }> {
  const payload = tx.req.payload
  const created = (await payload.create({
    collection: "orders",
    data: {
      number: pendingOrderNumber(p.session.id),
      customer: p.attendees[0]?.customerId,
      email: p.attendees[0]?.email ?? "",
      locale: p.meta.locale,
      status: "paid",
      items: [
        {
          course: p.meta.courseId,
          ...(p.meta.sessionId !== null ? { session: p.meta.sessionId } : {}),
          quantity: p.quantity,
          unitAmount: p.line.unitAmount,
          description: p.line.description,
        },
      ],
      subtotal: Number(p.session.amount_subtotal ?? 0),
      discountTotal: Number(p.session.total_details?.amount_discount ?? 0),
      taxGst: p.taxes.gst,
      taxQst: p.taxes.qst,
      total: Number(p.session.amount_total ?? 0),
      currency: "cad",
      stripeCheckoutSessionId: p.session.id,
      stripePaymentIntentId: p.paymentIntentId,
      stripeInvoiceId: p.invoice?.id ?? null,
      invoicePdfUrl: p.invoice?.pdfUrl ?? null,
      promotionCode: p.promotionCode,
      paidAt: now.toISOString(),
    },
    depth: 0,
    overrideAccess: true,
    req: tx.req,
  })) as Order
  const id = Number(created.id)
  const number = formatOrderNumber(id)
  await payload.update({ collection: "orders", id, data: { number }, depth: 0, overrideAccess: true, req: tx.req })
  return { id, number }
}

/**
 * W2-21: zero-amount order (100 % promo) lost the seat race. Nothing was
 * charged → no Stripe refund; order `cancelled` (no `refunds[]` row), hold
 * expired, `oversell-refund` email with `refundAmount: 0`. Never throws for the
 * missing PaymentIntent, so the event cannot loop on 500.
 */
async function oversellZeroAmount(p: Paid, scope: ApplyScope, order: { id: number; number: string }): Promise<ApplyResult> {
  await scope.tx.req.payload.update({
    collection: "orders",
    id: order.id,
    data: { status: "cancelled" },
    depth: 0,
    overrideAccess: true,
    req: scope.tx.req,
  })
  if (p.hold && p.hold.status === "active") await setHoldStatus(scope.db, p.hold.id, "expired")
  await enqueueOversellRefund(p, order, 0, scope.tx)
  logEvent("warn", "webhook.oversell.zero_amount", { orderId: order.id, sessionId: p.meta.sessionId, quantity: p.quantity })
  return { outcome: "refunded", note: "oversell zero-amount: cancelled, nothing to refund", after: { queuedEmails: true } }
}

/** Whole-order refund, no enrollment, no entitlement (D9: no partial fulfilment). */
async function oversell(p: Paid, scope: ApplyScope, order: { id: number; number: string }, now: Date): Promise<ApplyResult> {
  const total = Number(p.session.amount_total ?? 0)
  if (total === 0) return oversellZeroAmount(p, scope, order)
  if (!p.paymentIntentId) throw new Error("[commerce] oversell without payment intent")
  const refund = await createStripeRefund({
    paymentIntentId: p.paymentIntentId,
    amount: total,
    idempotencyKey: `oversell-${order.id}`,
    metadata: { orderId: String(order.id), reason: "oversell" },
  })
  await scope.tx.req.payload.update({
    collection: "orders",
    id: order.id,
    data: {
      status: "refunded",
      refunds: [{ stripeRefundId: refund.id, amount: refund.amount ?? total, reason: "oversell", at: now.toISOString() }],
    },
    depth: 0,
    overrideAccess: true,
    req: scope.tx.req,
  })
  if (p.hold && p.hold.status === "active") await setHoldStatus(scope.db, p.hold.id, "expired")
  await enqueueOversellRefund(p, order, refund.amount ?? total, scope.tx)
  logEvent("warn", "webhook.oversell.refunded", { orderId: order.id, sessionId: p.meta.sessionId, quantity: p.quantity })
  return { outcome: "refunded", note: `oversell refund ${refund.id}`, after: { queuedEmails: true } }
}

async function createEnrollments(p: Paid, { tx }: ApplyScope, orderId: number): Promise<Map<number, number>> {
  const amounts = splitSeatAmounts(Number(p.session.amount_total ?? 0), p.quantity)
  const ids = new Map<number, number>()
  for (const a of p.attendees) {
    const doc = await tx.req.payload.create({
      collection: "enrollments",
      data: {
        session: p.meta.sessionId as number,
        customer: a.customerId,
        order: orderId,
        attendeeIndex: a.index,
        attendeeName: a.attendeeName,
        seatAmount: amounts[a.index] ?? 0,
        status: "confirmed",
        attendance: "unknown",
      },
      depth: 0,
      overrideAccess: true,
      req: tx.req,
    })
    ids.set(a.index, Number(doc.id))
  }
  return ids
}

async function grantAll(p: Paid, { tx }: ApplyScope, orderId: number): Promise<void> {
  const customers = [...new Set(p.attendees.map((a) => a.customerId))]
  for (const customerId of customers) {
    const r = await grantEntitlement({ customerId, courseId: p.meta.courseId, source: "purchase", sourceRef: String(orderId), tx })
    if (!r.ok) throw new Error(`[commerce] grantEntitlement failed: ${r.error.code}`)
  }
}

/** In the transaction (CONTRACT §6 `checkout.session.completed`). */
export async function applyCompleted(p: CompletedPrepared, scope: ApplyScope, event: Stripe.Event): Promise<ApplyResult> {
  if (p.kind === "foreign") return { outcome: "skipped", note: "foreign checkout session (no cartToken)" }
  if (p.kind === "unpaid") return { outcome: "skipped", note: "payment_status not paid" }
  await lockCheckoutSession(scope.db, p.session.id)
  const existing = await findOrderByCheckoutSession(scope.tx.req.payload, p.session.id, scope.tx.req)
  if (existing) return { outcome: "skipped", note: `order ${existing.id} exists` }

  void event
  const now = new Date()
  const placement = await placeSeats(p, scope, now)
  const order = await createOrder(p, scope, now)
  if (placement === "oversell") return oversell(p, scope, order, now)

  let enrollmentIds = new Map<number, number>()
  if (placement !== "online") {
    if (p.hold) await setHoldStatus(scope.db, p.hold.id, "converted")
    enrollmentIds = await createEnrollments(p, scope, order.id)
  }
  await grantAll(p, scope, order.id)
  await enqueueOrderConfirmation(p, order, enrollmentIds.get(0) ?? null, scope.tx)
  await enqueueGuestConfirmations(p, enrollmentIds, scope.tx)
  return { outcome: "applied", note: `order ${order.id} (${placement})`, after: { queuedEmails: true } }
}
