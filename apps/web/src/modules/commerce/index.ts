import type { CollectionConfig } from "payload"

import { DiscountCodes } from "./collections/discount-codes"
import { Enrollments } from "./collections/enrollments"
import { Orders } from "./collections/orders"
import { ProcessedStripeEvents } from "./collections/processed-stripe-events"
import { SeatHolds } from "./collections/seat-holds"

export const commerceCollections: CollectionConfig[] = [
  Orders,
  SeatHolds,
  Enrollments,
  DiscountCodes,
  ProcessedStripeEvents,
]
