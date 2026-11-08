import type Stripe from "stripe"

import { formatOrderNumber } from "../order-number"
import { findOrderByCheckoutSession, lockCheckoutSession, releaseHoldsOfCheckout } from "../orders"
import { stripeId, tryParseCheckoutMetadata, type ApplyResult, type ApplyScope, type EventHandler } from "../shared"

type ClosedPrepared = { session: Stripe.Checkout.Session; holdId: number | null }

const prepareClosed = async (event: Stripe.Event): Promise<ClosedPrepared> => {
  const session = event.data.object as Stripe.Checkout.Session
  return { session, holdId: tryParseCheckoutMetadata(session.metadata)?.holdId ?? null }
}

/** `checkout.session.expired`: holds → released; `onSeatReleased` after commit. */
export const expiredHandler: EventHandler<ClosedPrepared> = {
  prepare: prepareClosed,
  apply: async (p, { db }): Promise<ApplyResult> => {
    await lockCheckoutSession(db, p.session.id)
    const sessions = await releaseHoldsOfCheckout(db, { holdId: p.holdId, checkoutSessionId: p.session.id })
    return {
      outcome: "applied",
      note: `released holds on ${sessions.length} session(s)`,
      after: { releasedSessionIds: sessions },
    }
  },
}

async function cancelOrCreateOrder(p: ClosedPrepared, { tx }: ApplyScope): Promise<string> {
  const payload = tx.req.payload
  const existing = await findOrderByCheckoutSession(payload, p.session.id, tx.req)
  if (existing) {
    if (existing.status === "refunded" || existing.status === "cancelled") return `order ${existing.id} already ${existing.status}`
    await payload.update({ collection: "orders", id: existing.id, data: { status: "cancelled" }, depth: 0, overrideAccess: true, req: tx.req })
    return `order ${existing.id} cancelled`
  }
  const meta = tryParseCheckoutMetadata(p.session.metadata)
  const email = p.session.customer_details?.email ?? p.session.customer_email
  if (!meta || !email) return "no order data (metadata or email missing)"
  const created = await payload.create({
    collection: "orders",
    data: {
      number: `CANCELLED-${p.session.id}`,
      email,
      locale: meta.locale,
      status: "cancelled",
      items: [{ course: meta.courseId, ...(meta.sessionId !== null ? { session: meta.sessionId } : {}), quantity: meta.quantity, unitAmount: 0 }],
      subtotal: Number(p.session.amount_subtotal ?? 0),
      discountTotal: Number(p.session.total_details?.amount_discount ?? 0),
      taxGst: 0,
      taxQst: 0,
      total: Number(p.session.amount_total ?? 0),
      currency: "cad",
      stripeCheckoutSessionId: p.session.id,
      stripePaymentIntentId: stripeId(p.session.payment_intent as string | { id: string } | null),
    },
    depth: 0,
    overrideAccess: true,
    req: tx.req,
  })
  await payload.update({
    collection: "orders",
    id: created.id,
    data: { number: formatOrderNumber(created.id) },
    depth: 0,
    overrideAccess: true,
    req: tx.req,
  })
  return `order ${created.id} created cancelled`
}

/** `checkout.session.async_payment_failed`: release holds, order `cancelled` (created if missing). */
export const asyncFailedHandler: EventHandler<ClosedPrepared> = {
  prepare: prepareClosed,
  apply: async (p, scope): Promise<ApplyResult> => {
    await lockCheckoutSession(scope.db, p.session.id)
    const sessions = await releaseHoldsOfCheckout(scope.db, { holdId: p.holdId, checkoutSessionId: p.session.id })
    const note = await cancelOrCreateOrder(p, scope)
    return { outcome: "applied", note, after: { releasedSessionIds: sessions } }
  },
}
