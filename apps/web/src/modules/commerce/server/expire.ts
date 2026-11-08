import { sql } from "@payloadcms/db-postgres/drizzle"

import type { ExpireResult } from "../types"
import { ts } from "./availability"
import { expireCheckoutSessions } from "./stripe-port"
import { executorFor } from "./tx"

/** Stripe retries webhooks up to 3 days; W2-07 reads attendees from expired holds. */
export const ATTENDEE_RETENTION_MS = 7 * 86_400_000

/**
 * CONTRACT §4. Idempotent:
 * 1. active holds with expiresAt <= now → expired (one UPDATE; concurrent runs split rows)
 * 2. their open Checkout sessions → expire (already closed → ignored)
 * 3. PII retention: empty `attendees` of non-active holds with expiresAt < now − 7 days
 */
export async function expireStaleHolds(now: Date = new Date()): Promise<ExpireResult> {
  const db = await executorFor()
  const { rows } = await db.execute<{ id: number; stripe_checkout_session_id: string | null }>(sql`
    UPDATE seat_holds SET status = 'expired', updated_at = now()
    WHERE status = 'active' AND expires_at <= ${ts(now)}
    RETURNING id, stripe_checkout_session_id
  `)
  const checkoutSessionsExpired = await expireCheckoutSessions(rows.map((r) => r.stripe_checkout_session_id))

  const cutoff = new Date(now.getTime() - ATTENDEE_RETENTION_MS)
  await db.execute(sql`
    DELETE FROM seat_holds_attendees a
    USING seat_holds h
    WHERE a._parent_id = h.id AND h.status <> 'active' AND h.expires_at < ${ts(cutoff)}
  `)
  return { expired: rows.length, checkoutSessionsExpired }
}
