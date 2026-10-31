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
