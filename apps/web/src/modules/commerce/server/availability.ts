import { sql } from "@payloadcms/db-postgres/drizzle"

import type { ID, TxContext } from "@/modules/_shared"

import { executorFor, type SqlExecutor } from "./tx"

export const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`

type CountRow = { capacity: string | number | null; confirmed: string | number; held: string | number }

/**
 * F2: capacity − confirmed enrollments − Σ quantity of holds
 * (status 'active' AND expiresAt > now). Holds count by quantity, not rows.
 * Unknown session → 0. Never negative.
 */
export async function countAvailable(db: SqlExecutor, sessionId: ID, now: Date = new Date()): Promise<number> {
  const id = Number(sessionId)
  const { rows } = await db.execute<CountRow>(sql`
    SELECT
      (SELECT capacity FROM sessions WHERE id = ${id}) AS capacity,
      (SELECT count(*) FROM enrollments WHERE session_id = ${id} AND status = 'confirmed') AS confirmed,
      (SELECT coalesce(sum(quantity), 0) FROM seat_holds
        WHERE session_id = ${id} AND status = 'active' AND expires_at > ${ts(now)}) AS held
  `)
  const row = rows[0]
  if (!row || row.capacity === null) return 0
  return Math.max(0, Number(row.capacity) - Number(row.confirmed) - Number(row.held))
}

/** CONTRACT §4. With `tx`, reads inside the caller's transaction. */
export async function getAvailableSeats(sessionId: ID, tx?: TxContext): Promise<number> {
  if (!Number.isSafeInteger(Number(sessionId)) || Number(sessionId) <= 0) return 0
  return countAvailable(await executorFor(tx), sessionId)
}
