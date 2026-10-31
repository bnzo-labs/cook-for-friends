import type { ID } from "@/modules/_shared/types"

import { getPayload } from "./payload"

/**
 * Called by commerce when a seat frees up (cancellation, expired hold, refund).
 * Wave 2: only counts `waiting` waitlist entries for the session and emits a
 * structured warn log `waitlist.notify.pending` (sessionId + count, no PII).
 * W3-05 replaces the log with the actual notification. Never throws for a valid id.
 */
export async function onSeatReleased(sessionId: ID): Promise<void> {
  try {
    const payload = await getPayload()
    const { totalDocs } = await payload.count({
      collection: "waitlist-entries",
      where: { and: [{ session: { equals: sessionId } }, { status: { equals: "waiting" } }] },
      overrideAccess: true,
    })
    if (totalDocs === 0) return
    console.warn(JSON.stringify({ event: "waitlist.notify.pending", level: "warn", sessionId, count: totalDocs }))
  } catch (error) {
    console.error("[scheduling] onSeatReleased failed", { sessionId, error })
  }
}
