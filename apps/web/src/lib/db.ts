/**
 * db.ts — direct Drizzle access for raw SQL operations.
 *
 * Only the `commerce` module should use raw SQL (seat locks).
 * All other modules use the Payload Local API.
 *
 * Usage:
 *   import { getDb } from '@/lib/db'
 *   const db = await getDb()
 *   const result = await db.execute(sql`SELECT ...`)
 */
import { cache } from "react"
import { getPayload } from "./payload"

export const getDb = cache(async () => {
  const payload = await getPayload()
  // Payload's postgres adapter exposes the Drizzle instance at payload.db.drizzle
  // Type: ReturnType<typeof drizzle>
  return (payload.db as { drizzle: unknown }).drizzle
})
