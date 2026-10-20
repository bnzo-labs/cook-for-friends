import type { CollectionConfig, TaskConfig } from "payload"

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

/** Payload Jobs Queue tasks owned by commerce (W2-08 fills). */
export const commerceJobTasks: TaskConfig[] = []
