import type { CollectionConfig, TaskConfig } from "payload"

import { DiscountCodes } from "./collections/discount-codes"
import { Enrollments } from "./collections/enrollments"
import { Orders } from "./collections/orders"
import { ProcessedStripeEvents } from "./collections/processed-stripe-events"
import { SeatHolds } from "./collections/seat-holds"
import { syncJobTasks } from "./sync"

export const commerceCollections: CollectionConfig[] = [
  Orders,
  SeatHolds,
  Enrollments,
  DiscountCodes,
  ProcessedStripeEvents,
]

/** Payload Jobs Queue tasks owned by commerce (CCR-W2-4/5). W2-08 fills `syncJobTasks`. */
export const commerceJobTasks: TaskConfig[] = [...syncJobTasks]

// Seat availability, holds, Checkout (CONTRACT §4, W2-04)
export { getAvailableSeats } from "./server/availability"
export { createCheckout } from "./server/checkout"
export { releaseCartHolds } from "./server/holds"
export { expireStaleHolds } from "./server/expire"
export type { AttendeeInput, CartLine, CheckoutMetadata, CheckoutResult, CreateCheckoutInput, ExpireResult } from "./types"

// HTTP helpers for src/app/api/{checkout,cart}/** route handlers
export {
  CART_COOKIE,
  cartCookieHeader,
  moduleErrorResponse,
  newCartToken,
  readCartToken,
} from "./server/http"

// Sub-barrels owned by W2-07 (webhook), W2-08 (sync), W2-09 (attendees)
export * from "./sync"
export * from "./webhook"
export * from "./attendees"
