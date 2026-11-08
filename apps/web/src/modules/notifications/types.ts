/**
 * notifications/types.ts — public types per CONTRACT §4 + CCR-W2-3 + CCR-W2-6.
 * Do not modify without an orchestrator decision.
 */
import type { ISODate } from "@/modules/_shared"

export type EmailTemplate =
  | "magic-link"
  | "order-confirmation"
  | "enrollment-confirmation"
  | "reminder"
  | "waitlist-seat-available"
  | "cancellation-confirmation"
  | "refund-issued"
  | "oversell-refund"
  | "certificate-issued"
  | "comment-approved"

type Location = {
  name: string
  address: string
  city: string
  postalCode?: string
  mapsUrl?: string
}

/** Attachment to include in an outbound email (e.g. .ics file). */
export type Attachment = {
  filename: string
  /** UTF-8 string or base64-encoded bytes. */
  content: string
  contentType: string
}

/** Input for building a single calendar event (RFC 5545 VEVENT). */
export type IcsInput = {
  uid: string
  title: string
  description: string
  location: string
  /** ISO 8601 UTC date-time string. */
  startsAt: ISODate
  /** ISO 8601 UTC date-time string. */
  endsAt: ISODate
  url: string
}

/**
 * Per-template data shapes. CONTRACT §4.
 * Wave 2 defines the first 5 entries; Wave 3 will add the rest.
 */
export type EmailData = {
  "magic-link": {
    link: string
    expiresInMinutes: number
  }
  "order-confirmation": {
    orderNumber: string
    customerFirstName?: string
    items: {
      title: string
      /** CCR-W2-6 */
      quantity: number
      sessionStartsAt?: ISODate
      sessionEndsAt?: ISODate
      location?: Location
      /** Total line amount in cents (quantity × unit). */
      amount: number
      /** CCR-W2-6: guest attendees booked by the buyer (index ≥ 1). */
      attendees?: { name: string; email: string }[]
    }[]
    subtotal: number
    discountTotal: number
    taxTotal: number
    total: number
    currency: "cad"
    receiptUrl?: string
    contactEmail?: string
  }
  /** CCR-W2-6: guest-seat notice sent to each attendee (index ≥ 1). */
  "enrollment-confirmation": {
    attendeeFirstName?: string
    buyerName: string
    courseTitle: string
    sessionStartsAt: ISODate
    sessionEndsAt: ISODate
    location: Location
    contactEmail?: string
  }
  "oversell-refund": {
    orderNumber: string
    courseTitle: string
    sessionStartsAt: ISODate
    /** CCR-W2-6: number of seats that were refunded. */
    quantity: number
    refundAmount: number
    currency: "cad"
  }
  "refund-issued": {
    orderNumber: string
    refundAmount: number
    currency: "cad"
    full: boolean
  }
  // Wave 3 templates — data types TBD; calling sendEmail for these returns VALIDATION.
  reminder: Record<string, never>
  "waitlist-seat-available": Record<string, never>
  "cancellation-confirmation": Record<string, never>
  "certificate-issued": Record<string, never>
  "comment-approved": Record<string, never>
}

/** Wave 2 templates that have real implementations. */
export const WAVE2_TEMPLATES = new Set<EmailTemplate>([
  "magic-link",
  "order-confirmation",
  "enrollment-confirmation",
  "oversell-refund",
  "refund-issued",
] as const)
