import type { PayloadRequest } from "payload"

import type { ID, Result } from "@/modules/_shared"
import type { Enrollment, Order } from "@/payload-types"

import { getPayload } from "../server/payload"
import { refundedSoFar } from "../webhook/refund"
import { fail, refundedForEnrollment, relNum } from "./shared"

type SeatRow = Pick<Enrollment, "id" | "seatAmount" | "status" | "cancellationOutcome" | "cancellationAmount">

/**
 * Money already promised to OTHER seats of the order but not yet visible in
 * `order.refunds`: credits issued on cancel, and seat refunds whose
 * `charge.refunded` has not been linked yet (in flight or failed-pending-retry).
 */
function reservedByOtherSeats(order: Pick<Order, "refunds">, seats: SeatRow[], enrollmentId: number): number {
  return seats
    .filter((s) => Number(s.id) !== enrollmentId && s.status === "cancelled")
    .reduce((sum, s) => {
      const promised = Number(s.cancellationAmount ?? 0)
      if (s.cancellationOutcome === "credit") return sum + promised
      if (s.cancellationOutcome === "refund") return sum + Math.max(0, promised - refundedForEnrollment(order, Number(s.id)))
      return sum
    }, 0)
}

export type SeatCancellationCap = {
  /** Max amount (cents) a refund or credit for this seat may carry now. */
  cap: number
  /** `seatAmount − refunds linked to this seat`. */
  seatRemaining: number
  /** `order.total − Σ all refunds (incl. Dashboard) − money promised to other seats`. */
  orderRemaining: number
}

/**
 * W4-03b (W3-10 M-2). Pure: the cap for one seat's refund OR credit is
 * `min(seatAmount − linked refunds, order.total − Σ every recorded refund − other seats' pending promises)`.
 * Unlinked refunds (Stripe Dashboard, no `enrollmentId` metadata) count against the order.
 */
export function seatCancellationCap(order: Pick<Order, "total" | "refunds">, seats: SeatRow[], enrollmentId: number): SeatCancellationCap {
  const seat = seats.find((s) => Number(s.id) === enrollmentId)
  const seatRemaining = Math.max(0, Number(seat?.seatAmount ?? 0) - refundedForEnrollment(order, enrollmentId))
  const orderRemaining = Math.max(0, Number(order.total) - refundedSoFar(order) - reservedByOtherSeats(order, seats, enrollmentId))
  return { cap: Math.min(seatRemaining, orderRemaining), seatRemaining, orderRemaining }
}

/** Every seat of `orderId`, depth 0 (cap inputs). */
export async function seatsOfOrder(orderId: number, req?: PayloadRequest): Promise<SeatRow[]> {
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "enrollments",
    where: { order: { equals: orderId } },
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { seatAmount: true, status: true, cancellationOutcome: true, cancellationAmount: true },
    ...(req ? { req } : {}),
  })
  return docs as SeatRow[]
}

/**
 * Read-only cap for a seat (used by scheduling to clamp the policy amount, and
 * by staff cancellation W4-07). `executeSeatCancellation` re-checks it under lock.
 */
export async function getSeatCancellationCap(enrollmentId: ID): Promise<Result<SeatCancellationCap>> {
  if (!/^\d{1,12}$/.test(String(enrollmentId))) return fail({ code: "NOT_FOUND", entity: "enrollment" })
  const id = Number(enrollmentId)
  const payload = await getPayload()
  const e = (await payload
    .findByID({ collection: "enrollments", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as Enrollment | null
  const orderId = e ? relNum(e.order) : null
  if (!e || orderId === null) return fail({ code: "NOT_FOUND", entity: "enrollment" })
  const order = (await payload.findByID({ collection: "orders", id: orderId, depth: 0, overrideAccess: true }).catch(() => null)) as Order | null
  if (!order) return fail({ code: "NOT_FOUND", entity: "order" })
  return { ok: true, data: seatCancellationCap(order, await seatsOfOrder(orderId), id) }
}
