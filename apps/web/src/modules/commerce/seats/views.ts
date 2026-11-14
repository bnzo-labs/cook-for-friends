import type { Where } from "payload"

import type { ID } from "@/modules/_shared"
import type { Enrollment, Order } from "@/payload-types"

import { getPayload } from "../server/payload"
import type { EnrollmentView, OrderSummary } from "../types"
import { refundedForEnrollment, relNum } from "./shared"

const asId = (v: ID | undefined): number | null => (v === undefined || v === null || !/^\d+$/.test(String(v)) ? null : Number(v))

/** `enrollment` with `order` populated (depth 1) → view relative to `viewer` (or nobody). */
function toView(e: Enrollment, viewer: number | null): EnrollmentView | null {
  const order = typeof e.order === "object" && e.order !== null ? (e.order as Order) : null
  const sessionId = relNum(e.session)
  const attendeeId = relNum(e.customer)
  const buyerId = order ? relNum(order.customer) : null
  const courseId = order ? relNum(order.items?.[0]?.course) : null
  if (!order || sessionId === null || attendeeId === null || buyerId === null || courseId === null) return null
  return {
    id: e.id,
    sessionId,
    courseId,
    orderId: order.id,
    orderNumber: order.number,
    buyerCustomerId: buyerId,
    attendeeCustomerId: attendeeId,
    attendeeIndex: e.attendeeIndex ?? 0,
    attendeeName: e.attendeeName ?? null,
    seatAmount: Number(e.seatAmount ?? 0),
    refundedAmount: refundedForEnrollment(order, Number(e.id)),
    status: e.status,
    attendance: e.attendance,
    cancelledAt: e.cancelledAt ?? null,
    cancellationOutcome: e.cancellationOutcome ?? null,
    cancellationAmount: e.cancellationAmount === null || e.cancellationAmount === undefined ? null : Number(e.cancellationAmount),
    isOwnSeat: viewer !== null && attendeeId === viewer,
    bookedByMe: viewer !== null && buyerId === viewer,
  }
}

/**
 * CONTRACT §4 `getEnrollmentView`. With `forCustomerId`, a seat that customer
 * neither occupies nor bought → `null` (no existence leak); flags are relative
 * to them. Without it, both flags are false.
 */
export async function getEnrollmentView(enrollmentId: ID, forCustomerId?: ID): Promise<EnrollmentView | null> {
  const id = asId(enrollmentId)
  if (id === null) return null
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "enrollments",
    where: { id: { equals: id } },
    depth: 1,
    limit: 1,
    overrideAccess: true,
    populate: { orders: { number: true, customer: true, items: true, refunds: true } },
  })
  const e = docs[0] as Enrollment | undefined
  if (!e) return null
  if (forCustomerId === undefined) return toView(e, null)
  const viewer = asId(forCustomerId)
  const view = viewer === null ? null : toView(e, viewer)
  return view && (view.isOwnSeat || view.bookedByMe) ? view : null
}

/** CONTRACT §4: own seats + every seat in orders I bought. Newest first, then seat order. */
export async function listCustomerEnrollments(customerId: ID): Promise<EnrollmentView[]> {
  const viewer = asId(customerId)
  if (viewer === null) return []
  const payload = await getPayload()
  const where: Where = { or: [{ customer: { equals: viewer } }, { "order.customer": { equals: viewer } }] }
  const { docs } = await payload.find({
    collection: "enrollments",
    where,
    depth: 1,
    pagination: false,
    // newest order first (ids are monotonic), then seat order within the order
    sort: ["-order", "attendeeIndex"],
    overrideAccess: true,
    populate: { orders: { number: true, customer: true, items: true, refunds: true } },
  })
  return (docs as Enrollment[]).map((e) => toView(e, viewer)).filter((v): v is EnrollmentView => v !== null)
}

const LISTED_ORDER_STATUSES = ["paid", "refunded", "partially_refunded"] as const

/** CONTRACT §4 `listCustomerOrders`: the buyer's paid / refunded / partially refunded orders, newest first. */
export async function listCustomerOrders(customerId: ID): Promise<OrderSummary[]> {
  const buyer = asId(customerId)
  if (buyer === null) return []
  const payload = await getPayload()
  const { docs } = await payload.find({
    collection: "orders",
    where: { and: [{ customer: { equals: buyer } }, { status: { in: [...LISTED_ORDER_STATUSES] } }] },
    depth: 0,
    pagination: false,
    sort: ["-paidAt", "-createdAt"],
    overrideAccess: true,
  })
  return (docs as Order[]).map((o) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    paidAt: o.paidAt ?? null,
    total: Number(o.total),
    currency: "cad",
    items: (o.items ?? []).map((it) => {
      const sessionId = relNum(it.session)
      return {
        courseId: relNum(it.course) as number,
        ...(sessionId !== null ? { sessionId } : {}),
        quantity: Number(it.quantity),
        description: it.description ?? "",
      }
    }),
    hasReceipt: Boolean(o.invoicePdfUrl),
  }))
}
