import { randomBytes } from "node:crypto"

import { sql } from "@payloadcms/db-postgres/drizzle"

import type { ID, ModuleError } from "@/modules/_shared"

import type { AttendeeInput } from "../types"
import { countAvailable, ts } from "./availability"
import { expireCheckoutSessions } from "./stripe-port"
import { executorFor, withTransaction, type SqlExecutor } from "./tx"
import { isCartToken } from "./validation"

/** A hold this call released; its open Checkout session is expired after commit. */
export type ReleasedHold = { id: ID; stripeCheckoutSessionId: string | null }

type HoldRow = { id: number; stripe_checkout_session_id: string | null }
type SessionRow = { id: number; capacity: string; status: string; course_id: number; starts_at: string | Date }

const toReleased = (rows: HoldRow[]): ReleasedHold[] =>
  rows.map((r) => ({ id: r.id, stripeCheckoutSessionId: r.stripe_checkout_session_id }))

/** Serializes concurrent checkouts of one cart (transaction-scoped, PgBouncer-safe). */
async function lockCart(db: SqlExecutor, cartToken: string): Promise<void> {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`cff_cart:${cartToken}`}, 0))`)
}

/** F3: the row lock that serializes seat allocation for one session. */
async function lockSession(db: SqlExecutor, sessionId: ID): Promise<SessionRow | null> {
  const { rows } = await db.execute<SessionRow>(sql`
    SELECT id, capacity, status, course_id, starts_at FROM sessions WHERE id = ${Number(sessionId)} FOR UPDATE
  `)
  return rows[0] ?? null
}

async function releaseActiveForCart(db: SqlExecutor, cartToken: string): Promise<ReleasedHold[]> {
  const { rows } = await db.execute<HoldRow>(sql`
    UPDATE seat_holds SET status = 'released', updated_at = now()
    WHERE cart_token = ${cartToken} AND status = 'active'
    RETURNING id, stripe_checkout_session_id
  `)
  return toReleased(rows)
}

type NewHold = {
  sessionId: ID
  quantity: number
  cartToken: string
  customerEmail: string | null
  attendees: AttendeeInput[]
  expiresAt: Date
}

async function insertHold(db: SqlExecutor, h: NewHold): Promise<number> {
  const { rows } = await db.execute<{ id: number }>(sql`
    INSERT INTO seat_holds (session_id, quantity, cart_token, customer_email, status, expires_at)
    VALUES (${Number(h.sessionId)}, ${h.quantity}, ${h.cartToken}, ${h.customerEmail}, 'active', ${ts(h.expiresAt)})
    RETURNING id
  `)
  const id = rows[0]?.id
  if (id === undefined) throw new Error("[commerce] hold insert returned no id")
  for (const [i, a] of h.attendees.entries()) {
    await db.execute(sql`
      INSERT INTO seat_holds_attendees (_order, _parent_id, id, first_name, last_name, email)
      VALUES (${i + 1}, ${id}, ${randomBytes(12).toString("hex")}, ${a.firstName}, ${a.lastName}, ${a.email})
    `)
  }
  return id
}

/** Thrown inside the transaction to roll it back with a typed error. */
class AllocationAbort extends Error {
  constructor(readonly error: ModuleError) {
    super(error.code)
  }
}

export type AllocationRequest = {
  cartToken: string
  courseId: ID
  /** In-person only. Absent → no hold (online). */
  sessionId?: ID
  quantity: number
  customerEmail: string | null
  attendees: AttendeeInput[]
  holdMinutes: number
  now: Date
}

export type Allocation = { holdId: number | null; expiresAt: Date | null; released: ReleasedHold[] }

const isBookable = (s: SessionRow, courseId: ID, now: Date) =>
  s.status === "scheduled" && Number(s.course_id) === Number(courseId) && new Date(s.starts_at).getTime() > now.getTime()

/**
 * F3 allocation, all-or-nothing, one transaction:
 * cart lock → session `FOR UPDATE` → release the cart's previous active holds →
 * count (F2) → available < N → SOLD_OUT (rollback: nothing changes) → insert ONE
 * hold with quantity N + attendees → commit. Session locked before the release
 * so every path locks session → hold rows (same order as the webhook).
 */
export async function allocateHold(r: AllocationRequest): Promise<{ ok: true; data: Allocation } | { ok: false; error: ModuleError }> {
  try {
    const data = await withTransaction(async ({ db }) => {
      await lockCart(db, r.cartToken)
      if (r.sessionId === undefined) {
        return { holdId: null, expiresAt: null, released: await releaseActiveForCart(db, r.cartToken) }
      }
      const session = await lockSession(db, r.sessionId)
      if (!session || !isBookable(session, r.courseId, r.now)) {
        throw new AllocationAbort({ code: "CONFLICT", reason: "SESSION_NOT_BOOKABLE" })
      }
      const released = await releaseActiveForCart(db, r.cartToken)
      const available = await countAvailable(db, r.sessionId, r.now)
      if (available < r.quantity) throw new AllocationAbort({ code: "SOLD_OUT", sessionId: r.sessionId })
      const expiresAt = new Date(r.now.getTime() + r.holdMinutes * 60_000)
      const holdId = await insertHold(db, {
        sessionId: r.sessionId,
        quantity: r.quantity,
        cartToken: r.cartToken,
        customerEmail: r.customerEmail,
        attendees: r.attendees,
        expiresAt,
      })
      return { holdId, expiresAt, released }
    })
    return { ok: true, data }
  } catch (error) {
    if (error instanceof AllocationAbort) return { ok: false, error: error.error }
    throw error
  }
}

export async function attachCheckoutSession(holdId: ID, stripeCheckoutSessionId: string): Promise<void> {
  const db = await executorFor()
  await db.execute(sql`
    UPDATE seat_holds SET stripe_checkout_session_id = ${stripeCheckoutSessionId}, updated_at = now()
    WHERE id = ${Number(holdId)}
  `)
}

/** Stripe failed after commit: free the seats again. */
export async function releaseHold(holdId: ID): Promise<void> {
  const db = await executorFor()
  await db.execute(sql`
    UPDATE seat_holds SET status = 'released', updated_at = now()
    WHERE id = ${Number(holdId)} AND status = 'active'
  `)
}

/**
 * CCR-W2-4: release the cart's active holds and expire their open Checkout
 * sessions. Unknown/invalid token → 0.
 */
export async function releaseCartHolds(cartToken: string): Promise<{ released: number }> {
  if (!isCartToken(cartToken)) return { released: 0 }
  const db = await executorFor()
  const released = await releaseActiveForCart(db, cartToken)
  await expireCheckoutSessions(released.map((h) => h.stripeCheckoutSessionId))
  return { released: released.length }
}
