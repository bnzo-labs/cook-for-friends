import type Stripe from "stripe"

import type { Locale } from "@/modules/_shared"
import {
  getCourseCommerceRecord,
  getSessionView,
  getSiteSettings,
  type CourseCommerceRecord,
  type SessionView,
} from "@/modules/catalog"
import { upsertCustomerByEmail, type CustomerView } from "@/modules/identity"

import { getStripe } from "../../server/stripe-port"
import { executorFor } from "../../server/tx"
import { readHold, readHoldAttendees, type HoldRow } from "../orders"
import { isAppObject, logEvent, normalizeEmail, parseCheckoutMetadata, stripeId, type ParsedMetadata } from "../shared"

/** One seat: index 0 = buyer, i = hold attendees[i − 1]. */
export type ResolvedAttendee = {
  index: number
  customerId: number
  email: string
  firstName: string | null
  attendeeName: string
  /** Same email as an earlier attendee: linked, no extra email (defensive). */
  duplicate: boolean
}

export type CompletedPrepared =
  | { kind: "unpaid" }
  /** M-1: a Checkout session this app did not create (Payment Link, Dashboard): no `cartToken`. */
  | { kind: "foreign" }
  | {
      kind: "paid"
      session: Stripe.Checkout.Session
      meta: ParsedMetadata
      quantity: number
      hold: HoldRow | null
      attendees: ResolvedAttendee[]
      course: CourseCommerceRecord | null
      sessionView: SessionView | null
      contactEmail: string | null
      line: { unitAmount: number; amountSubtotal: number; description: string | null }
      taxes: { gst: number; qst: number; total: number }
      paymentIntentId: string | null
      invoice: { id: string; pdfUrl: string | null } | null
      promotionCode: string | null
    }

function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  return { firstName: parts[0], ...(parts.length > 1 ? { lastName: parts.slice(1).join(" ") } : {}) }
}

const fullName = (c: Pick<CustomerView, "firstName" | "lastName">) =>
  [c.firstName, c.lastName].filter((x): x is string => Boolean(x && x.trim())).join(" ")

async function readLine(sessionId: string): Promise<{ quantity: number; line: CompletedPreparedPaid["line"] }> {
  const { data } = await getStripe().checkout.sessions.listLineItems(sessionId, { limit: 10 })
  const quantity = data.reduce((sum, li) => sum + Number(li.quantity ?? 0), 0)
  const first = data[0]
  const unit = first?.price?.unit_amount ?? (first && first.quantity ? Math.floor(first.amount_subtotal / first.quantity) : 0)
  return {
    quantity,
    line: { unitAmount: Number(unit ?? 0), amountSubtotal: Number(first?.amount_subtotal ?? 0), description: first?.description ?? null },
  }
}

type CompletedPreparedPaid = Extract<CompletedPrepared, { kind: "paid" }>

/** GST/QST from `total_details.breakdown` (expanded on demand). Tax off → 0. */
async function readTaxes(session: Stripe.Checkout.Session): Promise<CompletedPreparedPaid["taxes"]> {
  const total = Number(session.total_details?.amount_tax ?? 0)
  if (total === 0) return { gst: 0, qst: 0, total: 0 }
  let breakdown = session.total_details?.breakdown
  if (!breakdown) {
    const full = await getStripe().checkout.sessions.retrieve(session.id, { expand: ["total_details.breakdown"] })
    breakdown = full.total_details?.breakdown
  }
  let qst = 0
  for (const t of breakdown?.taxes ?? []) {
    const rate = t.rate as Stripe.TaxRate
    const label = `${rate?.tax_type ?? ""} ${rate?.display_name ?? ""}`.toLowerCase()
    if (/qst|tvq/.test(label)) qst += Number(t.amount)
  }
  return { gst: total - qst, qst, total }
}

async function readInvoice(session: Stripe.Checkout.Session): Promise<CompletedPreparedPaid["invoice"]> {
  const id = stripeId(session.invoice as string | { id: string } | null)
  if (!id) return null
  if (typeof session.invoice === "object" && session.invoice) {
    return { id, pdfUrl: (session.invoice as Stripe.Invoice).invoice_pdf ?? null }
  }
  try {
    const invoice = await getStripe().invoices.retrieve(id)
    return { id, pdfUrl: invoice.invoice_pdf ?? null }
  } catch (error) {
    // invoice.finalized fills the PDF URL later.
    console.error("[commerce] webhook: invoice read failed", { invoiceId: id, error })
    return { id, pdfUrl: null }
  }
}

async function readHoldSnapshot(meta: ParsedMetadata, quantity: number) {
  if (meta.sessionId === null) return { hold: null, guests: [] }
  if (meta.holdId === null) throw new Error("[commerce] in-person checkout without holdId")
  const db = await executorFor()
  const hold = await readHold(db, meta.holdId)
  if (!hold || hold.session_id !== meta.sessionId) throw new Error("[commerce] hold missing or for another session")
  if (hold.quantity !== quantity) {
    logEvent("error", "webhook.quantity.mismatch", { holdId: hold.id, hold: hold.quantity, stripe: quantity })
    throw new Error("[commerce] hold quantity does not match Stripe quantity")
  }
  const guests = await readHoldAttendees(db, hold.id)
  if (guests.length !== quantity - 1) {
    logEvent("error", "webhook.attendees.missing", { holdId: hold.id, expected: quantity - 1, got: guests.length })
    throw new Error("[commerce] hold attendees do not match quantity")
  }
  return { hold, guests }
}

/**
 * Buyer then each guest via `identity.upsertCustomerByEmail` (existing
 * customer → linked, never overwritten). Duplicate email → same customer, warn.
 */
async function resolveAttendees(
  buyer: { email: string; name: string | null },
  guests: { firstName: string; lastName: string; email: string }[],
  locale: Locale,
): Promise<ResolvedAttendee[]> {
  const seen = new Map<string, CustomerView>()
  const buyerCustomer = await upsertCustomerByEmail({ email: buyer.email, locale, ...splitName(buyer.name) })
  seen.set(normalizeEmail(buyer.email), buyerCustomer)
  const out: ResolvedAttendee[] = [
    {
      index: 0,
      customerId: Number(buyerCustomer.id),
      email: buyerCustomer.email,
      firstName: buyerCustomer.firstName,
      attendeeName: fullName(buyerCustomer) || buyer.name?.trim() || buyerCustomer.email,
      duplicate: false,
    },
  ]
  for (const [i, g] of guests.entries()) {
    const key = normalizeEmail(g.email)
    const known = seen.get(key)
    if (known) logEvent("warn", "webhook.attendee.duplicate_email", { attendeeIndex: i + 1 })
    const customer = known ?? (await upsertCustomerByEmail({ email: g.email, locale, firstName: g.firstName, lastName: g.lastName }))
    seen.set(key, customer)
    out.push({
      index: i + 1,
      customerId: Number(customer.id),
      email: customer.email,
      firstName: g.firstName,
      attendeeName: `${g.firstName} ${g.lastName}`.trim(),
      duplicate: Boolean(known),
    })
  }
  return out
}

/**
 * W2-21 (H-1): `no_payment_required` = 100 % promotion code (or amount-off ≥
 * line total) → fulfil like `paid` (total 0, no PaymentIntent). `unpaid` stays
 * skipped (async payment methods are off).
 */
export const FULFILLABLE_PAYMENT_STATUSES: ReadonlySet<string> = new Set(["paid", "no_payment_required"])

/** Before the transaction: Stripe reads, hold snapshot, customer upserts, catalog reads. */
export async function prepareCompleted(event: Stripe.Event): Promise<CompletedPrepared> {
  const session = event.data.object as Stripe.Checkout.Session
  if (!isAppObject(session.metadata)) {
    logEvent("info", "webhook.foreign.skipped", { eventId: event.id, type: event.type })
    return { kind: "foreign" }
  }
  if (!FULFILLABLE_PAYMENT_STATUSES.has(String(session.payment_status))) return { kind: "unpaid" }

  const meta = parseCheckoutMetadata(session.metadata, session.id)
  const { quantity, line } = await readLine(session.id)
  if (quantity !== meta.quantity || (meta.sessionId === null && quantity !== 1)) {
    logEvent("error", "webhook.quantity.mismatch", { checkoutSessionId: session.id, metadata: meta.quantity, stripe: quantity })
    throw new Error("[commerce] Stripe line quantity does not match metadata")
  }
  const { hold, guests } = await readHoldSnapshot(meta, quantity)

  const buyerEmail = session.customer_details?.email ?? session.customer_email ?? hold?.customer_email
  if (!buyerEmail) throw new Error("[commerce] checkout session has no buyer email")
  const attendees = await resolveAttendees({ email: buyerEmail, name: session.customer_details?.name ?? null }, guests, meta.locale)

  const [course, sessionView, settings, taxes, invoice] = await Promise.all([
    getCourseCommerceRecord(meta.courseId),
    meta.sessionId !== null ? getSessionView(meta.sessionId, meta.locale) : Promise.resolve(null),
    getSiteSettings(),
    readTaxes(session),
    readInvoice(session),
  ])
  const promo = session.discounts?.find((d) => d.promotion_code)?.promotion_code
  return {
    kind: "paid",
    session,
    meta,
    quantity,
    hold,
    attendees,
    course,
    sessionView,
    contactEmail: settings.contactEmail,
    line,
    taxes,
    paymentIntentId: stripeId(session.payment_intent as string | { id: string } | null),
    invoice,
    promotionCode: stripeId(promo as string | { id: string } | null | undefined),
  }
}
