import type { ID, ISODate } from "@/modules/_shared"

/** Guest seat (attendee index >= 1). Buyer is always attendee #0. CONTRACT §4 (CCR-W2-6). */
export type AttendeeInput = { firstName: string; lastName: string; email: string }

/** Wave 2: exactly one line per checkout. `attendees` = guests only. */
export type CartLine = { courseId: ID; sessionId?: ID; quantity: number; attendees?: AttendeeInput[] }

export type CreateCheckoutInput = {
  cart: CartLine[]
  locale: "fr" | "en"
  customerEmail?: string
  cartToken: string
}

export type CheckoutResult = { checkoutUrl: string; holdIds: ID[]; holdExpiresAt: ISODate }

export type ExpireResult = { expired: number; checkoutSessionsExpired: number }

/**
 * Stripe metadata written on the Checkout session, its PaymentIntent and its
 * invoice. W2-07 relies on these exact keys. Never carries guest PII.
 */
export type CheckoutMetadata = {
  cartToken: string
  holdId?: string
  courseId: string
  sessionId?: string
  locale: "fr" | "en"
  quantity: string
}

// ---------------------------------------------------------------------------
// CCR-W3-4 (W3-09) — seat operations. CONTRACT §4. Policy is scheduling's.
// ---------------------------------------------------------------------------

export type EnrollmentStatus = "confirmed" | "cancelled" | "refunded"
export type Attendance = "unknown" | "present" | "absent"
export type CancellationOutcome = "refund" | "credit" | "none"

export type EnrollmentView = {
  id: ID
  sessionId: ID
  courseId: ID
  orderId: ID
  orderNumber: string
  buyerCustomerId: ID
  attendeeCustomerId: ID
  attendeeIndex: number
  attendeeName: string | null
  seatAmount: number
  refundedAmount: number
  status: EnrollmentStatus
  attendance: Attendance
  cancelledAt: ISODate | null
  cancellationOutcome: CancellationOutcome | null
  /** W4-03b (L-2): amount decided at cancel time (cents); null on seats cancelled before W4-03b. */
  cancellationAmount: number | null
  /** Relative to the customer asked about. */
  isOwnSeat: boolean
  bookedByMe: boolean
}

export type OrderSummary = {
  id: ID
  number: string
  status: "paid" | "refunded" | "partially_refunded" | "cancelled" | "pending"
  paidAt: ISODate | null
  total: number
  currency: "cad"
  items: { courseId: ID; sessionId?: ID; quantity: number; description: string }[]
  hasReceipt: boolean
}

export type ExecuteSeatCancellationInput = {
  enrollmentId: ID
  outcome: CancellationOutcome
  amount: number
  by: "customer" | "staff"
  actorId: ID
  reason: string
}

export type SeatCancellationResult = {
  enrollmentStatus: "cancelled" | "refunded"
  refundRequested: boolean
  /** W4-03b (L-2): the executed decision. On a retry this is the persisted one, not the caller's input. */
  outcome: CancellationOutcome
  amount: number
  /** True when this call only retried a pending refund of an already-cancelled seat. */
  retry: boolean
  creditCode?: string
  creditExpiresAt?: ISODate
}
