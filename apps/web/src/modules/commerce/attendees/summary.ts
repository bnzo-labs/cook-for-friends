import type { Payload } from "payload"

import type { ID } from "@/modules/_shared"
import { getAvailableSeats } from "../server/availability"
import { getPayload } from "../server/payload"

export type SeatSummary = { capacity: number; confirmed: number; activeHolds: number; available: number }

/** Seats, not rows: confirmed = enrollments, activeHolds = Σ hold quantity. */
export async function getSeatSummary(sessionId: ID, payload?: Payload): Promise<SeatSummary | null> {
  const p = payload ?? (await getPayload())
  const session = await p
    .findByID({ collection: "sessions", id: sessionId, depth: 0, overrideAccess: true })
    .catch(() => null)
  if (!session) return null

  const [confirmed, holds, available] = await Promise.all([
    p.count({
      collection: "enrollments",
      where: { and: [{ session: { equals: sessionId } }, { status: { equals: "confirmed" } }] },
      overrideAccess: true,
    }),
    p.find({
      collection: "seat-holds",
      where: {
        and: [
          { session: { equals: sessionId } },
          { status: { equals: "active" } },
          { expiresAt: { greater_than: new Date().toISOString() } },
        ],
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    getAvailableSeats(sessionId),
  ])

  return {
    capacity: session.capacity,
    confirmed: confirmed.totalDocs,
    activeHolds: holds.docs.reduce((n, h) => n + (h.quantity ?? 1), 0),
    available,
  }
}
