import { sql } from "@payloadcms/db-postgres/drizzle"
import type { Payload, PayloadRequest, Where } from "payload"

import type { Order } from "@/payload-types"

import type { SqlExecutor } from "../server/tx"

/** Serializes every delivery that touches one Checkout session (transaction-scoped). */
export async function lockCheckoutSession(db: SqlExecutor, checkoutSessionId: string): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cff_cs:${checkoutSessionId}`}, 0))`)
}

/** Row lock on one order (refund events for the same order serialize here). */
export async function lockOrder(db: SqlExecutor, orderId: number): Promise<void> {
  await db.execute(sql`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`)
}

async function findOne(payload: Payload, where: Where, req?: PayloadRequest): Promise<Order | null> {
  const { docs } = await payload.find({ collection: "orders", where, limit: 1, depth: 0, overrideAccess: true, req })
  return (docs[0] as Order | undefined) ?? null
}

export const findOrderByCheckoutSession = (payload: Payload, id: string, req?: PayloadRequest) =>
  findOne(payload, { stripeCheckoutSessionId: { equals: id } }, req)

export const findOrderByPaymentIntent = (payload: Payload, id: string, req?: PayloadRequest) =>
  findOne(payload, { stripePaymentIntentId: { equals: id } }, req)

export const findOrderByInvoice = (payload: Payload, id: string, req?: PayloadRequest) =>
  findOne(payload, { stripeInvoiceId: { equals: id } }, req)

export async function findOrderById(payload: Payload, id: number, req?: PayloadRequest): Promise<Order | null> {
  try {
    return (await payload.findByID({ collection: "orders", id, depth: 0, overrideAccess: true, req })) as Order
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null
    throw error
  }
}

export type HoldRow = {
  id: number
  session_id: number
  quantity: number
  status: "active" | "converted" | "expired" | "released"
  expires_at: string | Date
  customer_email: string | null
}

export type HoldAttendee = { firstName: string; lastName: string; email: string }

export async function readHold(db: SqlExecutor, holdId: number, forUpdate = false): Promise<HoldRow | null> {
  const lock = forUpdate ? sql` FOR UPDATE` : sql``
  const { rows } = await db.execute<HoldRow>(sql`
    SELECT id, session_id, quantity, status, expires_at, customer_email FROM seat_holds WHERE id = ${holdId}${lock}
  `)
  const row = rows[0]
  return row ? { ...row, id: Number(row.id), session_id: Number(row.session_id), quantity: Number(row.quantity) } : null
}

export async function readHoldAttendees(db: SqlExecutor, holdId: number): Promise<HoldAttendee[]> {
  const { rows } = await db.execute<{ first_name: string; last_name: string; email: string }>(sql`
    SELECT first_name, last_name, email FROM seat_holds_attendees WHERE _parent_id = ${holdId} ORDER BY _order
  `)
  return rows.map((r) => ({ firstName: r.first_name, lastName: r.last_name, email: r.email }))
}

export async function setHoldStatus(db: SqlExecutor, holdId: number, status: HoldRow["status"]): Promise<void> {
  await db.execute(sql`UPDATE seat_holds SET status = ${status}, updated_at = now() WHERE id = ${holdId}`)
}

/**
 * Close events: the Checkout session's holds (by `holdId` and/or session id)
 * that still reserve or could reserve seats → `released`. Converted holds never change.
 */
export async function releaseHoldsOfCheckout(
  db: SqlExecutor,
  i: { holdId: number | null; checkoutSessionId: string },
): Promise<number[]> {
  const byHold = i.holdId !== null ? sql`id = ${i.holdId} OR ` : sql``
  const { rows } = await db.execute<{ session_id: number }>(sql`
    UPDATE seat_holds SET status = 'released', updated_at = now()
    WHERE (${byHold}stripe_checkout_session_id = ${i.checkoutSessionId}) AND status IN ('active', 'expired')
    RETURNING session_id
  `)
  return [...new Set(rows.map((r) => Number(r.session_id)))]
}
