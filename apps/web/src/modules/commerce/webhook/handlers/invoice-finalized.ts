import type Stripe from "stripe"

import { getStripe } from "../../server/stripe-port"
import { findOrderByInvoice, findOrderByPaymentIntent } from "../orders"
import { logEvent, stripeId, type ApplyResult, type ApplyScope, type EventHandler } from "../shared"

type InvoicePrepared = { invoice: Stripe.Invoice; paymentIntentId: string | null }

function paymentIntentOf(payments: Stripe.InvoicePayment[] | undefined): string | null {
  for (const p of payments ?? []) {
    const id = stripeId(p.payment?.payment_intent as string | { id: string } | undefined)
    if (id) return id
  }
  return null
}

/** Before the transaction: the invoice's PaymentIntent (fallback match when `session.invoice` was null). */
async function prepare(event: Stripe.Event): Promise<InvoicePrepared> {
  const invoice = event.data.object as Stripe.Invoice
  let paymentIntentId = paymentIntentOf(invoice.payments?.data)
  if (!paymentIntentId && invoice.id) {
    try {
      const { data } = await getStripe().invoicePayments.list({ invoice: invoice.id, limit: 10 })
      paymentIntentId = paymentIntentOf(data)
    } catch (error) {
      console.error("[commerce] invoicePayments.list failed", { invoiceId: invoice.id, error })
    }
  }
  return { invoice, paymentIntentId }
}

/**
 * Receipts: store `stripeInvoiceId` + `invoicePdfUrl`. No matching order yet
 * (invoice before `checkout.session.completed`) → throw → 500 → Stripe retries.
 */
async function apply(p: InvoicePrepared, { tx }: ApplyScope): Promise<ApplyResult> {
  const payload = tx.req.payload
  const id = p.invoice.id as string
  const order =
    (await findOrderByInvoice(payload, id, tx.req)) ??
    (p.paymentIntentId ? await findOrderByPaymentIntent(payload, p.paymentIntentId, tx.req) : null)
  if (!order) {
    logEvent("error", "webhook.invoice.order_missing", { invoiceId: id })
    throw new Error("[commerce] invoice.finalized: no matching order yet")
  }
  await payload.update({
    collection: "orders",
    id: order.id,
    data: { stripeInvoiceId: id, invoicePdfUrl: p.invoice.invoice_pdf ?? order.invoicePdfUrl ?? null },
    depth: 0,
    overrideAccess: true,
    req: tx.req,
  })
  return { outcome: "applied", note: `order ${order.id} invoice stored` }
}

export const invoiceFinalizedHandler: EventHandler<InvoicePrepared> = { prepare, apply }
